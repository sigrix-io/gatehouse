/* What is inside a playbook: its files, in the order a person works through
 * them, with what each one is for, and the placeholders a buyer fills in.
 *
 * A playbook is a process a business runs by hand, sold as the files a person
 * works through, and described by a `playbook.json` in the Muster format. The
 * host hands that document in, parsed, and the block draws it. There is
 * nothing to run and nothing to fetch: the block never reads a file and never
 * draws a file's text, only what the document says the files are, so a page
 * may show a playbook's contents to someone who has not bought it.
 *
 * It reads format 0.x. A minor version only adds members an earlier reader can
 * ignore, so any 0.x is read and a member this file does not name is ignored;
 * a major version it does not know is refused, whole, saying why.
 *
 * **Nothing here uses `innerHTML`.** A path, a placeholder's label and a
 * host's note are someone's typing, and all of it reaches the page through
 * `textContent`. No attribute is written from the document.
 */
(function (global) {
  const root = global || (typeof window !== 'undefined' ? window : {});

  /* The major version of the format this file reads. */
  const FORMAT_MAJOR = 0;

  /* What each role the format names is called here. A role this client has
   * not heard of is shown as the document spells it, rather than guessed into
   * one of these. */
  const ROLES = {
    guide: 'Guide',
    steps: 'Steps',
    checklist: 'Checklist',
    copy: 'Copy',
    reference: 'Reference',
    tool: 'Tool',
    license: 'License',
    changelog: 'Changelog',
  };

  /* The kinds of placeholder the format names, by when a buyer fills them in,
   * in the format's order. A kind a later minor adds is ignored, as the
   * format lets a reader ignore what it does not know. */
  const SLOT_KINDS = [
    ['setup', 'Once, for your business'],
    ['message', 'Each time you use it'],
  ];

  function el(tag, className, textContent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent !== undefined && textContent !== null) node.textContent = String(textContent);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function has(table, key) {
    return Object.prototype.hasOwnProperty.call(table, key);
  }

  /* ---------- reading the document ----------
   *
   * The reader answers `{ value }` or `{ refusal }`, never both. A refusal is
   * one sentence naming what was wrong, for whoever built the host's data. The
   * block checks only what drawing needs: that the members it reads are what
   * the format says they are, and that `order` and `same_as` name the files
   * `files` lists, matched exactly, as the format matches them. Whether the
   * files really say what the document claims is a checker's question, asked
   * of the files, which this block never has. */

  class Fault extends Error {}

  function formatOf(doc) {
    const value = doc.format_version;
    if (value === undefined || value === null) {
      throw new Fault('It carries no "format_version", and this client reads format ' + FORMAT_MAJOR + '.x.');
    }
    if (typeof value !== 'string' || !/^\d+\.\d+$/.test(value)) {
      throw new Fault('"format_version" is not a version such as 0.1.');
    }
    if (Number(value.split('.')[0]) !== FORMAT_MAJOR) {
      throw new Fault('It is in format ' + value + ', and this client reads format ' + FORMAT_MAJOR + '.x.');
    }
    return value;
  }

  function textMember(doc, key, required) {
    const value = doc[key];
    if (value === undefined || value === null) {
      if (required) throw new Fault('"' + key + '" is missing.');
      return '';
    }
    if (typeof value !== 'string') throw new Fault('"' + key + '" is not text.');
    if (required && !value.trim()) throw new Fault('"' + key + '" is empty.');
    return value;
  }

  function listMember(doc, key, where) {
    const value = doc[key];
    const name = where ? where + '.' + key : key;
    if (value === undefined || value === null) throw new Fault('"' + name + '" is missing.');
    if (!Array.isArray(value)) throw new Fault('"' + name + '" is not a list.');
    return value;
  }

  function readFiles(doc) {
    const entries = listMember(doc, 'files');
    if (!entries.length) throw new Fault('"files" lists no file.');
    const byPath = new Map();
    entries.forEach(function (entry) {
      if (!isObject(entry)) throw new Fault('"files" holds something other than a file.');
      const path = textMember(entry, 'path', true);
      if (byPath.has(path)) throw new Fault('"files" lists ' + path + ' twice.');
      byPath.set(path, {
        path,
        role: textMember(entry, 'role', true),
        sameAs: textMember(entry, 'same_as', false),
        selfContained: entry.self_contained === true,
      });
    });
    byPath.forEach(function (file) {
      if (file.sameAs && (file.sameAs === file.path || !byPath.has(file.sameAs))) {
        throw new Fault(file.path + ' is the same as ' + file.sameAs + ', which is not another file in "files".');
      }
    });

    /* Drawn in `order`, which names every file once: the order a person works
     * through them is part of what the playbook is. */
    const seen = new Set();
    const ordered = listMember(doc, 'order').map(function (path) {
      if (typeof path !== 'string') throw new Fault('"order" holds something other than a path.');
      if (!byPath.has(path)) throw new Fault('"order" names ' + path + ', which "files" does not.');
      if (seen.has(path)) throw new Fault('"order" names ' + path + ' twice.');
      seen.add(path);
      return byPath.get(path);
    });
    byPath.forEach(function (file) {
      if (!seen.has(file.path)) throw new Fault('"order" leaves out ' + file.path + '.');
    });
    return ordered;
  }

  function readSlots(doc) {
    if (!isObject(doc.slots)) throw new Fault('"slots" is missing.');
    return SLOT_KINDS.map(function (kind) {
      const entries = listMember(doc.slots, kind[0], 'slots');
      return {
        kind: kind[0],
        heading: kind[1],
        slots: entries.map(function (entry) {
          if (!isObject(entry)) throw new Fault('"slots.' + kind[0] + '" holds something other than a placeholder.');
          return { placeholder: textMember(entry, 'placeholder', true), label: textMember(entry, 'label', true) };
        }),
      };
    });
  }

  function readPlaybook(doc) {
    try {
      if (!isObject(doc)) throw new Fault('The document is not an object.');
      const formatVersion = formatOf(doc);
      return { value: { formatVersion, files: readFiles(doc), slotGroups: readSlots(doc) } };
    } catch (err) {
      if (err instanceof Fault) return { refusal: err.message };
      throw err;
    }
  }

  /* ---------- writing it down ---------- */

  function headingLevel(options) {
    const level = Number(options && options.headingLevel);
    return Number.isInteger(level) && level >= 2 && level <= 6 ? level : 3;
  }

  function plural(count, one, many) {
    return count + ' ' + (count === 1 ? one : many);
  }

  /* `a`, `a and b`, `a, b and c`. */
  function and(items) {
    return items.length === 1 ? items[0] : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  /* What a file adds to its role: the file it is another form of, and, for a
   * page, that it opens in a browser and loads nothing. Only an `.html` file
   * the document calls self-contained is said to work offline. */
  function about(file) {
    const parts = [];
    if (file.sameAs) parts.push('Another form of ' + file.sameAs + '.');
    if (/\.html$/i.test(file.path)) {
      parts.push(file.selfContained ? 'Opens in a browser, and works offline.' : 'Opens in a browser.');
    }
    return parts.join(' ');
  }

  /* A sentence the host adds to one file, keyed by its path: something the
   * host knows that the document does not say, such as what it found when it
   * read the file. Drawn as text, beside the file it names; a note for a path
   * the playbook does not hold is not drawn. */
  function hostNote(options, path) {
    const notes = options && options.fileNotes;
    if (!isObject(notes) || !has(notes, path)) return '';
    const note = notes[path];
    return typeof note === 'string' ? note.trim() : '';
  }

  /* Two placeholders one case apart are two placeholders, which a reader
   * replacing them by eye could take for one, so the block says so. */
  function caseNote(groups) {
    const folded = new Map();
    groups.forEach(function (group) {
      group.slots.forEach(function (slot) {
        const key = slot.placeholder.toLowerCase();
        if (!folded.has(key)) folded.set(key, []);
        if (folded.get(key).indexOf(slot.placeholder) === -1) folded.get(key).push(slot.placeholder);
      });
    });
    const pairs = [];
    folded.forEach(function (spellings) {
      if (spellings.length > 1) pairs.push(and(spellings) + ' are different placeholders');
    });
    return pairs.length ? 'Case matters: ' + pairs.join('; ') + '.' : '';
  }

  function filesPart(files, level, options) {
    const part = el('div', 'gh-playbook-part');
    part.appendChild(el('h' + level, 'gh-playbook-heading', 'The files'));
    part.appendChild(el('p', 'gh-playbook-lead', plural(files.length, 'file', 'files') + ', in the order you work through them.'));
    const list = el('ol', 'gh-playbook-files');
    files.forEach(function (file) {
      /* The row's parts sit in a box of their own, so the item stays a list
       * item and keeps the number the browser gives it: an item laid out as
       * a flex row is drawn with none. */
      const item = el('li', 'gh-playbook-file');
      const body = el('div', 'gh-playbook-file-body');
      body.appendChild(el('code', 'gh-playbook-path', file.path));
      body.appendChild(el('span', 'gh-playbook-role', has(ROLES, file.role) ? ROLES[file.role] : file.role));
      const sentence = about(file);
      if (sentence) body.appendChild(el('span', 'gh-playbook-about', sentence));
      const note = hostNote(options, file.path);
      if (note) body.appendChild(el('span', 'gh-playbook-note', note));
      item.appendChild(body);
      list.appendChild(item);
    });
    part.appendChild(list);
    return part;
  }

  function placeholdersPart(groups, level) {
    const part = el('div', 'gh-playbook-part');
    part.appendChild(el('h' + level, 'gh-playbook-heading', 'The placeholders'));
    const total = groups.reduce((sum, group) => sum + group.slots.length, 0);
    if (!total) {
      part.appendChild(el('p', 'gh-playbook-lead', 'None. Every file is used as it is.'));
      return part;
    }
    part.appendChild(el('p', 'gh-playbook-lead', total === 1
      ? 'One placeholder, in square brackets. Replace it with your own words wherever it appears.'
      : total + ' placeholders, each in square brackets. Replace each with your own words wherever it appears.'));
    const note = caseNote(groups);
    if (note) part.appendChild(el('p', 'gh-playbook-lead', note));
    /* Hoisted rather than written in the call, so the stylesheet's test, which
     * reads the class beside the first comma, sees this one too. */
    const subheading = 'h' + Math.min(level + 1, 6);
    groups.forEach(function (group) {
      if (!group.slots.length) return;
      const section = el('div', 'gh-playbook-slot-group');
      section.dataset.slotKind = group.kind;
      section.appendChild(el(subheading, 'gh-playbook-subheading', group.heading));
      const list = el('dl', 'gh-playbook-slots');
      group.slots.forEach(function (slot) {
        const row = el('div', 'gh-playbook-slot');
        const name = el('dt', 'gh-playbook-slot-name');
        name.appendChild(el('code', 'gh-playbook-token', slot.placeholder));
        row.appendChild(name);
        row.appendChild(el('dd', 'gh-playbook-slot-label', slot.label));
        list.appendChild(row);
      });
      section.appendChild(list);
      part.appendChild(section);
    });
    return part;
  }

  class PlaybookContents {
    /* `playbook` is a playbook's `playbook.json`, parsed. `options.headingLevel`
     * (2 to 6, default 3) is the level of the block's two headings, and the
     * placeholders' kinds take the level below. `options.fileNotes` maps a
     * file's path to a sentence of the host's own, drawn beside that file. */
    constructor(container, playbook, options) {
      this.container = container;
      this.playbook = playbook;
      this.options = options || {};
    }

    render() {
      clear(this.container);
      const block = el('section', 'gh-block gh-playbook');
      this.container.appendChild(block);
      const read = readPlaybook(this.playbook);
      if (read.refusal) {
        block.appendChild(el('p', 'gh-refuse', 'This playbook could not be shown. ' + read.refusal));
        return;
      }
      const level = headingLevel(this.options);
      block.appendChild(filesPart(read.value.files, level, this.options));
      block.appendChild(placeholdersPart(read.value.slotGroups, level));
    }

    update(playbook) {
      this.playbook = playbook;
      this.render();
    }
  }

  root.Gatehouse = Object.assign({}, root.Gatehouse, {
    PlaybookContents,
    playbookData: { FORMAT_MAJOR, ROLES: Object.keys(ROLES), readPlaybook },
  });

  /* The deprecated alias the other scripts keep; see `host_blocks.js`. */
  root.SigrixRun = root.Gatehouse;
})(typeof window !== 'undefined' ? window : globalThis);
