## What this changes

<!-- One or two sentences. The diff shows what changed; say why. -->

## Which section of the specification does it follow?

<!--
A change to how a verb, an event or an input is handled names the section of
Postern it follows: "§4.3 says prefer `done`" is reviewable, "this seemed more
correct" is not. Write "none" for a change that is only about how the page is
drawn.
-->

## Have you watched the new test fail?

<!--
Break the implementation on purpose, confirm the test that names the claim
goes red, then put it back. Say which mutation you tried.
-->

## Checks

- [ ] `npm ci` and `npm test`
- [ ] Still no `innerHTML`: every agent string reaches the page through `textContent`
- [ ] Every request still goes to the base URL, under the protocol's path prefix
- [ ] A new script or stylesheet in `src/` has an entry in `package.json`'s `exports`
- [ ] `CHANGELOG.md` has a line under *Unreleased*, with a migration note if it breaks anything
