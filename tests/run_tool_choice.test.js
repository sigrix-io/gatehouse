/* One select input choosing which of the others apply.
 *
 * An MCP server's `describe` carries every tool's arguments at once, keyed
 * `{tool}.{argument}`, beside a `tool` select. Nothing in `describe` says
 * which arguments belong to which tool, so the host hands the renderer that
 * fact as `options.choice`, the way it hands in the composition: the renderer
 * may name no distributor, so it cannot read the runner's own extension
 * (`contract.test.js`).
 *
 * Driven by generated fixtures rather than written ones: the describe a
 * runner's Toolbox builds from a real `tools/list` answer, and the options a
 * host sends beside it.
 *
 *   - only the chosen tool's inputs are on show, and marked as that tool
 *     requires them;
 *   - a run sends the tool and its inputs only, a number as a number;
 *   - a choice this client cannot honour changes nothing, and none can put an
 *     input out of reach.
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

const describeDoc = () => fixture('mcp_toolbox.describe.json');
const options = () => fixture('mcp_toolbox.options.json');
const statusDoc = () => ({ postern: '0.1', level: 3, state: 'ready', credentials: { satisfied: true, missing: [] } });

async function mount(documentOverride, choice, composition) {
  const NS = loadRenderer();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const sent = [];
  const client = {
    describe: () => Promise.resolve(documentOverride || describeDoc()),
    status: () => Promise.resolve(statusDoc()),
    run: () => Promise.resolve({ run_id: 'r-1', output: { type: 'text', value: 'done' } }),
    stream: (inputs, settings) => {
      sent.push(inputs);
      settings.onEvent({ name: 'done', payload: { output: { type: 'text', value: 'done' } } });
      return Promise.resolve();
    },
  };
  const renderer = new NS.RunRenderer(container, client, {
    choice: choice === undefined ? options().choice : choice,
    composition: composition === undefined ? options().composition : composition,
  });
  await renderer.load();
  return { NS, container, renderer, sent };
}

/* Keys carry a dot, which a CSS selector reads as a class: look them up by id. */
function field(key) {
  const control = document.getElementById('run-field-' + key);
  return { control, wrap: control ? control.closest('.run-field') : null };
}

function visibleKeys(container) {
  return Array.from(container.querySelectorAll('.run-field'))
    .filter(wrap => !wrap.hidden)
    .map(wrap => wrap.querySelector('.run-field-control').name);
}

function choose(value, key) {
  const { control } = field(key || 'tool');
  control.value = value;
  control.dispatchEvent(new Event('change'));
}

function type(key, value) {
  const { control } = field(key);
  control.value = value;
  control.dispatchEvent(new Event('input'));
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.Gatehouse;
});

suite('only the chosen tool’s inputs are on show', () => {
  it('draws the default tool’s inputs and hides the other’s', async () => {
    const { container } = await mount();

    expect(field('tool').control.value).toBe('watch_models');
    expect(visibleKeys(container)).toEqual([
      'tool',
      'watch_models.provider',
      'watch_models.since_days',
      'watch_models.include_previews',
    ]);
    // Hidden, not removed: every declared input is still in the form.
    expect(container.querySelectorAll('.run-field').length).toBe(describeDoc().inputs.length);
  });

  it('shows the other tool’s inputs when it is chosen', async () => {
    const { container } = await mount();

    choose('post_digest');

    expect(visibleKeys(container)).toEqual(['tool', 'post_digest.channel', 'post_digest.filters']);
  });

  it('marks each input as its own tool requires it', async () => {
    await mount();

    // The describe marks none of them required: with several tools, a
    // describe-level `required` would refuse every other tool's run.
    expect(describeDoc().inputs.filter(entry => entry.key !== 'tool').every(entry => !entry.required)).toBe(true);
    expect(field('watch_models.provider').control.required).toBe(true);
    expect(field('watch_models.provider').wrap.querySelector('.run-field-label').textContent).toBe('Provider *');
    expect(field('watch_models.since_days').control.required).toBe(false);
    expect(field('post_digest.channel').control.required).toBe(true);
    expect(field('post_digest.filters').wrap.querySelector('.run-field-label').textContent).toBe('Filters (JSON)');
  });

  it('says what the chosen tool does beneath the picker', async () => {
    await mount();
    const about = () => field('tool').wrap.querySelector('.run-field-help');

    expect(about().textContent).toBe('Lists the models a provider released recently.');
    choose('post_digest');
    expect(about().textContent).toBe("Posts the week's releases to a Slack channel as a task-list, one item per model.");
  });

  it('draws each argument’s description as its help', async () => {
    await mount();
    expect(field('watch_models.since_days').wrap.querySelector('.run-field-help').textContent)
      .toBe('How far back to look, in days.');
  });

  it('keeps what was typed into a tool’s inputs when the buyer comes back to it', async () => {
    await mount();

    choose('post_digest');
    type('post_digest.channel', 'releases');
    choose('watch_models');
    choose('post_digest');

    expect(field('post_digest.channel').control.value).toBe('releases');
  });

  it('follows an example that chooses another tool', async () => {
    /* Two examples, because the form *starts* from the first: an example that
     * chose the other tool on its own would already be on show, and the chip
     * would change nothing a test could see. */
    const withExamples = describeDoc();
    withExamples.examples = [
      { inputs: { tool: 'watch_models', 'watch_models.provider': 'openai' } },
      { inputs: { tool: 'post_digest', 'post_digest.channel': 'releases' } },
    ];
    const { container } = await mount(withExamples);
    expect(visibleKeys(container)).toContain('watch_models.provider');

    container.querySelectorAll('.run-template-chip')[1].click();

    expect(visibleKeys(container)).toEqual(['tool', 'post_digest.channel', 'post_digest.filters']);
    expect(field('post_digest.channel').control.value).toBe('releases');
  });

  it('renders a description a bare prefix scan read as a key', async () => {
    /* "task-list" holds `sk-`. The form must draw rather than refuse. */
    expect(JSON.stringify(describeDoc())).toContain('task-list');
    const { container } = await mount();
    expect(container.querySelector('.run-refuse')).toBeNull();
    expect(container.querySelector('.run-go')).not.toBeNull();
  });
});

suite('a run sends the chosen tool and its inputs', () => {
  it('leaves another tool’s inputs out, and sends a number as a number', async () => {
    const { renderer, sent } = await mount();

    choose('post_digest');
    type('post_digest.channel', 'stale value the buyer cannot see');
    choose('watch_models');
    choose('openai', 'watch_models.provider');
    type('watch_models.since_days', '14');
    await renderer.start({});

    expect(sent).toEqual([
      {
        tool: 'watch_models',
        'watch_models.provider': 'openai',
        'watch_models.since_days': 14,
        'watch_models.include_previews': '',
      },
    ]);
  });

  it('sends the other tool’s inputs once it is chosen', async () => {
    const { renderer, sent } = await mount();

    choose('post_digest');
    type('post_digest.channel', 'releases');
    type('post_digest.filters', '{"provider": "openai"}');
    await renderer.start({});

    expect(sent[0]).toEqual({
      tool: 'post_digest',
      'post_digest.channel': 'releases',
      'post_digest.filters': '{"provider": "openai"}',
    });
  });

  it('sends a number field’s text as the number it spells, and anything else as typed', () => {
    const NS = loadRenderer();
    const fields = [{ key: 'n', type: 'number', group: '' }, { key: 't', type: 'text', group: '' }];
    const send = (n, t) => NS.viewModel.runInputs(fields, { n, t }, null);

    expect(send('7', '7')).toEqual({ n: 7, t: '7' });
    expect(send(' 1e2 ', '')).toEqual({ n: 100, t: '' });
    expect(send('', 'x')).toEqual({ n: '', t: 'x' });
    // Not a number: sent as typed, for the runner to refuse by name.
    expect(send('seven', 'x')).toEqual({ n: 'seven', t: 'x' });
    expect(send('Infinity', 'x')).toEqual({ n: 'Infinity', t: 'x' });
  });
});

suite('a choice cannot put an input out of reach', () => {
  const flat = () => describeDoc().inputs.map(entry => entry.key);

  it('ignores a choice whose key is not a select', async () => {
    const choice = options().choice;
    choice.key = 'post_digest.channel';
    const { container } = await mount(undefined, choice);
    expect(visibleKeys(container)).toEqual(flat());
  });

  it('ignores a choice whose key names no input', async () => {
    const choice = options().choice;
    choice.key = 'nothing';
    const { container } = await mount(undefined, choice);
    expect(visibleKeys(container)).toEqual(flat());
  });

  it('ignores groups that are not an object', async () => {
    const { container } = await mount(undefined, { key: 'tool', groups: ['watch_models'] });
    expect(visibleKeys(container)).toEqual(flat());
  });

  it('leaves the inputs of a group that is not one of the options on show', async () => {
    const choice = {
      key: 'tool',
      groups: {
        ghost: { inputs: ['post_digest.channel', 'post_digest.filters'], required: [] },
        watch_models: options().choice.groups.watch_models,
      },
    };
    const { container } = await mount(undefined, choice);

    expect(visibleKeys(container)).toContain('post_digest.channel');
    choose('post_digest');
    expect(visibleKeys(container)).toContain('post_digest.channel');
    expect(visibleKeys(container)).not.toContain('watch_models.provider');
  });

  it('gives an input two groups name to the first', async () => {
    const NS = loadRenderer();
    const plan = NS.viewModel.inputChoice(describeDoc(), {
      key: 'tool',
      groups: {
        watch_models: { inputs: ['watch_models.provider'] },
        post_digest: { inputs: ['watch_models.provider', 'post_digest.channel'], required: ['watch_models.provider'] },
      },
    });

    expect(plan.groupOf['watch_models.provider']).toBe('watch_models');
    // A requirement counts only from the group the input belongs to.
    expect(plan.required['watch_models.provider']).toBeUndefined();
  });

  it('adds a requirement and never removes one', () => {
    const NS = loadRenderer();
    const doc = describeDoc();
    doc.inputs.find(entry => entry.key === 'watch_models.since_days').required = true;

    const fields = NS.viewModel.formFields(doc, null, options().choice);

    expect(fields.find(entry => entry.key === 'watch_models.since_days').required).toBe(true);
  });

  it('changes nothing without a choice', async () => {
    const { container, renderer, sent } = await mount(undefined, null, null);

    expect(visibleKeys(container)).toEqual(flat());
    await renderer.start({});
    expect(Object.keys(sent[0])).toEqual(flat());
  });
});

suite('the credential check reads a key, not a prefix inside a word', () => {
  const leak = summary => {
    const NS = loadRenderer();
    const doc = describeDoc();
    doc.agent.summary = summary;
    return NS.viewModel.credentialLeak(doc);
  };

  it.each([
    ['risk-free', 'A risk-free way to watch releases.'],
    ['task-list', 'Posts a task-list.'],
    ['Flask-based', 'A Flask-based server.'],
    ['a documented prefix', 'Use your sk_test_ key while developing.'],
    ['an elided key', 'Set OPENAI_API_KEY=sk-... first.'],
  ])('passes %s', (_, summary) => {
    expect(leak(summary)).toBe('');
  });

  it.each([
    ['an OpenAI key', 'Set OPENAI_API_KEY=sk-proj-9f8a7b to use this.', 'sk-', 'sk-proj-9f8a7b'],
    ['a key at the start', 'sk-live-abc123 works', 'sk-', 'sk-live-abc123'],
    ['a GitHub token', 'token: ghp_abcdefghijklmnop', 'ghp_', 'ghp_abcdefghijklmnop'], // noqa: S105, a made-up token
    ['an AWS key id', '"AKIAIOSFODNN7EXAMPLE"', 'AKIA', 'AKIAIOSFODNN7EXAMPLE'], // noqa: S105, AWS's documented example key
    ['a Slack token', '(xoxb-123456-abcdef)', 'xoxb-', 'xoxb-123456-abcdef'],
  ])('refuses %s', (_, summary, prefix, key) => {
    const reason = leak(summary);
    expect(reason).toContain('shaped like a live API key (' + prefix + '…)');
    // The reason names the prefix and never repeats the key.
    expect(reason).not.toContain(key);
  });
});
