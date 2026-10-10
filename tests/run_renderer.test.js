/* The run renderer, driven against both describe documents.
 *
 * Two runners rather than one, because a screen that renders from one and not
 * the other is a per-listing branch — the failure the whole "the package holds
 * nothing" rule exists to forbid. The two differ in the ways that matter: the
 * conformance fake has no reserved `prompt` key and a non-empty `write_tools`;
 * the real crew has the reserved key, declared defaults, a missing credential
 * and every limit. Anything asserted for one is asserted for both.
 *
 * The modules are plain IIFEs that add to one global, so they are loaded the
 * way a browser loads them — read, evaluated in order — rather than imported.
 * A test that imported them would be testing a shape the page never has.
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
    const source = fs.readFileSync(path.join(RUN_DIR, name), 'utf8');
    // eslint-disable-next-line no-new-func
    new Function(source).call(window);
  });
  return window.Gatehouse;
}

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

const DOCUMENTS = {
  'the conformance fake': {
    describe: () => fixture('conformance_fake.describe.json'),
    status: () => fixture('conformance_fake.status.json'),
    promptKey: 'segment',
  },
  'a real pipeline crew': {
    describe: () => fixture('pipeline_crew.describe.json'),
    status: () => fixture('pipeline_crew.status.json'),
    promptKey: 'prompt',
  },
};

/* A client with the four verbs and nothing else, so a renderer test never
 * depends on how the transport frames a request — that is the client's own
 * test, one file over. */
function stubClient(describeDoc, statusDoc, overrides) {
  return Object.assign(
    {
      describe: () => Promise.resolve(describeDoc),
      status: () => Promise.resolve(statusDoc),
      run: () => Promise.resolve({ run_id: 'r-1', output: { type: 'text', value: 'done' } }),
      stream: () => Promise.resolve(),
    },
    overrides || {}
  );
}

async function mount(describeDoc, statusDoc, overrides) {
  const NS = loadRenderer();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const renderer = new NS.RunRenderer(container, stubClient(describeDoc, statusDoc, overrides));
  await renderer.load();
  return { NS, container, renderer };
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.Gatehouse;
});

suite('every screen renders from both documents', () => {
  Object.entries(DOCUMENTS).forEach(([label, doc]) => {
    it(`draws the header, readiness, form and controls from ${label}`, async () => {
      const { container } = await mount(doc.describe(), doc.status());

      expect(container.querySelector('.run-title').textContent).toBeTruthy();
      // Verbatim: the identifier is what the buyer puts in `.env`.
      expect(container.querySelector('.run-agent-id').textContent)
        .toBe(doc.describe().agent.id);
      expect(container.querySelector('.run-readiness')).toBeTruthy();
      expect(container.querySelectorAll('.run-field').length)
        .toBe(doc.describe().inputs.length);
      expect(container.querySelector('.run-go')).toBeTruthy();
      expect(container.querySelector('.run-stop')).toBeTruthy();
      expect(container.querySelector('.run-output')).toBeTruthy();
    });

    it(`renders each declared input in declared order from ${label}`, async () => {
      const declared = doc.describe().inputs.map(input => input.key);
      const { container } = await mount(doc.describe(), doc.status());
      const rendered = Array.from(container.querySelectorAll('.run-field-control'))
        .map(node => node.name);
      expect(rendered).toEqual(declared);
    });

    it(`renders no templates row from ${label}, which declares no examples`, async () => {
      // Neither shipped document carries `examples` — the fake declares none
      // and the crew's generator declares none either. The row renders nothing
      // rather than an empty heading, and `with_examples` covers the other arm.
      expect(doc.describe().examples).toBeUndefined();
      const { container } = await mount(doc.describe(), doc.status());
      expect(container.querySelector('.run-templates')).toBeNull();
    });
  });
});

suite('the form follows the input declaration', () => {
  it('gives the reserved prompt key the large box and a plain text key a single line', async () => {
    const { container } = await mount(
      DOCUMENTS['a real pipeline crew'].describe(),
      DOCUMENTS['a real pipeline crew'].status()
    );
    expect(container.querySelector('[name="prompt"]').tagName).toBe('TEXTAREA');
    expect(container.querySelector('[name="jurisdiction"]').tagName).toBe('INPUT');
  });

  it('renders select options and honours a declared default', async () => {
    const { container } = await mount(
      DOCUMENTS['a real pipeline crew'].describe(),
      DOCUMENTS['a real pipeline crew'].status()
    );
    const select = container.querySelector('[name="risk_appetite"]');
    expect(select.tagName).toBe('SELECT');
    expect(Array.from(select.options).map(o => o.value))
      .toEqual(['conservative', 'balanced', 'aggressive']);
    expect(select.value).toBe('balanced');
    expect(container.querySelector('[name="jurisdiction"]').value).toBe('England and Wales');
  });

  it('applies max_length where the fake declares one', async () => {
    const { container } = await mount(
      DOCUMENTS['the conformance fake'].describe(),
      DOCUMENTS['the conformance fake'].status()
    );
    expect(container.querySelector('[name="segment"]').maxLength).toBe(200);
  });

  it('renders an unrecognised type as text and says it did', async () => {
    // SPEC 4.1.1: a client MUST render an unknown type as text. Silently
    // flattening it would leave the buyer unable to tell a text field from a
    // field this client did not understand.
    const doc = DOCUMENTS['the conformance fake'].describe();
    doc.inputs.push({ key: 'when', label: 'When', type: 'datetime', required: false });
    const { container } = await mount(doc, DOCUMENTS['the conformance fake'].status());
    const control = container.querySelector('[name="when"]');
    expect(control.tagName).toBe('INPUT');
    expect(control.type).toBe('text');
    expect(container.textContent).toContain('datetime');
  });

  it('ignores an unrecognised validation member rather than rejecting the input', async () => {
    const doc = DOCUMENTS['the conformance fake'].describe();
    doc.inputs[0].validation.some_future_rule = { nested: true };
    const { NS, container } = await mount(doc, DOCUMENTS['the conformance fake'].status());
    expect(container.querySelector('[name="segment"]')).toBeTruthy();
    const field = NS.viewModel.formFields(doc).find(f => f.key === 'segment');
    expect(field.ignoredValidation).toEqual(['some_future_rule']);
    expect(field.maxLength).toBe(200);
  });

  it('falls back to a text box for a select whose options never arrived', async () => {
    const doc = DOCUMENTS['the conformance fake'].describe();
    doc.inputs[1].validation = {};
    const { container } = await mount(doc, DOCUMENTS['the conformance fake'].status());
    expect(container.querySelector('[name="depth"]').tagName).toBe('INPUT');
  });
});

suite('templates come from the examples the seller captured', () => {
  it('pre-fills the form from the first example and re-fills from a chip', async () => {
    const doc = fixture('with_examples.describe.json');
    const status = fixture('conformance_fake.status.json');
    const { container } = await mount(doc, status);

    expect(container.querySelectorAll('.run-template-chip').length).toBe(2);
    expect(container.querySelector('[name="prompt"]').value)
      .toBe('A pocket notebook for field biologists.');

    container.querySelectorAll('.run-template-chip')[1].click();
    expect(container.querySelector('[name="prompt"]').value)
      .toBe('A coffee subscription for offices.');
    expect(container.querySelector('[name="tone"]').value).toBe('playful');
  });

  it('offers no control that edits anything but an input value', async () => {
    const { container } = await mount(
      fixture('with_examples.describe.json'),
      fixture('conformance_fake.status.json')
    );
    const controls = Array.from(container.querySelectorAll('button'));
    const names = controls.map(node => node.className);
    // Run, Stop, Retry and the example chips. Nothing that edits the document.
    names.forEach(name => {
      expect(['run-go', 'run-stop', 'run-retry', 'run-template-chip']).toContain(name);
    });
  });
});

suite('status decides what the controls do', () => {
  it('disables Run at level 1 and says why', async () => {
    const status = fixture('conformance_fake.status.json');
    status.level = 1;
    const { container } = await mount(DOCUMENTS['the conformance fake'].describe(), status);
    expect(container.querySelector('.run-go').disabled).toBe(true);
    expect(container.querySelector('.run-level').textContent).toContain('cannot run it');
  });

  it('reports level 2 as whole-result rather than streaming', async () => {
    // The crew document rather than the fake: the fake declares `write_tools`,
    // so its Run stays disabled behind the confirmation and a test written
    // against it would be measuring that gate instead of the level.
    const status = fixture('pipeline_crew.status.json');
    status.level = 2;
    const { container } = await mount(DOCUMENTS['a real pipeline crew'].describe(), status);
    expect(container.querySelector('.run-go').disabled).toBe(false);
    expect(container.querySelector('.run-level').textContent).toContain('whole result');
  });

  it('holds Run behind the write_tools confirmation, and only where there are any', async () => {
    const fake = DOCUMENTS['the conformance fake'];
    const gated = await mount(fake.describe(), fake.status());
    expect(gated.container.querySelector('.run-go').disabled).toBe(true);
    gated.container.querySelector('.run-write-check').click();
    expect(gated.container.querySelector('.run-go').disabled).toBe(false);

    document.body.innerHTML = '';
    delete window.Gatehouse;
    const crew = DOCUMENTS['a real pipeline crew'];
    const ungated = await mount(crew.describe(), crew.status());
    // Its write_tools is empty, so there is nothing to confirm and no gate.
    expect(ungated.container.querySelector('.run-write-check')).toBeNull();
    expect(ungated.container.querySelector('.run-go').disabled).toBe(false);
  });

  it('says an abort is not a rollback beside the confirmation', async () => {
    const fake = DOCUMENTS['the conformance fake'];
    const { container } = await mount(fake.describe(), fake.status());
    expect(container.querySelector('.run-write-label').textContent).toContain('does not undo it');
  });

  it('states a declared run limit and says nothing when there is none', async () => {
    const fake = DOCUMENTS['the conformance fake'];
    const withLimit = await mount(fake.describe(), fake.status());
    expect(withLimit.container.querySelector('.run-limit').textContent).toContain('900');

    document.body.innerHTML = '';
    delete window.Gatehouse;
    const status = fake.status();
    delete status.limits.max_run_seconds;
    const without = await mount(fake.describe(), status);
    expect(without.container.querySelector('.run-limit')).toBeNull();
  });

  it('renders the runner-specific update block as a courtesy and never as a requirement', async () => {
    const crew = DOCUMENTS['a real pipeline crew'];
    const withUpdate = await mount(crew.describe(), crew.status());
    expect(withUpdate.container.querySelector('.run-update').textContent).toContain('update is available');

    document.body.innerHTML = '';
    delete window.Gatehouse;
    const status = crew.status();
    delete status.update;
    const without = await mount(crew.describe(), status);
    // Absent is the ordinary case for any runner but this platform's own.
    expect(without.container.querySelector('.run-update')).toBeNull();
    expect(without.container.querySelector('.run-go').disabled).toBe(false);
  });
});

suite('the entitlement banner says only what the runner knows', () => {
  const cases = [
    ['not_required', {}, 'quiet', false],
    ['active', { checked_at: '2026-09-02T11:00:00Z' }, 'quiet', false],
    ['unknown', { checked_at: '2026-09-02T11:00:00Z', grace_seconds: 3600 }, 'caution', false],
    ['unknown', {}, 'blocked', true],
    ['revoked', {}, 'blocked', true],
  ];
  cases.forEach(([state, extra, tone, blocksRun]) => {
    it(`renders ${state}${extra.checked_at ? ' with checked_at' : ''} as ${tone}`, async () => {
      const status = fixture('conformance_fake.status.json');
      status.entitlement = Object.assign({ state }, extra);
      const { container } = await mount(DOCUMENTS['the conformance fake'].describe(), status);
      const banner = container.querySelector('.run-entitlement');
      if (tone === 'quiet' && state === 'not_required') expect(banner).toBeNull();
      else expect(banner.className).toContain('run-entitlement--' + tone);
      if (blocksRun) expect(container.querySelector('.run-go').disabled).toBe(true);
    });
  });

  it('never guesses between refunded, withdrawn and mistyped', async () => {
    // SPEC 5.5 does not let the runner tell them apart, so neither may this.
    const status = fixture('conformance_fake.status.json');
    status.entitlement = { state: 'revoked' };
    const { container } = await mount(DOCUMENTS['the conformance fake'].describe(), status);
    const message = container.querySelector('.run-entitlement').textContent;
    expect(message).toContain('ended or could not be confirmed');
    expect(message.toLowerCase()).not.toContain('refund');
  });
});

suite('credentials come from both documents and neither alone', () => {
  it('ticks a satisfied credential and flags a missing one with where it goes', async () => {
    const fake = await mount(
      DOCUMENTS['the conformance fake'].describe(),
      DOCUMENTS['the conformance fake'].status()
    );
    expect(fake.container.querySelector('.run-credential').className).toContain('is-satisfied');
    expect(fake.container.querySelector('.run-credential-where')).toBeNull();

    document.body.innerHTML = '';
    delete window.Gatehouse;
    const crew = await mount(
      DOCUMENTS['a real pipeline crew'].describe(),
      DOCUMENTS['a real pipeline crew'].status()
    );
    const row = crew.container.querySelector('.run-credential');
    expect(row.className).toContain('is-missing');
    expect(row.textContent).toContain('OPENAI_API_KEY');
    expect(row.textContent).toContain('Runs the agents in this crew.');
    expect(crew.container.querySelector('.run-credential-link').href)
      .toContain('platform.openai.com');
    expect(crew.container.querySelector('.run-credential-where').textContent)
      .toContain('not here');
  });
});

suite('a nonconformant describe stops the page', () => {
  it('refuses a document carrying a credential value', async () => {
    // SPEC 4.1.3 and 7: a value in `describe` makes the document
    // nonconformant, and a client meeting one SHOULD refuse to proceed.
    const doc = DOCUMENTS['the conformance fake'].describe();
    doc.credentials[0].value = 'sk-live-abc123';
    const { container } = await mount(doc, DOCUMENTS['the conformance fake'].status());
    expect(container.querySelector('.run-refuse')).toBeTruthy();
    expect(container.querySelector('.run-go')).toBeNull();
  });

  it('refuses a key-shaped string anywhere in the document, not only in credentials', async () => {
    const doc = DOCUMENTS['the conformance fake'].describe();
    doc.agent.summary = 'Set OPENAI_API_KEY=sk-proj-9f8a7b to use this.';
    const { container } = await mount(doc, DOCUMENTS['the conformance fake'].status());
    expect(container.querySelector('.run-refuse')).toBeTruthy();
  });
});

suite('several renderers on one page', () => {
  /* Two apps side by side is what a dashboard draws. An id is unique to the
   * document, not to the container, and a `<label>` binds to the first element
   * carrying its `for`: with ids shared, the second page's labels would focus
   * and tick the first page's controls. The same document twice is the worst
   * case, since every key collides. */
  async function mountBeside(documents) {
    const NS = loadRenderer();
    const pages = [];
    for (const doc of documents) {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const renderer = new NS.RunRenderer(container, stubClient(doc.describe(), doc.status()));
      await renderer.load();
      pages.push({ container, renderer });
    }
    return pages;
  }

  const fake = DOCUMENTS['the conformance fake'];
  const crew = DOCUMENTS['a real pipeline crew'];

  it('gives no two elements on the page the same id', async () => {
    await mountBeside([fake, fake, crew, crew]);
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    expect(ids.length).toBeGreaterThan(4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('binds every label to a control inside its own renderer', async () => {
    const pages = await mountBeside([fake, fake, crew, crew]);
    pages.forEach(({ container }) => {
      const labels = [...container.querySelectorAll('label')];
      expect(labels.length).toBeGreaterThan(0);
      labels.forEach(label => {
        const target = document.getElementById(label.htmlFor);
        expect(target, label.htmlFor).not.toBeNull();
        expect(container.contains(target), label.htmlFor).toBe(true);
      });
    });
  });

  it('ticks only its own confirmation', async () => {
    const [first, second] = await mountBeside([fake, fake]);
    second.container.querySelector('.run-write-label').click();
    expect(second.container.querySelector('.run-write-check').checked).toBe(true);
    expect(first.container.querySelector('.run-write-check').checked).toBe(false);
    expect(second.container.querySelector('.run-go').disabled).toBe(false);
    expect(first.container.querySelector('.run-go').disabled).toBe(true);
  });

  it('keeps a renderer\'s ids when it draws itself again', async () => {
    // Scoped per renderer, not per draw: a host that redraws one keeps its
    // labels where they were.
    const [page] = await mountBeside([fake]);
    const before = [...page.container.querySelectorAll('[id]')].map(node => node.id);
    page.renderer.render();
    const after = [...page.container.querySelectorAll('[id]')].map(node => node.id);
    expect(after).toEqual(before);
  });
});
