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
 * states and the invalid-field marker are toggled by the renderer. */
const DYNAMIC_CLASSES = [
  'run-entitlement--quiet',
  'run-entitlement--caution',
  'run-entitlement--blocked',
  'is-satisfied',
  'is-missing',
  'is-invalid',
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
