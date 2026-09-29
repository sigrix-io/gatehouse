/* Running an agent: stream, run, stop, retry, and every refusal.
 *
 * The rules under test are the ones that cost money when they are wrong. A
 * reopened stream is a new run (SPEC 4.5), a reused idempotency key with
 * edited inputs is a 409 (4.2), and a `cost_usd` shown without the word
 * "advisory" is a number a buyer will read as a bill (4.2 forbids exactly
 * that reading).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe as suite, it, expect, beforeEach } from 'vitest';

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

/* The crew document: its write_tools is empty, so Run is live without a
 * confirmation click and these tests are about the run rather than the gate. */
function crew() {
  return { describe: fixture('pipeline_crew.describe.json'), status: fixture('pipeline_crew.status.json') };
}

async function mount(overrides, statusPatch, options) {
  const NS = loadRenderer();
  const docs = crew();
  if (statusPatch) Object.assign(docs.status, statusPatch);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const client = Object.assign(
    {
      describe: () => Promise.resolve(docs.describe),
      status: () => Promise.resolve(docs.status),
      run: () => Promise.resolve({ run_id: 'r-1', output: { type: 'text', value: 'whole' } }),
      stream: () => Promise.resolve(),
    },
    overrides || {}
  );
  const renderer = new NS.RunRenderer(container, client, options);
  await renderer.load();
  return { NS, container, renderer, client };
}

/* Feeds a scripted event list to whatever the renderer passed as `onEvent`. */
function streamOf(events) {
  return (inputs, options) => {
    events.forEach(event => options.onEvent(event));
    return Promise.resolve();
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.Gatehouse;
});

suite('a level 3 run streams', () => {
  it('renders the step timeline and appends each delta', async () => {
    const { container, renderer } = await mount({
      stream: streamOf([
        { name: 'start', payload: { run_id: 'run-7' } },
        { name: 'step', payload: { name: 'research', phase: 'started' } },
        { name: 'step', payload: { name: 'research', phase: 'finished', latency_ms: 1200, model_id: 'gpt-4o-mini' } },
        { name: 'delta', payload: { text: 'Clauses ' } },
        { name: 'delta', payload: { text: 'to review.' } },
        { name: 'done', payload: { run_id: 'run-7', output: { type: 'text', value: 'Clauses to review.' } } },
      ]),
    });
    await renderer.start({});

    const timeline = Array.from(container.querySelectorAll('.run-timeline-entry')).map(n => n.textContent);
    expect(timeline[0]).toContain('Run started');
    expect(timeline[1]).toContain('research · started');
    // latency_ms arrives on `finished` only, and model_id when a model was called.
    expect(timeline[2]).toContain('1200ms');
    expect(timeline[2]).toContain('gpt-4o-mini');
    expect(container.querySelector('.run-result').textContent).toBe('Clauses to review.');
  });

  it('replaces the streamed text when done disagrees, and says it did', async () => {
    // SPEC 4.3's SHOULD, applied in full: this client can replace what it
    // rendered, so it does, and the buyer is told which text they are reading.
    const { container, renderer } = await mount({
      stream: streamOf([
        { name: 'delta', payload: { text: 'partial guess' } },
        { name: 'done', payload: { output: { type: 'text', value: 'the corrected result' } } },
      ]),
    });
    await renderer.start({});
    expect(container.querySelector('.run-result').textContent).toBe('the corrected result');
    expect(container.querySelector('.run-notice').textContent).toContain('superseded');
  });

  it('says nothing about superseding when the deltas rebuild the result exactly', async () => {
    const { container, renderer } = await mount({
      stream: streamOf([
        { name: 'delta', payload: { text: 'all ' } },
        { name: 'delta', payload: { text: 'of it' } },
        { name: 'done', payload: { output: { type: 'text', value: 'all of it' } } },
      ]),
    });
    await renderer.start({});
    expect(container.querySelector('.run-notice').textContent).toBe('');
  });

  it('skips an event name it does not recognise', async () => {
    // A later minor release may add one; a client that threw would break on it.
    const { container, renderer } = await mount({
      stream: streamOf([
        { name: 'heartbeat', payload: { at: 1 } },
        { name: 'delta', payload: { text: 'kept' } },
        { name: 'done', payload: { output: { type: 'text', value: 'kept' } } },
      ]),
    });
    await renderer.start({});
    expect(container.querySelector('.run-result').textContent).toBe('kept');
  });

  it('reports an error event without a status code, since the response was already 200', async () => {
    const { container, renderer } = await mount({
      stream: streamOf([
        { name: 'start', payload: { run_id: 'run-9' } },
        { name: 'error', payload: { error: { code: 'agent_error', message: 'The model refused.', detail: null } } },
      ]),
    });
    await renderer.start({});
    const notice = container.querySelector('.run-notice').textContent;
    expect(notice).toContain('The model refused.');
    expect(notice).toContain('run-9');
  });
});

suite('a level 2 run returns the whole result', () => {
  it('shows a plain running state rather than a timeline it cannot have', async () => {
    // There is no run id until the response, so there is nothing to build a
    // timeline from — and inventing one would be a client claiming to know
    // more about the run than the protocol told it.
    const { container, renderer } = await mount({}, { level: 2 });
    await renderer.start({});
    expect(container.querySelector('.run-result').textContent).toBe('whole');
    expect(container.querySelectorAll('.run-timeline-entry').length).toBe(0);
  });
});

suite('the output type decides how a result is shown', () => {
  it('names an unrecognised type and does not report the run as failed', async () => {
    // SPEC 4.1.4: the one unknown a client may not simply ignore — and it may
    // not present the value as text or call the run a failure either.
    const { container, renderer } = await mount({
      run: () => Promise.resolve({ run_id: 'r', output: { type: 'video', value: 'AAAA' } }),
    }, { level: 2 });
    await renderer.start({});
    const notice = container.querySelector('.run-notice').textContent;
    expect(notice).toContain('video');
    expect(notice).toContain('succeeded');
    expect(container.querySelector('.run-result').textContent).toBe('');
  });

  it('offers bytes as a file and never as text', async () => {
    window.URL.createObjectURL = () => 'blob:stub';
    const { container, renderer } = await mount({
      run: () => Promise.resolve({
        run_id: 'r',
        output: { type: 'bytes', value: 'aGVsbG8=', media_type: 'application/pdf' },
      }),
    }, { level: 2 });
    await renderer.start({});
    expect(container.querySelector('.run-result').textContent).toBe('');
    const link = container.querySelector('.run-download');
    expect(link).toBeTruthy();
    expect(link.textContent).toContain('application/pdf');
    // The base64 itself never reaches the page as readable text.
    expect(container.textContent).not.toContain('aGVsbG8=');
  });
});

suite('a second run does not inherit the first one\u2019s leftovers', () => {
  it('leaves one download link after two bytes runs, not two', async () => {
    // The link is appended beside the result rather than inside it, so
    // clearing the result does not remove it. Two links, the older pointing
    // at the earlier result, with nothing on either saying which is which.
    window.URL.createObjectURL = () => 'blob:stub';
    window.URL.revokeObjectURL = () => {};
    const { container, renderer } = await mount({
      run: () => Promise.resolve({
        run_id: 'r',
        output: { type: 'bytes', value: 'aGVsbG8=', media_type: 'application/pdf' },
      }),
    }, { level: 2 });
    await renderer.start({});
    await renderer.start({});
    expect(container.querySelectorAll('.run-download').length).toBe(1);
  });

  it('clears a field marked invalid once the run is retried', async () => {
    const NS = loadRenderer();
    const container = document.createElement('div');
    document.body.appendChild(container);
    let refuse = true;
    const renderer = new NS.RunRenderer(container, {
      describe: () => Promise.resolve(fixture('pipeline_crew.describe.json')),
      status: () => Promise.resolve(Object.assign(fixture('pipeline_crew.status.json'), { level: 2 })),
      run: () => refuse
        ? Promise.reject(new NS.PosternRefusal(400, 'bad_request', 'no', { key: 'prompt' }))
        : Promise.resolve({ run_id: 'r', output: { type: 'text', value: 'ok' } }),
      stream: () => Promise.resolve(),
    });
    await renderer.load();

    await renderer.start({});
    expect(container.querySelector('[name="prompt"]').className).toContain('is-invalid');

    refuse = false;
    await renderer.start({});
    // A corrected input must stop wearing the error that has just been fixed.
    expect(container.querySelector('[name="prompt"]').className).not.toContain('is-invalid');
  });
});

suite('agent output is text, never markup', () => {
  it('renders a scripted result as literal characters', async () => {
    const hostile = '<img src=x onerror="window.__ran=1">';
    const { container, renderer } = await mount({
      run: () => Promise.resolve({ run_id: 'r', output: { type: 'text', value: hostile } }),
    }, { level: 2 });
    await renderer.start({});
    expect(container.querySelector('.run-result').textContent).toBe(hostile);
    expect(container.querySelector('.run-result').querySelector('img')).toBeNull();
    expect(window.__ran).toBeUndefined();
  });

  it('renders a scripted delta as literal characters too', async () => {
    const hostile = '<script>window.__delta=1</script>';
    const { container, renderer } = await mount({
      stream: streamOf([
        { name: 'delta', payload: { text: hostile } },
        { name: 'done', payload: { output: { type: 'text', value: hostile } } },
      ]),
    });
    await renderer.start({});
    expect(container.querySelector('.run-result').textContent).toBe(hostile);
    expect(container.querySelector('.run-result').querySelector('script')).toBeNull();
    expect(window.__delta).toBeUndefined();
  });
});

suite('usage is advisory', () => {
  it('labels cost so it cannot be read as a bill', async () => {
    const { container, renderer } = await mount({
      run: () => Promise.resolve({
        run_id: 'r',
        output: { type: 'text', value: 'x' },
        usage: { input_tokens: 100, output_tokens: 20, cost_usd: 0.004 },
      }),
    }, { level: 2 });
    await renderer.start({});
    const usage = container.querySelector('.run-usage').textContent;
    expect(usage).toContain('advisory');
    expect(usage).toContain('not a bill');
    expect(usage).toContain('0.004');
  });
});

suite('stopping is a disconnect', () => {
  it('aborts the request and says the run was cancelled', async () => {
    let seenSignal = null;
    const { container, renderer } = await mount({
      stream: (inputs, options) => new Promise((resolve, reject) => {
        seenSignal = options.signal;
        options.signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }),
    });
    const running = renderer.start({});
    renderer.stop();
    await running;
    expect(seenSignal).toBeTruthy();
    expect(seenSignal.aborted).toBe(true);
    expect(container.querySelector('.run-notice').textContent).toContain('Stopped');
  });
});

suite('retry follows the idempotency rules', () => {
  it('reuses the key for an unchanged retry and mints a new one after an edit', async () => {
    const keys = [];
    const doc = fixture('pipeline_crew.describe.json');
    doc.capabilities.idempotent_retry = true;
    const NS = loadRenderer();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const renderer = new NS.RunRenderer(container, {
      describe: () => Promise.resolve(doc),
      status: () => Promise.resolve(fixture('pipeline_crew.status.json')),
      run: () => Promise.resolve({ run_id: 'r', output: { type: 'text', value: 'x' } }),
      stream: (inputs, options) => {
        keys.push(options.idempotencyKey);
        options.onEvent({ name: 'done', payload: { output: { type: 'text', value: 'x' } } });
        return Promise.resolve();
      },
    });
    await renderer.load();

    await renderer.start({});
    await renderer.start({ reuseKey: true });
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);

    // An edit makes the held key stale — the runner would answer 409.
    const control = container.querySelector('[name="prompt"]');
    control.value = 'something else';
    control.dispatchEvent(new window.Event('input'));
    await renderer.start({ reuseKey: true });
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('sends no key at all when the runner has not promised a free replay', async () => {
    // Absent and false are read identically (SPEC 4.2).
    const keys = [];
    const { renderer } = await mount({
      stream: (inputs, options) => {
        keys.push(options.idempotencyKey);
        options.onEvent({ name: 'done', payload: { output: { type: 'text', value: 'x' } } });
        return Promise.resolve();
      },
    });
    await renderer.start({});
    expect(keys[0]).toBe('');
  });

  it('warns that Retry executes the agent again where replays are not free', async () => {
    const { container } = await mount({});
    expect(container.querySelector('.run-retry-note').textContent).toContain('runs the agent again');
  });
});

suite('every refusal in the table has its next move', () => {
  const refusals = [
    ['bad_request', 400, { key: 'prompt' }, 'highlighted field'],
    ['missing_credential', 424, { missing: ['OPENAI_API_KEY'] }, '.env'],
    ['not_entitled', 403, null, 'ended or could not be confirmed'],
    ['unavailable', 503, null, 'try again'],
    ['run_timeout', 504, { max_run_seconds: 300 }, '300 seconds'],
    ['not_implemented', 501, null, 'Retrying will not help'],
    ['agent_error', 500, null, 'ran and failed'],
    ['unauthorized', 401, null, 'authorization token'],
  ];

  refusals.forEach(([code, status, detail, expected]) => {
    it(`adds a next move to ${code}`, async () => {
      const NS = loadRenderer();
      const container = document.createElement('div');
      document.body.appendChild(container);
      const renderer = new NS.RunRenderer(container, {
        describe: () => Promise.resolve(fixture('pipeline_crew.describe.json')),
        status: () => Promise.resolve(fixture('pipeline_crew.status.json')),
        run: () => Promise.reject(new NS.PosternRefusal(status, code, 'The runner said so.', detail)),
        stream: () => Promise.reject(new NS.PosternRefusal(status, code, 'The runner said so.', detail)),
      });
      await renderer.load();
      await renderer.start({});
      const notice = container.querySelector('.run-notice').textContent;
      // The runner's own sentence, verbatim, always.
      expect(notice).toContain('The runner said so.');
      expect(notice.toLowerCase()).toContain(String(expected).toLowerCase());
    });
  });

  it('highlights the input a bad_request names', async () => {
    const NS = loadRenderer();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const renderer = new NS.RunRenderer(container, {
      describe: () => Promise.resolve(fixture('pipeline_crew.describe.json')),
      status: () => Promise.resolve(fixture('pipeline_crew.status.json')),
      run: () => Promise.reject(new NS.PosternRefusal(400, 'bad_request', 'no', { key: 'prompt' })),
      stream: () => Promise.reject(new NS.PosternRefusal(400, 'bad_request', 'no', { key: 'prompt' })),
    });
    await renderer.load();
    await renderer.start({});
    expect(container.querySelector('[name="prompt"]').className).toContain('is-invalid');
  });

  it('degrades an unrecognised code to its status class and still shows the message', async () => {
    const NS = loadRenderer();
    const guidance = NS.refusalGuidance(
      new NS.PosternRefusal(503, 'some_future_code', 'Not yet.', null), {}
    );
    expect(guidance.nextMove).toContain('Trying again may help');
    expect(guidance.canRetry).toBe(true);
  });

  it('has no copy for the two codes only a distributor can emit', async () => {
    // SPEC 2.1 marks `withdrawn` and the distributor's `not_found` side `D`.
    // One arriving here lands in the status-class arm, which is the honest
    // answer rather than copy invented for a case that cannot occur.
    const NS = loadRenderer();
    const source = fs.readFileSync(path.join(RUN_DIR, 'refusal_copy.js'), 'utf8');
    expect(source).not.toContain("code === 'withdrawn'");
    expect(source).not.toContain("code === 'not_found'");
  });
});

suite('a hosted run does not quote the provider back to the buyer', () => {
  /* OpenAI's own 401, worded and masked by them — the runner only passed it
   * through. On a hosted run it would show a paying customer the last four
   * characters of the operator's key, and a link to a dashboard they have no
   * account on. The key's tail here is made up. */
  const PROVIDER_401 =
    "Error code: 401 - {'error': {'message': 'Incorrect API key provided: sk-proj-****Ab3D. " +
    "You can find your API key at https://platform.openai.com/account/api-keys.', " +
    "'type': 'invalid_request_error', 'code': 'invalid_api_key'}}";

  /* One failure, two deployments. Driving both is the whole test: a hosted-only
   * assertion passes just as happily against a renderer that has stopped
   * relaying errors at all, which would silently break the self-hosted page —
   * where the reader owns the runner and the provider's sentence is the most
   * useful thing this page can say. */
  async function run(hosted, code, message) {
    const refuse = () => Promise.reject(new window.Gatehouse.PosternRefusal(500, code, message, null));
    const mounted = await mount({ run: refuse, stream: refuse }, null, hosted ? { hosted: true } : undefined);
    await mounted.renderer.start({});
    return mounted.container.querySelector('.run-notice').textContent;
  }

  it('relays the runner on a self-hosted mount and withholds it on a hosted one', async () => {
    const selfHosted = await run(false, 'agent_error', PROVIDER_401);
    const hosted = await run(true, 'agent_error', PROVIDER_401);

    expect(selfHosted).not.toBe(hosted);

    // S5's design, unchanged: the operator is the reader, so they get the
    // provider's own words — which name precisely what they must go and fix.
    expect(selfHosted).toContain('sk-proj-****Ab3D');
    expect(selfHosted).toContain('platform.openai.com');

    // Hosted: none of it. Not the key tail, not the dashboard, not the code.
    expect(hosted).not.toContain('sk-proj');
    expect(hosted).not.toContain('platform.openai.com');
    expect(hosted).not.toContain('invalid_api_key');
    expect(hosted).not.toContain('401');

    // The sentence that was always right stays, and it is the whole notice.
    expect(hosted.trim()).toBe('The agent ran and failed.');
  });

  it('withholds it on the streamed path too, which is how the real one arrived', async () => {
    // The pilot crew is level 3, so its failure came as an SSE `error` frame
    // through showStreamError rather than as a rejected `run`. Same renderer
    // path underneath; a fix wired only to the rejection would miss it.
    const events = [
      { name: 'start', payload: { run_id: 'run-42' } },
      { name: 'error', payload: { error: { code: 'agent_error', message: PROVIDER_401, detail: null } } },
    ];
    const selfHosted = await mount({ stream: streamOf(events) });
    await selfHosted.renderer.start({});
    const hosted = await mount({ stream: streamOf(events) }, null, { hosted: true });
    await hosted.renderer.start({});

    const selfText = selfHosted.container.querySelector('.run-notice').textContent;
    const hostedText = hosted.container.querySelector('.run-notice').textContent;

    expect(selfText).toContain('sk-proj-****Ab3D');
    expect(hostedText).not.toContain('sk-proj');
    // The run id survives — it is the thread that ties the buyer's report to
    // the trace an operator can read the suppressed sentence in.
    expect(hostedText).toContain('run-42');
  });

  it("answers a hosted 401 with the platform's sentence alone", async () => {
    // On a hosted run the runner refusing is the platform's proxy, and what
    // failed is the buyer's sign-in, so "whoever deployed it can supply one"
    // would point the buyer back at us. Self-hosted, the operator is the
    // reader, and the credential is theirs to supply.
    const SIGNED_OUT = 'You are not signed in to Sigrix, so this agent cannot run. Sign in, then reload this page.';
    const hosted = await run(true, 'unauthorized', SIGNED_OUT);
    const selfHosted = await run(false, 'unauthorized', SIGNED_OUT);

    expect(hosted.trim()).toBe(SIGNED_OUT);
    expect(selfHosted).toContain(SIGNED_OUT);
    expect(selfHosted).toContain('authorization token');
  });

  it('leaves every other refusal relaying the runner verbatim, hosted or not', async () => {
    // Scoped to agent_error on purpose. The rest describe the request or the
    // runner's own configuration, and a buyer can act on those in either
    // deployment — widening the suppression would take away the page's
    // usefulness to fix a leak only one arm can carry.
    const others = ['bad_request', 'missing_credential', 'not_entitled', 'unavailable',
      'run_timeout', 'not_implemented', 'unauthorized'];
    for (const code of others) {
      const hosted = await run(true, code, 'The runner said so.');
      expect(hosted, code).toContain('The runner said so.');
    }
  });

  it('is off unless the page says so, and a proxy base is not the page saying so', async () => {
    // `data-proxy-base` is a coincidence of this deployment. If the flag ever
    // came to be inferred from it, a self-hosted page put behind any proxy
    // would silently stop relaying its own runner's errors.
    const source = fs.readFileSync(path.join(RUN_DIR, 'run_renderer.js'), 'utf8');
    expect(source).not.toContain('proxyBase');
    expect(source).not.toContain('data-proxy-base');
    const relayed = await run(false, 'agent_error', PROVIDER_401);
    expect(relayed).toContain('sk-proj-****Ab3D');
  });
});
