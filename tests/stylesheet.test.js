/* Every class the renderer draws has a rule in `gatehouse.css`.
 *
 * The scripts ship no CSS of their own, so an unstyled class is not a cosmetic
 * gap: it is the page rendering as a wall of text, which no assertion about the
 * DOM can see.
 *
 * The classes are read from the source rather than listed here, because the
 * point is to notice a class the renderer grows. The tag in `el(tag, class)` is
 * matched as anything up to the comma, since some are computed
 * (`el('h' + level, …)`); the class must be a literal, since a computed one is
 * a name this test could not check anyway.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe as suite, it, expect } from 'vitest';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(HERE, '../src');
const STYLESHEET = fs.readFileSync(path.join(SRC, 'gatehouse.css'), 'utf8');

/* Built by concatenation rather than written whole, so the scan sees only their
 * stems: the entitlement tones come from the view model, and the credential
 * states and the invalid-field marker are toggled by the renderer. The host
 * blocks add a status's tone, a meter's share and a figure's column. */
const DYNAMIC_CLASSES = [
  'run-entitlement--quiet',
  'run-entitlement--caution',
  'run-entitlement--blocked',
  'is-satisfied',
  'is-missing',
  'is-invalid',
  'gh-status--ok',
  'gh-status--caution',
  'gh-status--blocked',
  'gh-status--quiet',
  'gh-meter--clear',
  'gh-meter--near',
  'gh-meter--full',
  'gh-num',
];

function emittedClasses() {
  const found = new Set();
  fs.readdirSync(SRC)
    .filter(name => name.endsWith('.js'))
    .forEach(name => {
      const source = fs.readFileSync(path.join(SRC, name), 'utf8');
      for (const match of source.matchAll(/el\(\s*[^,\n]+,\s*'([a-z][a-z0-9 -]*)'/g)) {
        match[1].split(/\s+/).filter(Boolean).forEach(token => found.add(token));
      }
    });
  return found;
}

function escaped(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

suite('the stylesheet', () => {
  it('scans enough of the renderer to mean something', () => {
    // An empty scan would pass the next test vacuously, and so would one that
    // stopped seeing computed tags: the last two are built that way.
    const emitted = emittedClasses();
    expect(emitted.size).toBeGreaterThan(20);
    ['run-shell', 'run-field-control', 'run-md-heading', 'run-md-list'].forEach(name =>
      expect(emitted.has(name), name).toBe(true)
    );
  });

  it('has a rule for every class the renderer draws', () => {
    const missing = [...emittedClasses(), ...DYNAMIC_CLASSES]
      .filter(name => !name.endsWith('--'))
      .filter(name => !new RegExp(`\\.${escaped(name)}(?![\\w-])`).test(STYLESHEET))
      .sort();
    expect(missing).toEqual([]);
  });
});

/* What a host's own reset usually supplies, and a page that links only this
 * file does not have. 0.1.0 left both to the host, so a page with no other
 * stylesheet drew its full-width fields past their card and its link in the
 * browser's blue, 1.9:1 on the dark surface. The page is mounted from real
 * describe documents with nothing but this stylesheet on it. */
const FIXTURES = path.resolve(HERE, 'fixtures/postern_describe');
const MODULES = ['postern_client.js', 'run_view_model.js', 'refusal_copy.js', 'run_renderer.js'];
const PAGES = [
  ['conformance_fake.describe.json', 'conformance_fake.status.json'],
  ['pipeline_crew.describe.json', 'pipeline_crew.status.json'],
];

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

async function mountAlone([describeName, statusName]) {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete window.Gatehouse;
  const style = document.createElement('style');
  style.textContent = STYLESHEET;
  document.head.appendChild(style);
  MODULES.forEach(name => {
    // eslint-disable-next-line no-new-func
    new Function(fs.readFileSync(path.join(SRC, name), 'utf8')).call(window);
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const client = {
    describe: () => Promise.resolve(fixture(describeName)),
    status: () => Promise.resolve(fixture(statusName)),
    run: () => Promise.resolve({ run_id: 'r-1', output: { type: 'text', value: 'done' } }),
    stream: () => Promise.resolve(),
  };
  await new window.Gatehouse.RunRenderer(container, client).load();
  return { container, sheet: style.sheet };
}

/* jsdom parses the sheet but does not cascade `box-sizing`, so the question is
 * asked of the rules themselves: does one that matches this element say so. */
function sizedBorderBox(element, sheet) {
  return [...sheet.cssRules].some(rule =>
    rule.selectorText &&
    rule.style.getPropertyValue('box-sizing') === 'border-box' &&
    rule.selectorText.split(',').map(part => part.trim()).filter(part => !part.includes('::'))
      .some(part => element.matches(part))
  );
}

function anchorClasses() {
  const source = fs.readFileSync(path.join(SRC, 'run_renderer.js'), 'utf8');
  return [...source.matchAll(/el\(\s*'a'\s*,\s*'([a-z][a-z0-9-]*)'/g)].map(match => match[1]);
}

suite('the stylesheet, on a page with no other', () => {
  it('sizes every form control the renderer draws border-box', async () => {
    const tags = new Set();
    for (const page of PAGES) {
      const { container, sheet } = await mountAlone(page);
      expect(sheet.cssRules.length).toBeGreaterThan(50);
      const controls = [...container.querySelectorAll('input, textarea, select')];
      controls.forEach(control => tags.add(control.tagName.toLowerCase()));
      const unsized = controls.filter(control => !sizedBorderBox(control, sheet))
        .map(control => `${control.tagName.toLowerCase()}.${control.className}`);
      expect(unsized, page[0]).toEqual([]);
    }
    // The two a browser draws content-box are among them, or this proves nothing.
    expect([...tags].sort()).toEqual(expect.arrayContaining(['input', 'textarea']));
  });

  it('leaves no link on the browser\'s own colour', async () => {
    const { container } = await mountAlone(PAGES[1]);
    const bare = document.createElement('a');
    bare.href = '#';
    document.body.appendChild(bare);
    const browserColour = getComputedStyle(bare).color;
    expect(browserColour).toBeTruthy();

    // The crew's missing key draws a real one; the rest are placed in the shell.
    expect(container.querySelector('a.run-credential-link')).not.toBeNull();
    const classes = anchorClasses();
    expect(classes).toEqual(expect.arrayContaining(['run-credential-link', 'run-download']));
    const shell = container.querySelector('.run-shell');
    const placed = classes.map(name => {
      const link = document.createElement('a');
      link.className = name;
      link.href = '#';
      shell.appendChild(link);
      return link;
    });
    const onBrowserColour = [...container.querySelectorAll('a'), ...placed]
      .filter(link => getComputedStyle(link).color === browserColour)
      .map(link => link.className);
    expect(onBrowserColour).toEqual([]);
  });
});

/* A status colour comes in two weights. The fill (`--run-ok`, `--run-warn`,
 * `--run-danger`, from a host's `--sx-ok` and the rest) is for borders and
 * bars, and is too light to be read as words on a light surface: `#DC2C50`
 * measured 4.38:1 on `--sx-surface-2`. Words take the ink, `--run-*-text`,
 * which reads a host's `-text` token. A missing credential's tick painted its
 * "not set" in the fill until 0.2. */
suite('status colours', () => {
  const declarations = [...STYLESHEET.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?<![\w-])color\s*:\s*([^;}]+)/g)]
    .map(match => match[1].trim());

  it('reads the declarations it judges', () => {
    // Every word-colour rule is among them, the ticks' included.
    expect(declarations.length).toBeGreaterThan(20);
    expect(declarations).toContain('var(--run-danger-text)');
  });

  it('never paints words in a status fill', () => {
    const fills = declarations.filter(value => /var\(--run-(ok|warn|danger)\)/.test(value));
    expect(fills).toEqual([]);
  });

  it('defines every ink it paints with, in both themes', () => {
    ['--run-ok-text', '--run-warn-text', '--run-danger-text'].forEach(name => {
      const defined = STYLESHEET.match(new RegExp(`${name}\\s*:`, 'g')) || [];
      expect(defined.length, name).toBe(2);
    });
  });
});
