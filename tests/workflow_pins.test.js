/* Every action this repository runs is pinned to a commit. This is what notices
 * if one stops being.
 *
 * A `uses:` line names code that runs with this repository's checkout, and in
 * the release with npm's publish identity. A tag -- `@v6` -- is moved by whoever
 * owns the action, so the code that ran on a release could change with nothing
 * here recording it, and the diff of the run that shipped would read identically
 * to the one before.
 *
 * Pinning the commit closes that. The cost is that a pin only stays correct if
 * something bumps it, which is what the `github-actions` entry in
 * `.github/dependabot.yml` is for -- and Dependabot reads the `# vX.Y.Z` comment
 * beside each SHA to know what it is bumping from, so a pin written without one
 * goes quietly stale. Both halves are asserted below.
 *
 * Read as text rather than parsed: the assertions are about how the reference
 * is written, which a YAML loader normalises away. The same guard, in Python,
 * is `tests/test_workflow_pins.py` in the sibling repositories.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe as suite, it, expect } from 'vitest';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKFLOWS_DIR = path.resolve(HERE, '../.github/workflows');
const WORKFLOWS = fs
  .readdirSync(WORKFLOWS_DIR)
  .filter((name) => name.endsWith('.yml'))
  .sort();

/* `uses: owner/action@<ref>`, with whatever trailing comment. */
const USES = /uses:\s*(\S+)@(\S+)(?:\s*#\s*(\S+))?/g;
const COMMIT_SHA = /^[0-9a-f]{40}$/;

function referencesIn(text) {
  return [...text.matchAll(USES)].map(([, action, ref, comment]) => ({
    action,
    ref,
    comment: comment || '',
  }));
}

function references() {
  return WORKFLOWS.flatMap((workflow) =>
    referencesIn(fs.readFileSync(path.join(WORKFLOWS_DIR, workflow), 'utf8')).map((found) => ({
      workflow,
      ...found,
    })),
  );
}

suite('workflow pins', () => {
  it('matches the way these workflows write a reference', () => {
    // Guards the guard: a pattern matching nothing would pass every test below.
    expect(referencesIn('      - uses: actions/checkout@v6\n')).toEqual([
      { action: 'actions/checkout', ref: 'v6', comment: '' },
    ]);
    expect(referencesIn('- uses: a/b@abc # v1.2.3\n')).toEqual([{ action: 'a/b', ref: 'abc', comment: 'v1.2.3' }]);
    expect(WORKFLOWS.length).toBeGreaterThan(0);
    expect(references().length).toBeGreaterThan(0);
  });

  it('pins every action to a commit', () => {
    const floating = references()
      .filter(({ ref }) => !COMMIT_SHA.test(ref))
      .map(({ workflow, action, ref }) => `${workflow}: ${action}@${ref}`);
    expect(floating, 'a tag is mutable and a branch moves on its own; pin the 40-character commit').toEqual([]);
  });

  it('says which release each pin is', () => {
    // A bare SHA is safe and unreadable. The comment is what a reviewer reads,
    // and what Dependabot rewrites when it bumps the pin.
    const unnamed = references()
      .filter(({ comment }) => !/^v\d+\.\d+(\.\d+)?$/.test(comment))
      .map(({ workflow, action, comment }) => `${workflow}: ${action} # ${comment}`);
    expect(unnamed, 'write the release it is, as `# v6.1.0`').toEqual([]);
  });

  it('publishes without a stored npm credential', () => {
    // Trusted publishing is why there is no token here to leak; a `secrets.`
    // reference in the release would mean that decision was quietly reversed.
    const release = fs.readFileSync(path.join(WORKFLOWS_DIR, 'release.yml'), 'utf8');
    const offenders = release
      .split('\n')
      .filter((line) => line.includes('secrets.') && !line.trimStart().startsWith('#'));
    expect(offenders).toEqual([]);
    expect(release).toContain('id-token: write');
  });
});
