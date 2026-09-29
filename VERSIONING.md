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

Anything reached only by reading the source is not.

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
workflow rather than a token, so no token is stored anywhere and the package
carries a provenance statement saying which commit built it.

Three things must be in place, and none of them fails loudly while missing:

1. **The package exists on npm.** A trusted publisher is added in a package's
   own settings, so the first version, 0.1.0, is published by a person from a
   clean checkout of its tag: `npm ci && npm test && npm publish` (the scope's
   `publishConfig` makes it public).
2. **A trusted publisher** on npmjs.com, under the package's settings: GitHub
   Actions, `sigrix-io/gatehouse`, workflow `release.yml`, environment `npm`,
   allowed to run `npm publish`.
3. **An environment named `npm`** in this repository's settings. The
   publisher names it, so a workflow running outside it is refused.

Then every later release is:

```sh
git tag v0.1.1 && git push origin v0.1.1
```

npm writes provenance only for a public repository, which is one reason the
first release waits until this one is public.
