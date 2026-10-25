/* A conversation on the run page: `options.conversation`.
 *
 * A run is independent of every other (SPEC 4.5), so an agent that ends on a
 * question leaves a one-run page nothing to answer it with, and each new brief
 * replaced the last answer on the page. With the option on, the page keeps each
 * brief and answer, and the next brief carries them, composed by the view
 * model's `conversationBrief`. The rules under test are the ones a reader
 * cannot see: what is sent, what is recorded as a turn, and what is left out
 * when the whole would pass its bound.
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

/* The crew document: a reserved `prompt`, a text `jurisdiction` and a select,
 * at level 3, with nothing to confirm before Run is live. */
function crew() {
  return { describe: fixture('pipeline_crew.describe.json'), status: fixture('pipeline_crew.status.json') };
}

/* Answers each run with the next of `answers` as a stream, recording what each
 * run was sent. An answer that is a function is called instead, for a refusal
 * or a stop. */
function scripted(answers) {
  const sent = [];
  let next = 0;
  function stream(inputs, options) {
    sent.push(inputs);
    const answer = answers[next++];
    if (typeof answer === 'function') return answer(options);
    options.onEvent({ name: 'start', payload: { run_id: 'run-' + next } });
    options.onEvent({ name: 'delta', payload: { text: String(answer) } });
    options.onEvent({ name: 'done', payload: { run_id: 'run-' + next, output: { type: 'text', value: String(answer) } } });
    return Promise.resolve();
  }
  function run(inputs) {
    sent.push(inputs);
    const answer = answers[next++];
    return Promise.resolve({ run_id: 'r-' + next, output: { type: 'text', value: String(answer) } });
  }
  return { sent, stream, run };
}

async function mount({ answers = [], options, statusPatch, describeDoc } = {}) {
  const NS = loadRenderer();
  const docs = crew();
  if (statusPatch) Object.assign(docs.status, statusPatch);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const script = scripted(answers);
  const client = {
    describe: () => Promise.resolve(describeDoc || docs.describe),
    status: () => Promise.resolve(docs.status),
    run: script.run,
    stream: script.stream,
  };
  const renderer = new NS.RunRenderer(container, client, options);
  await renderer.load();
  return { NS, container, renderer, sent: script.sent, vm: NS.viewModel };
}

/* What a reader does: type into the brief, then press Run. */
async function send(container, renderer, brief) {
  const field = container.querySelector('[name="prompt"]');
  field.value = brief;
  field.dispatchEvent(new Event('input'));
  await renderer.start({});
}

const turns = container =>
  Array.from(container.querySelectorAll('.run-turn')).map(turn => ({
    brief: turn.querySelector('.run-turn-brief').textContent,
    answer: turn.querySelector('.run-turn-answer').textContent,
  }));

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.Gatehouse;
  // As in run_presentation.test.js: jsdom 30.1+'s Blob bridge throws inside
  // URL.createObjectURL, and nothing here asserts on the URL itself.
  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => {};
});

suite('the conversation brief', () => {
  it('is the message as typed when nothing came before', () => {
    const vm = loadRenderer().viewModel;
    expect(vm.conversationBrief([], 'hello', 100)).toEqual({ value: 'hello', sent: 0, dropped: 0 });
  });

  it('carries every turn, oldest first, each said by whom, and the new message last', () => {
    const vm = loadRenderer().viewModel;
    const reply = vm.conversationBrief(
      [
        { brief: 'first brief', answer: 'first answer' },
        { brief: 'second brief', answer: 'second answer' },
      ],
      'the reply'
    );
    expect(reply.sent).toBe(2);
    expect(reply.dropped).toBe(0);
    const order = ['first brief', 'first answer', 'second brief', 'second answer', 'the reply'].map(part =>
      reply.value.indexOf(part)
    );
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(reply.value.endsWith('the reply')).toBe(true);
    expect(reply.value).toContain('The user wrote:\nfirst brief');
    expect(reply.value).toContain('You answered:\nfirst answer');
  });

  it('leaves the oldest turns out first when the whole would pass its bound, and says how many', () => {
    const vm = loadRenderer().viewModel;
    const history = [
      { brief: 'old brief', answer: 'x'.repeat(400) },
      { brief: 'recent brief', answer: 'recent answer' },
    ];
    const reply = vm.conversationBrief(history, 'the reply', 300);
    expect(reply).toMatchObject({ sent: 1, dropped: 1 });
    expect(reply.value).not.toContain('old brief');
    expect(reply.value).toContain('recent brief');
    expect(reply.value.length).toBeLessThanOrEqual(300);
  });

  it('never cuts the new message: when no turn fits, it goes alone', () => {
    const vm = loadRenderer().viewModel;
    const message = 'm'.repeat(250);
    const reply = vm.conversationBrief([{ brief: 'b', answer: 'a' }], message, 200);
    expect(reply).toEqual({ value: message, sent: 0, dropped: 1 });
  });

  it('bounds a host that names no limit at the view model default', () => {
    const vm = loadRenderer().viewModel;
    const history = [
      { brief: 'b1', answer: 'a'.repeat(vm.CONVERSATION_MAX_CHARS) },
      { brief: 'b2', answer: 'a2' },
    ];
    expect(vm.conversationBrief(history, 'reply').dropped).toBe(1);
  });
});

suite('a page with no conversation', () => {
  it('draws none, and every run sends its brief as typed', async () => {
    const { container, renderer, sent } = await mount({ answers: ['first answer', 'second answer'] });
    expect(container.querySelector('.run-conversation')).toBeNull();

    await send(container, renderer, 'first brief');
    await send(container, renderer, 'second brief');
    expect(sent.map(inputs => inputs.prompt)).toEqual(['first brief', 'second brief']);
    expect(container.querySelector('.run-result').textContent).toBe('second answer');
  });

  it('draws none for a runner with no text brief, whatever the host asked for', async () => {
    const docs = crew();
    const describeDoc = Object.assign({}, docs.describe, {
      inputs: docs.describe.inputs.filter(input => input.key !== 'prompt'),
    });
    const { container } = await mount({ options: { conversation: true }, describeDoc });
    expect(container.querySelector('.run-conversation')).toBeNull();
  });
});

suite('a conversation', () => {
  it('records the brief and its answer as a turn, and empties the box for the reply', async () => {
    const { container, renderer, sent } = await mount({
      answers: ['Ask about the indemnity first.'],
      options: { conversation: true },
    });
    const section = container.querySelector('.run-conversation');
    expect(section.hidden).toBe(true);

    await send(container, renderer, 'Review this MSA');
    expect(sent[0].prompt).toBe('Review this MSA');
    expect(turns(container)).toEqual([{ brief: 'Review this MSA', answer: 'Ask about the indemnity first.' }]);
    expect(section.hidden).toBe(false);
    expect(container.querySelectorAll('.run-turn-who')[1].textContent).toBe(renderer.viewModel.header.name);
    // The answer moved up, so the result panel holds it no longer.
    expect(container.querySelector('.run-result').textContent).toBe('');
    const field = container.querySelector('[name="prompt"]');
    expect(field.value).toBe('');
    expect(renderer.values.prompt).toBe('');
    expect(document.activeElement).toBe(field);
    expect(container.querySelector('.run-retry').disabled).toBe(true);
    expect(container.querySelector('.run-conversation-note').textContent).toContain('sends the conversation above');
  });

  it('sends the turns before a reply with it, and the other inputs as they are', async () => {
    const { container, renderer, sent, vm } = await mount({
      answers: ['first answer', 'second answer'],
      options: { conversation: true },
    });
    const jurisdiction = container.querySelector('[name="jurisdiction"]');
    jurisdiction.value = 'England';
    jurisdiction.dispatchEvent(new Event('input'));

    await send(container, renderer, 'first brief');
    await send(container, renderer, 'the reply');

    expect(sent[1].prompt).toBe(
      vm.conversationBrief([{ brief: 'first brief', answer: 'first answer' }], 'the reply', vm.CONVERSATION_MAX_CHARS)
        .value
    );
    expect(sent[1].prompt.indexOf('first answer')).toBeLessThan(sent[1].prompt.indexOf('the reply'));
    expect(sent[1].jurisdiction).toBe('England');
    // The page records what was typed, never the composed whole.
    expect(turns(container).map(turn => turn.brief)).toEqual(['first brief', 'the reply']);
  });

  it('records a run that returns whole as well as one that streams', async () => {
    const { container, renderer } = await mount({
      answers: ['whole answer'],
      options: { conversation: true },
      statusPatch: { level: 2 },
    });
    await send(container, renderer, 'a brief');
    expect(turns(container)).toEqual([{ brief: 'a brief', answer: 'whole answer' }]);
  });

  it('records no turn for a refusal, and keeps the brief to send again', async () => {
    const refused = options => {
      options.onEvent({ name: 'error', payload: { error: { code: 'bad_request', message: 'Too vague.' } } });
      return Promise.resolve();
    };
    const { container, renderer, sent } = await mount({
      answers: ['first answer', refused, 'third answer'],
      options: { conversation: true },
    });
    await send(container, renderer, 'first brief');
    await send(container, renderer, 'refused brief');

    expect(turns(container).length).toBe(1);
    expect(container.querySelector('[name="prompt"]').value).toBe('refused brief');
    expect(container.querySelector('.run-retry').disabled).toBe(false);

    await send(container, renderer, 'refused brief, again');
    // The refused exchange is not in what the next reply carries.
    expect(sent[2].prompt).not.toContain('Too vague.');
    expect(turns(container).map(turn => turn.brief)).toEqual(['first brief', 'refused brief, again']);
  });

  it('records no turn for a run that was stopped', async () => {
    const stopped = () => Promise.reject(Object.assign(new Error('stopped'), { name: 'AbortError' }));
    const { container, renderer } = await mount({ answers: [stopped], options: { conversation: true } });
    await send(container, renderer, 'a brief');
    expect(turns(container)).toEqual([]);
    expect(container.querySelector('.run-conversation').hidden).toBe(true);
    expect(container.querySelector('[name="prompt"]').value).toBe('a brief');
  });

  it('records no turn for an answer that is a file', async () => {
    const file = options => {
      options.onEvent({
        name: 'done',
        payload: { output: { type: 'bytes', media_type: 'application/pdf', value: 'JVBERi0=' } },
      });
      return Promise.resolve();
    };
    const { container, renderer } = await mount({ answers: [file], options: { conversation: true } });
    await send(container, renderer, 'a brief');
    expect(turns(container)).toEqual([]);
    expect(container.querySelector('.run-output .run-download')).not.toBeNull();
  });

  it("draws a turn's answer as the result panel would: markdown as structure, and never as markup", async () => {
    const composition = { version: 'sigrix_ui/0.1', template: 'form-to-result', output: { mode: 'markdown' } };
    const { container, renderer } = await mount({
      answers: ['# Findings\n\n- clause 4.2 <b>bold</b>'],
      options: { conversation: true, composition },
    });
    await send(container, renderer, '<img src=x onerror=alert(1)>');

    const answer = container.querySelector('.run-turn-answer');
    expect(answer.querySelector('.run-md-heading').textContent).toBe('Findings');
    expect(answer.querySelector('.run-md-item').textContent).toBe('clause 4.2 <b>bold</b>');
    expect(answer.querySelector('b')).toBeNull();
    expect(container.querySelector('.run-turn img')).toBeNull();
    expect(container.querySelector('.run-turn-brief').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it("keeps a turn's own download when the next run clears the result panel's", async () => {
    const composition = { version: 'sigrix_ui/0.1', template: 'form-to-result', output: { mode: 'file' } };
    const { container, renderer } = await mount({
      answers: ['first answer', 'second answer'],
      options: { conversation: true, composition },
    });
    await send(container, renderer, 'first brief');
    expect(container.querySelectorAll('.run-turn .run-download').length).toBe(1);

    await send(container, renderer, 'second brief');
    expect(container.querySelectorAll('.run-turn .run-download').length).toBe(2);
    expect(container.querySelectorAll('.run-output .run-download').length).toBe(0);
  });

  it('leaves the oldest turns out of a reply past its bound, and says how many', async () => {
    const long = 'x'.repeat(200);
    const { container, renderer, sent } = await mount({
      answers: [long, long, 'third answer'],
      options: { conversation: { maxChars: 450 } },
    });
    await send(container, renderer, 'first brief');
    await send(container, renderer, 'second brief');
    await send(container, renderer, 'third brief');

    expect(sent[2].prompt).not.toContain('first brief');
    expect(sent[2].prompt).toContain('second brief');
    expect(sent[2].prompt.length).toBeLessThanOrEqual(450);
    // Every turn stays on the page; only what is sent is bounded.
    expect(turns(container).length).toBe(3);
    expect(container.querySelector('.run-conversation-note').textContent).toMatch(/oldest messages|first message/);
  });

  it("holds a reply to the brief's own max_length, which the runner enforces", async () => {
    const docs = crew();
    const describeDoc = JSON.parse(JSON.stringify(docs.describe));
    describeDoc.inputs.find(input => input.key === 'prompt').validation = { max_length: 120 };
    const { container, renderer, sent } = await mount({
      answers: ['a'.repeat(80), 'second answer'],
      options: { conversation: true },
      describeDoc,
    });
    await send(container, renderer, 'first brief');
    await send(container, renderer, 'the reply');
    expect(sent[1].prompt).toBe('the reply');
  });

  it('starts over on New conversation, and offers it only between runs', async () => {
    let release;
    const held = options => {
      options.onEvent({ name: 'start', payload: { run_id: 'held' } });
      return new Promise(resolve => {
        release = () => {
          options.onEvent({ name: 'done', payload: { output: { type: 'text', value: 'late answer' } } });
          resolve();
        };
      });
    };
    const { container, renderer, sent } = await mount({
      answers: ['first answer', held, 'fresh answer'],
      options: { conversation: true },
    });
    await send(container, renderer, 'first brief');
    const reset = container.querySelector('.run-conversation-reset');

    const running = send(container, renderer, 'second brief');
    expect(reset.disabled).toBe(true);
    release();
    await running;
    expect(reset.disabled).toBe(false);

    reset.click();
    expect(turns(container)).toEqual([]);
    expect(container.querySelector('.run-conversation').hidden).toBe(true);
    await send(container, renderer, 'a fresh start');
    expect(sent[2].prompt).toBe('a fresh start');
  });
});
