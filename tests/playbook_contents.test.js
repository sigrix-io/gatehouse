/* The playbook block, driven by a playbook's own `playbook.json`.
 *
 * The fixture is a document as an author writes it, in the Muster format:
 * nine files, two of them pages and one the same checklist as another, and
 * six placeholders, two of which are one case apart.
 *
 *   - the files are drawn in `order`, each with its role in words;
 *   - the placeholders are drawn by when a buyer fills them in;
 *   - everything is text, a host's note included;
 *   - any 0.x is read, a member it does not know is ignored, and a document
 *     in another major, or missing what drawing needs, is refused whole;
 *   - nothing is fetched, and the block needs no other script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe as suite, it, expect, beforeEach, vi } from 'vitest';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(HERE, '../src');
const FIXTURES = path.resolve(HERE, 'fixtures/playbooks');

const RUN_MODULES = ['postern_client.js', 'run_view_model.js', 'refusal_copy.js', 'run_renderer.js'];

function load(names) {
  names.forEach(name => {
    // eslint-disable-next-line no-new-func
    new Function(fs.readFileSync(path.join(SRC, name), 'utf8')).call(window);
  });
  return window.Gatehouse;
}

/* A fresh copy each time, so a test that changes one member cannot leak it
 * into the next. */
function playbook() {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, 'month_end_close.playbook.json'), 'utf8'));
}

function mountPoint() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

function words(node) {
  return node.textContent.replace(/\s+/g, ' ').trim();
}

function draw(doc, options) {
  const NS = load(['playbook_contents.js']);
  const container = mountPoint();
  new NS.PlaybookContents(container, doc, options).render();
  return container;
}

function rows(container) {
  return [...container.querySelectorAll('.gh-playbook-file')];
}

function rowFor(container, filePath) {
  return rows(container).find(row => words(row.querySelector('.gh-playbook-path')) === filePath);
}

function leads(container) {
  return [...container.querySelectorAll('.gh-playbook-lead')].map(words);
}

function refusal(doc) {
  const container = draw(doc);
  expect(container.querySelector('.gh-playbook-file')).toBeNull();
  return words(container.querySelector('.gh-refuse'));
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.Gatehouse;
  delete window.SigrixRun;
});

suite('the files', () => {
  it('draws every file in the order a person works through them, with its role in words', () => {
    const doc = playbook();
    const container = draw(doc);
    const list = container.querySelector('.gh-playbook-files');
    expect(list.tagName).toBe('OL');
    expect(rows(container).every(row => row.tagName === 'LI' && row.parentElement === list)).toBe(true);
    expect(rows(container).map(row => words(row.querySelector('.gh-playbook-path')))).toEqual(doc.order);
    expect(rows(container).map(row => words(row.querySelector('.gh-playbook-role')))).toEqual([
      'Guide', 'Checklist', 'Checklist', 'Steps', 'Copy', 'Reference', 'Tool', 'License', 'Changelog',
    ]);
    const heading = container.querySelector('.gh-playbook-heading');
    expect(heading.tagName).toBe('H3');
    expect(words(heading)).toBe('The files');
    expect(leads(container)[0]).toBe('9 files, in the order you work through them.');
  });

  it('follows `order`, not the order `files` happens to list them in', () => {
    const doc = playbook();
    doc.files.reverse();
    expect(rows(draw(doc)).map(row => words(row.querySelector('.gh-playbook-path')))).toEqual(doc.order);
  });

  it('says which file another is a form of, and that a page works offline', () => {
    const container = draw(playbook());
    const about = filePath => {
      const sentence = rowFor(container, filePath).querySelector('.gh-playbook-about');
      return sentence ? words(sentence) : null;
    };
    expect(about('checklist.html')).toBe('Another form of CHECKLIST.md. Opens in a browser, and works offline.');
    expect(about('tools/reconcile.html')).toBe('Opens in a browser, and works offline.');
    expect(about('README.md')).toBeNull();
    expect(about('reference/categories.csv')).toBeNull();
  });

  it('claims a page works offline only when the document says it loads nothing', () => {
    const doc = playbook();
    delete doc.files.find(file => file.path === 'tools/reconcile.html').self_contained;
    const row = rowFor(draw(doc), 'tools/reconcile.html');
    expect(words(row.querySelector('.gh-playbook-about'))).toBe('Opens in a browser.');
  });

  it('names a role it does not know as the document spells it', () => {
    const doc = playbook();
    doc.files.find(file => file.path === 'close-steps.md').role = 'worksheet';
    const row = rowFor(draw(doc), 'close-steps.md');
    expect(words(row.querySelector('.gh-playbook-role'))).toBe('worksheet');
  });
});

suite('the placeholders', () => {
  it('draws them by when a buyer fills them in, each as the files write it', () => {
    const doc = playbook();
    const container = draw(doc);
    const groups = [...container.querySelectorAll('.gh-playbook-slot-group')];
    expect(groups.map(group => group.dataset.slotKind)).toEqual(['setup', 'message']);
    expect(groups.map(group => words(group.querySelector('.gh-playbook-subheading')))).toEqual([
      'Once, for your business', 'Each time you use it',
    ]);
    groups.forEach(group => {
      const kind = group.dataset.slotKind;
      const drawn = [...group.querySelectorAll('.gh-playbook-slot')].map(slot => [
        words(slot.querySelector('dt .gh-playbook-token')),
        words(slot.querySelector('dd.gh-playbook-slot-label')),
      ]);
      expect(drawn).toEqual(doc.slots[kind].map(slot => [slot.placeholder, slot.label]));
    });
    expect(leads(container)).toContain('6 placeholders, each in square brackets. Replace each with your own words wherever it appears.');
  });

  it('says case matters when two placeholders are one case apart, and only then', () => {
    const doc = playbook();
    expect(leads(draw(doc))).toContain('Case matters: [NAME] and [name] are different placeholders.');

    document.body.innerHTML = '';
    doc.slots.message[0].placeholder = '[client]';
    expect(leads(draw(doc)).join(' ')).not.toContain('Case matters');
  });

  it('draws no group for a kind with none, and says so when there are none at all', () => {
    const doc = playbook();
    doc.slots.message = [];
    doc.slots.setup = doc.slots.setup.slice(0, 1);
    let container = draw(doc);
    expect([...container.querySelectorAll('.gh-playbook-slot-group')].map(group => group.dataset.slotKind)).toEqual(['setup']);
    expect(leads(container)).toContain('One placeholder, in square brackets. Replace it with your own words wherever it appears.');

    document.body.innerHTML = '';
    doc.slots.setup = [];
    container = draw(doc);
    expect(container.querySelector('.gh-playbook-slot-group')).toBeNull();
    expect(leads(container)).toContain('None. Every file is used as it is.');
  });
});

suite('what a host adds', () => {
  it('draws a host\'s note beside the file it names, and nowhere else', () => {
    const container = draw(playbook(), {
      fileNotes: {
        'tools/reconcile.html': 'Its scripts run under a policy that blocks every network request.',
        'README.md': 42,
        'notes.md': 'A file the playbook does not hold.',
      },
    });
    const notes = [...container.querySelectorAll('.gh-playbook-note')];
    expect(notes).toHaveLength(1);
    expect(notes[0].closest('.gh-playbook-file')).toBe(rowFor(container, 'tools/reconcile.html'));
    expect(words(notes[0])).toBe('Its scripts run under a policy that blocks every network request.');
    expect(words(container)).not.toContain('A file the playbook does not hold.');
  });

  it('draws an author\'s markup, and a host\'s, as the characters they typed', () => {
    const doc = playbook();
    const label = '<img src=x onerror="window.pwned = 1">';
    doc.slots.setup[0].label = label;
    const container = draw(doc, { fileNotes: { 'README.md': '<b>Start here</b>' } });
    expect(words(container.querySelector('.gh-playbook-slot-label'))).toBe(label);
    expect(words(rowFor(container, 'README.md').querySelector('.gh-playbook-note'))).toBe('<b>Start here</b>');
    expect(container.querySelector('img, b')).toBeNull();
    expect(window.pwned).toBeUndefined();
  });

  it('takes the heading level a host asks for, between 2 and 6, and heads the kinds one below', () => {
    const levels = options => {
      document.body.innerHTML = '';
      const container = draw(playbook(), options);
      return [
        container.querySelector('.gh-playbook-heading').tagName,
        container.querySelector('.gh-playbook-subheading').tagName,
      ];
    };
    expect(levels({ headingLevel: 2 })).toEqual(['H2', 'H3']);
    expect(levels({ headingLevel: 6 })).toEqual(['H6', 'H6']);
    expect(levels({ headingLevel: 7 })).toEqual(['H3', 'H4']);
    expect(levels({ headingLevel: 'two' })).toEqual(['H3', 'H4']);
    expect(levels(undefined)).toEqual(['H3', 'H4']);
  });

  it('draws itself again from a new document, replacing what was there', () => {
    const NS = load(['playbook_contents.js']);
    const container = mountPoint();
    const block = new NS.PlaybookContents(container, playbook());
    block.render();
    const smaller = playbook();
    smaller.order = ['README.md'];
    smaller.files = [{ path: 'README.md', role: 'guide' }];
    block.update(smaller);
    expect(container.querySelectorAll('.gh-playbook')).toHaveLength(1);
    expect(rows(container)).toHaveLength(1);
  });
});

suite('a document is read whole, or refused whole', () => {
  it('reads any 0.x, and ignores what it does not know', () => {
    const doc = playbook();
    doc.format_version = '0.4';
    doc.connected_steps = [{ from: 'close-steps.md', to: 'an-assistant' }];
    doc.files[0].size_bytes = 2048;
    doc.slots.from_an_assistant = [{ placeholder: '[summary]', label: 'What an assistant wrote' }];
    const container = draw(doc);
    expect(rows(container)).toHaveLength(9);
    expect(container.querySelector('[data-slot-kind="from_an_assistant"]')).toBeNull();
    expect(words(container)).not.toContain('[summary]');
  });

  it('refuses a format it does not read, drawing none of it', () => {
    const doc = playbook();
    doc.format_version = '1.0';
    expect(refusal(doc)).toBe('This playbook could not be shown. It is in format 1.0, and this client reads format 0.x.');
    delete doc.format_version;
    document.body.innerHTML = '';
    expect(refusal(doc)).toBe('This playbook could not be shown. It carries no "format_version", and this client reads format 0.x.');
    doc.format_version = 0.1;
    document.body.innerHTML = '';
    expect(refusal(doc)).toBe('This playbook could not be shown. "format_version" is not a version such as 0.1.');
  });

  /* Each case is the fixture with one thing wrong, and the sentence the block
   * gives for it. `same_as` and `order` match paths exactly, as the format
   * does, so a case apart is a different file. */
  const BROKEN = [
    ['an array, not a document', () => [], 'The document is not an object.'],
    ['no files', doc => { delete doc.files; }, '"files" is missing.'],
    ['an empty list of files', doc => { doc.files = []; doc.order = []; }, '"files" lists no file.'],
    ['a file with no role', doc => { delete doc.files[3].role; }, '"role" is missing.'],
    ['a file listed twice', doc => { doc.files.push({ path: 'README.md', role: 'guide' }); }, '"files" lists README.md twice.'],
    [
      'a form of a file the playbook does not hold',
      doc => { doc.files[2].same_as = 'checklist.md'; },
      'checklist.html is the same as checklist.md, which is not another file in "files".',
    ],
    [
      'a form of itself',
      doc => { doc.files[2].same_as = 'checklist.html'; },
      'checklist.html is the same as checklist.html, which is not another file in "files".',
    ],
    ['no order', doc => { delete doc.order; }, '"order" is missing.'],
    ['an order naming a file not listed', doc => { doc.order.push('notes.md'); }, '"order" names notes.md, which "files" does not.'],
    ['an order naming a file twice', doc => { doc.order.push('README.md'); }, '"order" names README.md twice.'],
    ['an order leaving a file out', doc => { doc.order.pop(); }, '"order" leaves out CHANGELOG.md.'],
    ['no placeholders member', doc => { delete doc.slots; }, '"slots" is missing.'],
    ['no list for a kind', doc => { delete doc.slots.setup; }, '"slots.setup" is missing.'],
    ['a placeholder with no label', doc => { delete doc.slots.message[1].label; }, '"label" is missing.'],
  ];

  BROKEN.forEach(([what, breakIt, sentence]) => {
    it(`refuses ${what}, saying why`, () => {
      const doc = playbook();
      const broken = breakIt(doc) || doc;
      expect(refusal(broken)).toBe('This playbook could not be shown. ' + sentence);
    });
  });

  it('lets a host read a document the way the block does', () => {
    const NS = load(['playbook_contents.js']);
    expect(NS.playbookData.FORMAT_MAJOR).toBe(0);
    expect(NS.playbookData.ROLES).toEqual(['guide', 'steps', 'checklist', 'copy', 'reference', 'tool', 'license', 'changelog']);
    expect(NS.playbookData.readPlaybook(playbook()).value.files.map(file => file.path)).toEqual(playbook().order);
    expect(NS.playbookData.readPlaybook({ format_version: '0.1' })).toEqual({ refusal: '"files" is missing.' });
  });
});

suite('the boundary', () => {
  it('fetches nothing while drawing', () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error('no network here')));
    window.fetch = fetchSpy;
    draw(playbook(), { fileNotes: { 'README.md': 'Start here.' } });
    expect(fetchSpy).not.toHaveBeenCalled();
    delete window.fetch;
  });

  it('stands alone: a page that draws a playbook loads no other script', () => {
    const container = draw(playbook());
    expect(window.Gatehouse.RunRenderer).toBeUndefined();
    expect(window.Gatehouse.AppCard).toBeUndefined();
    expect(rows(container)).toHaveLength(9);
  });

  it('joins the namespace the other scripts built, without replacing it', () => {
    const NS = load([...RUN_MODULES, 'host_blocks.js', 'playbook_contents.js']);
    expect(NS.RunRenderer).toBeTypeOf('function');
    expect(NS.AppCard).toBeTypeOf('function');
    expect(NS.PlaybookContents).toBeTypeOf('function');
    expect(window.SigrixRun).toBe(window.Gatehouse);
  });
});
