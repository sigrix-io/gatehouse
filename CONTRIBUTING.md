# Contributing

Thank you for looking. This document is deliberately blunt about what you can
expect, because a contribution guide that implies a service level nobody staffed
is worse than no guide at all.

## What to expect

**This package is maintained by a very small team.**

| | Realistic expectation |
|---|---|
| **Security reports** | Acknowledged within three working days. These jump every queue. |
| **Issues** | Read within a week. A reply may be "noted, not soon." |
| **Pull requests** | Reviewed within two weeks, longer for anything touching a protocol rule. |
| **Silence** | Means the queue, not a verdict. Ping the thread. |

Merging is discretionary and stays with the maintainers. Contributions are
genuinely welcome; governance is not open. Apache-2.0 means you can fork this
and go — no hard feelings, and please tell us what we got wrong.

## Reporting a security issue

**Do not open a public issue.** Email **security@sigrix.io** — see
[SECURITY.md](SECURITY.md). This package renders agent output in a browser, so
anything that gets that output interpreted rather than shown is the report that
matters most.

## Working on it

```bash
npm ci
npm test
```

**`npm ci`, not `npm install`.** npm 10's dependency resolver crashes on
vitest's optional peer graph (`Cannot read properties of null (reading
'edgesOut')`, measured on npm 10.9.7 with vitest 5.0.1), with or without exact
version pins. Reifying the committed lockfile avoids it. To add or bump a
dependency, regenerate the lock with npm 11 (`npx npm@11 install`) and read the
diff before committing it.

## The two rules that are not negotiable

Both are enforced by tests, and a pull request that erodes either will be turned
down however good the rest of it is.

- **No `innerHTML`, anywhere.** Every string from an agent reaches the page
  through `textContent`. This is why the markdown support is block structure
  only: inline markdown's useful half is the link, and an anchor whose `href`
  comes from agent output is exactly the hole the ban closes. If you need
  richer output, the answer is a new block type built with `createElement`.
- **One origin.** Every request goes to the base URL the caller passed, and to
  the protocol's path prefix. No font, no icon CDN, no version ping. A test
  intercepts `fetch` and asserts the origin of everything.

## A test has to be able to fail

Most of what this package gets right is invisible when it goes wrong — a client
that mishandles a stream still renders a page and still shows an answer. So a
test can assert the right thing about the right element and still be worthless.

- **Watch your test fail.** Break the implementation deliberately, confirm the
  test that names the claim goes red, then put it back. Say which mutation you
  tried in the pull request.
- **Assert identity where identity is the claim.** The alias test is the worked
  example: `window.SigrixRun` being *deep equal* to `window.Gatehouse` is the
  plausible-looking bug, and only `toBe` catches it.
- **A rule about ignoring things needs a document that contains them.** An
  unrecognised event name, an unknown input type, an unrecognised `validation`
  member — none of the shipped fixtures carry those by accident.

## Changing behaviour the specification decides

This package implements [Postern](https://github.com/sigrix-io/postern), which
lives in another repository. Two consequences:

- **Quote the section.** A pull request changing how a verb, an event or an
  input is handled should name the section it is following. "§4.3 says prefer
  `done`" is reviewable; "this seemed more correct" is not.
- **A change upstream does not fail anything here.** Nothing in this repository
  goes red when the specification moves. If you notice a drift, that is a real
  finding and worth an issue on its own.
