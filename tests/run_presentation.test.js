/* The seller's presentation composition, honoured by the buyer's renderer.
 *
 * `ui.json` is a third document beside `describe` and `status`, and the only
 * one a *seller* authors — so the rules under test are about what a document
 * from outside may and may not do to this page:
 *
 *   - it decorates inputs by key, and cannot hide, add or reorder one;
 *   - a widget hint may change a control's shape and never what a field means,
 *     because the runner validates against `describe` and not against this;
 *   - every string in it reaches the page as text, markdown mode included —
 *     `innerHTML` appears nowhere in the package and this does not change that;
 *   - a version this client does not know falls back to the default layout
 *     whole, and says so.
 *
 * Driven against both fixture runners for the same reason `run_renderer.test.js`
 * is: a screen that honours a composition on one document and not the other is
 * a per-listing branch.
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

const DOCUMENTS = {
  'the conformance fake': {
    describe: () => fixture('conformance_fake.describe.json'),
    status: () => fixture('conformance_fake.status.json'),
  },
  'a real pipeline crew': {
    describe: () => fixture('pipeline_crew.describe.json'),
    status: () => fixture('pipeline_crew.status.json'),
  },
};

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

async function mount(describeDoc, statusDoc, composition) {
  const NS = loadRenderer();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const renderer = new NS.RunRenderer(container, stubClient(describeDoc, statusDoc), { composition });
  await renderer.load();
  return { NS, container, renderer };
}

function composed(overrides) {
  return Object.assign({ version: 'sigrix_ui/0.1', template: 'form-to-result' }, overrides || {});
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.Gatehouse;
  // vitest's jsdom-Blob-to-Node-Blob bridge for URL.createObjectURL locates
  // jsdom's internal impl slot by grabbing "the first own symbol" off a
  // fresh Blob, which picks the wrong one under jsdom 30.1+ and throws
  // reading `_buffer` off undefined. Nothing here asserts on the object URL
  // itself (only on the resulting <a download>), so stub it rather than
  // exercise that unrelated, broken bridge.
  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => {};
});

suite('a composition decorates and never hides', () => {
  Object.entries(DOCUMENTS).forEach(([label, doc]) => {
    it(`renders every declared input of ${label} whatever the composition names`, async () => {
      const describeDoc = doc.describe();
      const bare = await mount(describeDoc, doc.status(), null);
      const withOne = await mount(
        describeDoc,
        doc.status(),
        composed({ inputs: [{ key: describeDoc.inputs[0].key, help: 'only this one' }] })
      );

      expect(withOne.container.querySelectorAll('.run-field').length)
        .toBe(bare.container.querySelectorAll('.run-field').length);
      expect(withOne.container.querySelectorAll('.run-field').length)
        .toBe(describeDoc.inputs.length);
    });

    it(`ignores a block bound to a key ${label} never declared`, async () => {
      const describeDoc = doc.describe();
      const { container } = await mount(
        describeDoc,
        doc.status(),
        composed({ inputs: [{ key: 'NOT_A_FIELD', help: 'nothing wears this' }] })
      );

      expect(container.querySelectorAll('.run-field').length).toBe(describeDoc.inputs.length);
      expect(container.textContent).not.toContain('nothing wears this');
    });

    it(`draws the seller's run-button label on ${label}`, async () => {
      const { container } = await mount(doc.describe(), doc.status(), composed({ run_label: 'Draft it' }));
      expect(container.querySelector('.run-go').textContent).toBe('Draft it');
    });

    it(`falls back to Run when ${label} composes nothing`, async () => {
      const { container } = await mount(doc.describe(), doc.status(), null);
      expect(container.querySelector('.run-go').textContent).toBe('Run');
    });
  });
});

suite('a widget hint changes the control, never the contract', () => {
  const describeDoc = () => ({
    postern: '0.1',
    agent: { id: 'a/b', name: 'Widgets', version: '1' },
    inputs: [
      { key: 'prompt', label: 'Brief', type: 'text', required: true },
      { key: 'notes', label: 'Notes', type: 'text', required: false },
      { key: 'count', label: 'How many', type: 'number', required: false },
      { key: 'tone', label: 'Tone', type: 'select', required: false, validation: { options: ['warm', 'dry'] } },
    ],
    output: { type: 'text' },
  });
  const statusDoc = { postern: '0.1', level: 3, state: 'ready', credentials: { satisfied: true, missing: [] } };

  it('turns an ordinary text field into a large box on request', async () => {
    const { container } = await mount(
      describeDoc(),
      statusDoc,
      composed({ inputs: [{ key: 'notes', widget: 'box' }] })
    );
    expect(container.querySelector('#run-field-notes').tagName).toBe('TEXTAREA');
  });

  it('turns the reserved brief into one line on request', async () => {
    /* The default guess — the brief is the big box, everything else is a line
     * — is exactly what this document exists to replace, so the override has
     * to work in both directions. */
    const bare = await mount(describeDoc(), statusDoc, null);
    expect(bare.container.querySelector('#run-field-prompt').tagName).toBe('TEXTAREA');

    const { container } = await mount(
      describeDoc(),
      statusDoc,
      composed({ inputs: [{ key: 'prompt', widget: 'line' }] })
    );
    expect(container.querySelector('#run-field-prompt').tagName).toBe('INPUT');
  });

  it('refuses to make a select a number box, and says so', async () => {
    const { container } = await mount(
      describeDoc(),
      statusDoc,
      composed({ inputs: [{ key: 'tone', widget: 'number' }] })
    );
    expect(container.querySelector('#run-field-tone').tagName).toBe('SELECT');
    expect(container.textContent).toContain('"number" control');
  });

  it('refuses to make a number field a dropdown with no options', async () => {
    const { container } = await mount(
      describeDoc(),
      statusDoc,
      composed({ inputs: [{ key: 'count', widget: 'choice' }] })
    );
    const control = container.querySelector('#run-field-count');
    expect(control.tagName).toBe('INPUT');
    expect(control.type).toBe('number');
  });

  it('renders help text and a placeholder as text', async () => {
    const { container } = await mount(
      describeDoc(),
      statusDoc,
      composed({
        inputs: [{ key: 'notes', help: '<b>not markup</b>', placeholder: '<i>nor this</i>' }],
      })
    );
    const help = container.querySelector('.run-field-help');
    expect(help.textContent).toBe('<b>not markup</b>');
    expect(help.querySelector('b')).toBeNull();
    expect(container.querySelector('#run-field-notes').placeholder).toBe('<i>nor this</i>');
  });
});

suite('the output mode', () => {
  const describeDoc = {
    postern: '0.1',
    agent: { id: 'a/b', name: 'Modes', version: '1' },
    inputs: [{ key: 'prompt', label: 'Brief', type: 'text', required: true }],
    output: { type: 'text' },
  };
  const statusDoc = { postern: '0.1', level: 3, state: 'ready', credentials: { satisfied: true, missing: [] } };
  const MARKDOWN = '# Findings\n\nOne risk stands out.\n\n- clause 4.2\n- clause 9\n\n```\nrm -rf /\n```';

  it('shows plain text by default', async () => {
    const { container, renderer } = await mount(describeDoc, statusDoc, null);
    renderer.showResult({ type: 'text', value: MARKDOWN });
    expect(container.querySelector('.run-result').textContent).toBe(MARKDOWN);
    expect(container.querySelector('.run-result-rendered').children.length).toBe(0);
  });

  it('renders markdown structure as real nodes, built by hand', async () => {
    const { container, renderer } = await mount(
      describeDoc,
      statusDoc,
      composed({ output: { mode: 'markdown' } })
    );
    renderer.showResult({ type: 'text', value: MARKDOWN });

    const rendered = container.querySelector('.run-result-rendered');
    expect(container.querySelector('.run-result').textContent).toBe('');
    expect(rendered.querySelector('.run-md-heading').textContent).toBe('Findings');
    expect(rendered.querySelector('.run-md-paragraph').textContent).toBe('One risk stands out.');
    expect([...rendered.querySelectorAll('.run-md-item')].map(n => n.textContent))
      .toEqual(['clause 4.2', 'clause 9']);
    expect(rendered.querySelector('.run-md-code').textContent).toBe('rm -rf /');
  });

  it('never lets agent output become markup, whatever the mode', async () => {
    /* The rule the whole package is written around. Markdown mode recognises
     * block structure only; anything that looks like a tag is text. */
    const { container, renderer } = await mount(
      describeDoc,
      statusDoc,
      composed({ output: { mode: 'markdown' } })
    );
    renderer.showResult({ type: 'text', value: '# <img src=x onerror=alert(1)>\n\n<script>alert(2)</script>' });

    const rendered = container.querySelector('.run-result-rendered');
    expect(rendered.querySelector('img')).toBeNull();
    expect(rendered.querySelector('script')).toBeNull();
    expect(rendered.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('offers a download beside the text in file mode, never instead of it', async () => {
    const { container, renderer } = await mount(describeDoc, statusDoc, composed({ output: { mode: 'file' } }));
    renderer.showResult({ type: 'text', value: 'id,name\n1,a\n' });

    expect(container.querySelector('.run-result').textContent).toBe('id,name\n1,a\n');
    const link = container.querySelector('.run-download');
    expect(link).toBeTruthy();
    expect(link.download).toBe('result.txt');
  });

  it('leaves a bytes result alone whatever the seller composed', async () => {
    /* SPEC 4.1.4 forbids showing bytes as text, so the mode is a presentation
     * choice over a `text` output and nothing else. */
    const { container, renderer } = await mount(
      describeDoc,
      statusDoc,
      composed({ output: { mode: 'markdown' } })
    );
    renderer.showResult({ type: 'bytes', media_type: 'application/pdf', value: 'AAAA' });

    expect(container.querySelector('.run-result').textContent).toBe('');
    expect(container.querySelector('.run-result-rendered').children.length).toBe(0);
    expect(container.querySelector('.run-download').download).toBe('result');
  });
});

suite('a document this client does not know', () => {
  const describeDoc = {
    postern: '0.1',
    agent: { id: 'a/b', name: 'Later', version: '1' },
    inputs: [{ key: 'prompt', label: 'Brief', type: 'text', required: true }],
    output: { type: 'text' },
  };
  const statusDoc = { postern: '0.1', level: 3, state: 'ready', credentials: { satisfied: true, missing: [] } };

  it('reads the version and never decides on it', async () => {
    /* A first draft gated on the version *family* and fell back whole. That
     * reads as caution and is not: the family names a distributor, so the gate
     * refused another vendor's document rather than a shape this client cannot
     * draw — and it put that distributor's name inside a package whose whole
     * rule is that it holds nothing about one
     * (the distributor-name check in `contract.test.js`
     * catches it). What protects the page is the palette re-check, which is
     * vendor-neutral. */
    const { container } = await mount(describeDoc, statusDoc, {
      version: 'somebody_elses_ui/2.0',
      run_label: 'Applies anyway',
      inputs: [{ key: 'prompt', widget: 'line' }],
    });

    expect(container.querySelector('.run-go').textContent).toBe('Applies anyway');
    expect(container.querySelector('#run-field-prompt').tagName).toBe('INPUT');
  });

  it('drops a palette value it does not have, whoever wrote the document', async () => {
    const { container } = await mount(
      describeDoc,
      statusDoc,
      composed({ run_label: 'Go', output: { mode: 'html' }, inputs: [{ key: 'prompt', widget: 'canvas' }] })
    );

    expect(container.querySelector('.run-go').textContent).toBe('Go');
    // The default guess survives: an unknown widget is not a widget.
    expect(container.querySelector('#run-field-prompt').tagName).toBe('TEXTAREA');
    // `html` is not an output mode, so the result stays plain text.
    expect(container.querySelector('.run-result-rendered').children.length).toBe(0);
  });

  it('names a template it cannot draw rather than showing the fallback silently', async () => {
    const { container } = await mount(describeDoc, statusDoc, composed({ template: 'chat' }));
    expect(container.textContent).toContain('"chat" layout');
  });

  it('ignores a member it has never heard of and applies the rest', async () => {
    const { container } = await mount(
      describeDoc,
      statusDoc,
      composed({ run_label: 'Go', sections: [{ title: 'A future block' }], canvas: { x: 1 } })
    );
    expect(container.querySelector('.run-go').textContent).toBe('Go');
    expect(container.textContent).not.toContain('A future block');
  });
});

suite('the block parser', () => {
  function blocks(text) {
    loadRenderer();
    return window.Gatehouse.viewModel.outputBlocks(text);
  }

  it('yields an unterminated fence rather than dropping the result', () => {
    expect(blocks('```\nhalf a stream')).toEqual([{ kind: 'code', text: 'half a stream' }]);
  });

  it('keeps ordered and unordered runs apart', () => {
    expect(blocks('- a\n1. b')).toEqual([
      { kind: 'list', ordered: false, items: ['a'] },
      { kind: 'list', ordered: true, items: ['b'] },
    ]);
  });

  it('leaves inline markers exactly as the agent typed them', () => {
    /* A deliberate stop, not an unfinished parser: inline markdown's useful
     * half is the link, and an anchor whose href comes from agent output is
     * the escape hatch this package refuses to open. */
    expect(blocks('see **this** and [here](javascript:alert(1))')).toEqual([
      { kind: 'paragraph', text: 'see **this** and [here](javascript:alert(1))' },
    ]);
  });

  it('answers nothing for nothing', () => {
    expect(blocks('')).toEqual([]);
    expect(blocks(null)).toEqual([]);
  });
});
