/* The package's boundary, as assertions.
 *
 * Gatehouse holds nothing but a Postern client and a page: no distributor, no
 * listing, no second origin, no markup from an agent. A boundary nobody checks
 * closes quietly (a listing id copied into a label, a helper imported for one
 * line), so each half of it is a test rather than a paragraph in the README.
 *
 * Every scan strips comments first. The scripts explain at length why they use
 * no `EventSource` and no `innerHTML`, and a bare substring scan reads those
 * explanations as the violations they warn against.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe as suite, it, expect } from 'vitest';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, 'src');
const PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const SCRIPTS = fs.readdirSync(SRC).filter(name => name.endsWith('.js')).sort();

function code(name) {
  return fs
    .readFileSync(path.join(SRC, name), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

suite('what the package ships', () => {
  it('is the four scripts and the stylesheet', () => {
    expect(SCRIPTS).toEqual(['postern_client.js', 'refusal_copy.js', 'run_renderer.js', 'run_view_model.js']);
    expect(fs.readdirSync(SRC).sort()).toEqual([...SCRIPTS, 'gatehouse.css'].sort());
  });

  it('exports every file it ships, and nothing it does not', () => {
    // `files` is an allow-list and `exports` a second one: a source file missing
    // from either is absent for a consumer, and the failure is their blank page.
    const exported = Object.values(PACKAGE.exports).filter(target => target.startsWith('./src/'));
    expect(exported.map(target => target.slice('./src/'.length)).sort()).toEqual(fs.readdirSync(SRC).sort());
    expect(PACKAGE.files).toContain('src/');
  });

  it('has no runtime dependency', () => {
    expect(PACKAGE.dependencies).toBeUndefined();
    expect(PACKAGE.peerDependencies).toBeUndefined();
  });
});

suite('the boundary', () => {
  it('imports nothing, in either module system', () => {
    SCRIPTS.forEach(name => {
      const source = code(name);
      expect(source, name).not.toMatch(/\bimport\s*[({'"a-zA-Z*]/);
      expect(source, name).not.toMatch(/\brequire\s*\(/);
    });
  });

  it('names no distributor but the deprecated alias', () => {
    // A distributor's name in the code means the package is holding something
    // about one. The old global is the one exception, and it goes at 1.0.
    SCRIPTS.forEach(name => {
      const found = code(name).match(/sigrix\w*/gi) || [];
      found.forEach(word => expect(word, name).toBe('SigrixRun'));
    });
  });

  it('bakes in no listing identifier and no marketplace path', () => {
    SCRIPTS.forEach(name => {
      const source = code(name);
      expect(source, name).not.toMatch(/listing_?id/i);
      expect(source, name).not.toContain('/listings');
    });
  });
});

suite('agent output is untrusted', () => {
  it('never writes markup', () => {
    SCRIPTS.forEach(name => {
      const source = code(name);
      ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'DOMParser'].forEach(api =>
        expect(source, `${name} uses ${api}`).not.toContain(api)
      );
    });
  });

  it('reads the stream without reconnecting', () => {
    // EventSource cannot POST and reopens on its own, and a reopened stream is
    // a new run: the way a client spends someone's money twice.
    SCRIPTS.forEach(name => expect(code(name), name).not.toContain('EventSource'));
  });
});
