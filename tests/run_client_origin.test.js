/* The transport: where it goes, and how it reads a stream.
 *
 * The origin assertion is the one that has to be written before anything is
 * proposed rather than after: a font, an icon CDN or a "check for updates"
 * call each look harmless in review and each make this page reach a second
 * origin. Intercepting `fetch` and asserting every request's base is what
 * turns that from a review posture into a failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe as suite, it, expect, beforeEach, vi } from 'vitest';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const RUN_DIR = path.resolve(HERE, '../src');
const FIXTURES = path.resolve(HERE, 'fixtures/postern_describe');
const MODULES = ['postern_client.js', 'run_view_model.js', 'refusal_copy.js', 'run_renderer.js'];

function loadRenderer() {
  MODULES.forEach(name => {
    // eslint-disable-next-line no-new-func
    new Function(fs.readFileSync(path.join(RUN_DIR, name), 'utf8')).call(window);
  });
  return window.Gatehouse;
}

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

function jsonResponse(body, status) {
  return {
    ok: (status || 200) < 400,
    status: status || 200,
    json: () => Promise.resolve(body),
  };
}

/* A body reader that hands back exactly the chunks it was given, so a test can
 * split an SSE frame across reads the way a real network does. */
function streamResponse(chunks) {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: () =>
          Promise.resolve(
            index < chunks.length
              ? { done: false, value: encoder.encode(chunks[index++]) }
              : { done: true, value: undefined }
          ),
        releaseLock: () => {},
      }),
    },
  };
}

beforeEach(() => {
  delete window.Gatehouse;
});

suite('every request goes to the base URL and nowhere else', () => {
  it('addresses the four verbs under the protocol prefix', async () => {
    const NS = loadRenderer();
    const seen = [];
    const fetchImpl = vi.fn((url, init) => {
      seen.push({ url, init });
      if (String(url).endsWith('/describe')) return Promise.resolve(jsonResponse(fixture('pipeline_crew.describe.json')));
      if (String(url).endsWith('/status')) return Promise.resolve(jsonResponse(fixture('pipeline_crew.status.json')));
      return Promise.resolve(jsonResponse({ run_id: 'r', output: { type: 'text', value: 'x' } }));
    });

    const client = new NS.PosternClient('https://runner.example/', { fetchImpl });
    await client.describe();
    await client.status();
    await client.run({ prompt: 'hi' });

    expect(seen.map(entry => entry.url)).toEqual([
      'https://runner.example/postern/v0/describe',
      'https://runner.example/postern/v0/status',
      'https://runner.example/postern/v0/run',
    ]);
    seen.forEach(entry => {
      expect(String(entry.url).startsWith('https://runner.example/')).toBe(true);
    });
  });

  it('reaches no second origin while a whole page loads and runs', async () => {
    const NS = loadRenderer();
    const origins = new Set();
    const fetchImpl = vi.fn(url => {
      origins.add(new URL(String(url)).origin);
      if (String(url).endsWith('/describe')) return Promise.resolve(jsonResponse(fixture('pipeline_crew.describe.json')));
      if (String(url).endsWith('/status')) return Promise.resolve(jsonResponse(fixture('pipeline_crew.status.json')));
      return Promise.resolve(streamResponse([
        'event: done\ndata: {"output":{"type":"text","value":"ok"}}\n\n',
      ]));
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const renderer = new NS.RunRenderer(
      container,
      new NS.PosternClient('https://runner.example', { fetchImpl })
    );
    await renderer.load();
    await renderer.start({});

    expect(Array.from(origins)).toEqual(['https://runner.example']);
  });

  it('trims a trailing slash rather than doubling it', async () => {
    const NS = loadRenderer();
    const client = new NS.PosternClient('https://runner.example///', { fetchImpl: () => Promise.resolve(jsonResponse({})) });
    expect(client.url('/status')).toBe('https://runner.example/postern/v0/status');
  });
});

suite('a POST is framed the way a runner insists on', () => {
  it('sends application/json, which is what makes a browser preflight it', async () => {
    const NS = loadRenderer();
    let init = null;
    const client = new NS.PosternClient('https://runner.example', {
      fetchImpl: (url, options) => {
        init = options;
        return Promise.resolve(jsonResponse({ run_id: 'r', output: { type: 'text', value: 'x' } }));
      },
    });
    await client.run({ prompt: 'hi' });
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ inputs: { prompt: 'hi' } });
  });

  it('sends an Idempotency-Key only when it is given one', async () => {
    const NS = loadRenderer();
    const inits = [];
    const client = new NS.PosternClient('https://runner.example', {
      fetchImpl: (url, options) => {
        inits.push(options);
        return Promise.resolve(jsonResponse({ run_id: 'r', output: { type: 'text', value: 'x' } }));
      },
    });
    await client.run({}, {});
    await client.run({}, { idempotencyKey: 'k-1' });
    expect(inits[0].headers['Idempotency-Key']).toBeUndefined();
    expect(inits[1].headers['Idempotency-Key']).toBe('k-1');
  });
});

suite('the stream is read with a body reader', () => {
  it('constructs no EventSource, and no retry loop around the reader', () => {
    // It cannot POST and it reconnects on its own, which SPEC 4.5 names as
    // the way a client spends someone's money twice.
    //
    // Asserted on *use*, not on the word: the client's own docstring explains
    // at length why this API is out, and a bare substring scan reads that
    // explanation as the violation it warns against. Comments are stripped
    // first so the prose can go on saying so.
    MODULES.forEach(name => {
      const source = fs.readFileSync(path.join(RUN_DIR, name), 'utf8');
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(code).not.toContain('EventSource');
      expect(code).not.toMatch(/setTimeout\s*\([^)]*stream/i);
    });
  });

  it('reassembles a frame split across reads', async () => {
    const NS = loadRenderer();
    const events = [];
    const client = new NS.PosternClient('https://runner.example', {
      fetchImpl: () => Promise.resolve(streamResponse([
        'event: delta\ndata: {"te',
        'xt":"half and "}\n\nevent: delta\ndata: {"text":"half"}\n\n',
      ])),
    });
    await client.stream({}, { onEvent: event => events.push(event) });
    expect(events.map(e => e.payload.text)).toEqual(['half and ', 'half']);
  });

  it('ignores a keep-alive comment line', async () => {
    // A proxy sends them to hold the connection open through an idle timeout,
    // so they are expected traffic rather than a malformed frame.
    const NS = loadRenderer();
    const events = [];
    const client = new NS.PosternClient('https://runner.example', {
      fetchImpl: () => Promise.resolve(streamResponse([
        ': keep-alive\n\nevent: done\ndata: {"output":{"type":"text","value":"ok"}}\n\n',
      ])),
    });
    await client.stream({}, { onEvent: event => events.push(event) });
    expect(events.length).toBe(1);
    expect(events[0].name).toBe('done');
  });
});

suite('a refusal arrives as the envelope', () => {
  it('carries status, code, message and detail', async () => {
    const NS = loadRenderer();
    const client = new NS.PosternClient('https://runner.example', {
      fetchImpl: () => Promise.resolve(jsonResponse(
        { error: { code: 'run_timeout', message: 'Too long.', detail: { max_run_seconds: 300 } } },
        504
      )),
    });
    await expect(client.run({})).rejects.toMatchObject({
      name: 'PosternRefusal',
      status: 504,
      code: 'run_timeout',
      message: 'Too long.',
      detail: { max_run_seconds: 300 },
    });
  });

  it('says so when something other than a runner is answering the URL', async () => {
    const NS = loadRenderer();
    const client = new NS.PosternClient('https://runner.example', {
      fetchImpl: () => Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.reject(new Error('not json')),
      }),
    });
    await expect(client.run({})).rejects.toMatchObject({ name: 'PosternUnreachable' });
  });
});
