/* Both names, one object.
 *
 * The other suites here read `window.Gatehouse`, which is the canonical name.
 * That leaves nothing asserting the deprecated alias still works — and the
 * alias is the whole reason the host this package was extracted from did not
 * have to change three live pages in the same commit. A compatibility name
 * nothing exercises is one that breaks on the next refactor, silently, in
 * somebody else's repository.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe as suite, it, expect, beforeEach } from 'vitest';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(HERE, '../src');
const MODULES = ['postern_client.js', 'run_view_model.js', 'refusal_copy.js', 'run_renderer.js'];

function load(names) {
  (names || MODULES).forEach(name => {
    // eslint-disable-next-line no-new-func
    new Function(fs.readFileSync(path.join(SRC, name), 'utf8')).call(window);
  });
}

beforeEach(() => {
  delete window.Gatehouse;
  delete window.SigrixRun;
});

suite('the global surface', () => {
  it('exposes the canonical name', () => {
    load();
    expect(window.Gatehouse).toBeTypeOf('object');
  });

  it('is the same object under the deprecated name, not a copy', () => {
    load();
    // Identity, not deep equality: a host holding one reference must see
    // everything the other name sees, including members added after it looked.
    expect(window.SigrixRun).toBe(window.Gatehouse);
  });

  it('carries every member the host constructs by name', () => {
    load();
    // Exactly what src/templates/*.html reach for in the host, plus the two
    // error types its own catch blocks name.
    ['PosternClient', 'RunRenderer', 'PosternRefusal', 'PosternUnreachable']
      .forEach(member => expect(window.SigrixRun[member]).toBeTypeOf('function'));
  });

  it('keeps the two names together as each file loads', () => {
    // Every file reassigns the namespace rather than mutating it, so an alias
    // pointed once at the first file's object would be stale by the fourth.
    MODULES.forEach((name, index) => {
      load([name]);
      expect(window.SigrixRun).toBe(window.Gatehouse);
      expect(Object.keys(window.Gatehouse).length).toBeGreaterThan(index);
    });
  });

  it('accumulates rather than replacing what an earlier file added', () => {
    load(['postern_client.js']);
    const afterFirst = Object.keys(window.Gatehouse);
    load(['run_renderer.js']);
    afterFirst.forEach(key => expect(window.Gatehouse).toHaveProperty(key));
    expect(window.Gatehouse.RunRenderer).toBeTypeOf('function');
  });
});
