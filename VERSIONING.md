# Versioning and compatibility

Gatehouse follows [Semantic Versioning](https://semver.org/), with the pre-1.0
carve-out below.

## Before 1.0

**Nothing is stable. Any `0.x` release may break any other `0.x` release.**

Stated plainly because the alternative — implying stability we cannot yet
promise — is how a package acquires dependents it then has to betray.

Concretely, before 1.0:

- The global's members may be renamed, resignatured, or removed.
- CSS class names may change. They are part of the interface, not an
  implementation detail, because a host links the stylesheet and may extend it.
- The rendered DOM structure may change. A host asserting on it is depending on
  something this package does not yet promise.
- Every breaking change is listed in [CHANGELOG.md](CHANGELOG.md) with a
  migration note.

**Pin the minor**: `"@sigrix-io/gatehouse": "~0.1.0"`.

If you are building on `0.x`, please [open an issue](../../issues) saying so.

## `window.SigrixRun`

A deprecated alias for `window.Gatehouse`, pointing at the same object. It is
the name this package was born under inside one host, kept so that host needed
no change across the extraction.

**It is removed at 1.0**, and that is the one breaking change already decided.
A global is the one part of a browser package a consumer cannot alias for
itself, so it is announced here rather than discovered.

## What is public

- The `window.Gatehouse` global and its members.
- The class names in `gatehouse.css`.
- The constructor signatures of `PosternClient` and `RunRenderer`, and the
  shape of `RunRenderer`'s options — including `options.composition`.
- The host blocks' constructors (`AppCard`, `AppList`, `RunHistory`,
  `UsageSummary`), their options, and the three documents they read, at
  `"v": 1`. Renaming or removing a member, or changing what one means, is a
  new `v`, which a release reads before any host sends it; a new member is
  not, because the blocks ignore what they do not read.

Anything reached only by reading the source is not, and that includes the ids
a `RunRenderer` writes: find a field by its `name` inside the container.

## Several renderers on one page

Since 0.2 a `RunRenderer` scopes its ids to itself, so a page may hold as many
as it likes. A host that looked a field up by `run-field-<key>` finds it by
`name` instead; the change is in `CHANGELOG.md` with that migration.

## What tracks Postern rather than us

This package implements a specification it does not own. A **Postern** version
bump is not a Gatehouse major on its own: what matters is whether a client
written against the old rules still behaves correctly.

Where a normative change upstream means this package must now do something
different, that is a breaking change here and the changelog says which section
moved. Where it only widens what a runner may send — a new event name, a new
input type, a new `validation` member — it is not, because the rules requiring
clients to ignore what they do not recognise are what make it not one.

## Releasing

A release is a tag. `release.yml` publishes to npm on any `v*` tag pushed to
this repository, through npm's trusted publishing: npm trusts this repository's
workflow rather than a token, so no token is stored anywhere, and a version it
publishes from a public repository carries a provenance statement saying which
commit built it.

Three things must be in place, and whichever is missing, the publish fails with
an error that does not say which:

1. **The package exists on npm.** A trusted publisher is added in a package's
   own settings, so the first version is published by a person (below).
2. **A trusted publisher** on npmjs.com, under the package's settings: GitHub
   Actions, `sigrix-io/gatehouse`, workflow `release.yml`, environment `npm`,
   allowed to run `npm publish`.
3. **An environment named `npm`** in this repository's settings. The
   publisher names it, so a workflow running outside it is refused.

Then every release is:

```sh
git tag v0.1.1 && git push origin v0.1.1
```

### The first release

0.1.0 is published by hand, from a clean checkout, before its tag is pushed:

```sh
git tag v0.1.0
npm publish    # publishConfig makes the scoped package public; npm asks for 2FA
```

CI has already run the suite on that commit, and `npm ci && npm test` repeats it
on Node 22 or newer. Then the trusted publisher and the environment, and only
then `git push origin v0.1.0`: the run it starts finds 0.1.0 on npm and
publishes nothing, so the tag is a record rather than a failed release. The
first version the workflow publishes is the one after.

A version published by hand carries no provenance statement, so 0.1.0 has none;
npm writes one only for a version a public repository's workflow published.
