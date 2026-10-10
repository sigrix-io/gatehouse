# Changelog

Format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
follows [VERSIONING.md](VERSIONING.md), which is worth reading before pinning.

## [Unreleased]

### Added

- Host blocks, in a fifth script, `host_blocks.js`: `AppCard`, `AppList`,
  `RunHistory` and `UsageSummary`, for a page that shows several apps at once.
  They are drawn from documents a host builds from its own data (an app
  summary, a run row and a usage summary, each at `"v": 1`) rather than from a
  runner, so drawing a page of apps wakes none of them. They fetch nothing,
  draw every string as text, call every cost an estimate, and refuse a
  document in a version they do not read, whole and saying why.
  `Gatehouse.hostData` carries the readers they use. The README's *Host
  blocks* has the shapes; the stylesheet styles them as `gh-*` classes, themed
  through the same tokens as the run page.
- Status inks, `--run-ok-text`, `--run-warn-text` and `--run-danger-text`,
  reading a host's `--sx-*-text` tokens, for words; the fills stay for borders
  and bars.
- `CODE_OF_CONDUCT.md`, issue forms and a pull request template, the set the
  other open repositories carry. Blank issues are off: a report is a defect, a
  change, or a dependent saying so, which is the issue `VERSIONING.md` asks
  anyone building on 0.x to open. A security report goes to
  security@sigrix.io, and a question about the specification to
  `sigrix-io/postern`. Nothing in the package changes.

### Changed

- **Breaking: a `RunRenderer`'s ids are its own.** It wrote document-wide ids
  (`run-field-<key>`, `run-write-confirm`), so two renderers on one page bound
  each other's labels. It now writes them under a scope per renderer:
  `run-1-field-prompt` for the first a page makes, `run-2-field-prompt` for
  the second. **Migration:** find a field by its `name`, which is its input's
  key, inside the renderer's container (`[name="prompt"]`), not by id.
- `--run-ok` is the ok fill, `var(--sx-ok, #1F9D55)`, as `--run-warn` and
  `--run-danger` are fills. It was an ink until now; the satisfied
  credential's tick, its one reader, paints in `--run-ok-text` and looks as it
  did.
- The README opens with badges for the npm release, CI and the licence, and
  *Use it* starts with `npm install @sigrix-io/gatehouse` rather than
  mentioning the package in passing. A new *Where it fits* section names the
  projects a page meets: Postern, a runner to point it at, the conformance
  checker and Bailey. The README is the npm page too, so the next release
  carries it there. Nothing in the package changes.
- Dependabot opens one pull request per ecosystem, npm and GitHub Actions,
  instead of one per dependency. The branch ruleset only merges a pull request
  that is up to date with `main`, so each separate update merged put every
  other one behind. Nothing in the package changes.

### Fixed

- A missing credential's "not set" was painted in `--run-danger`, a host's
  `--sx-danger` fill, which reads 4.38:1 on `--sx-surface-2`. It takes
  `--run-danger-text` now, and a test holds every rule that colours words off
  the three fills.
- A credential's `signup_url` became a link whatever its scheme, so a
  `javascript:` address in a runner's `describe` was a link a click would run
  wherever a page's own policy did not stop it. Only an absolute `http` or
  `https` address is linked now; the credential is listed either way.

## [0.1.1] — 2026-09-29

### Changed

- Every GitHub Action the workflows run is pinned to a commit, with its release
  named beside it, and a test fails if one stops being. The release refuses to
  run in a fork and is never cancelled mid-publish. Nothing in the package
  changes.

### Fixed

Two rules 0.1.0 left to the host page's own stylesheet, so it looked right
inside the host it came from and wrong on a page that links `gatehouse.css`
alone.

- Fields stay inside their card. Everything within `.run-shell` is now sized
  `border-box`; a browser draws `input` and `textarea` `content-box`, so the
  text box and the text inputs spilled 24px past the card while the select
  beside them fitted.
- The link beside a missing credential takes the colour of the words around
  it, underlined, instead of the browser's link blue, which read 1.9:1 on the
  dark surface.

## [0.1.0] — 2026-09-29

First release. The code is not new: it is the run renderer of the Sigrix
platform, where it draws the buyer's run page, the seller's preview and the
admin preview, extracted as a package once a second application needed it.

### Added

- `postern_client.js`: the four verbs over `fetch`, SSE framing read from the
  response body, `PosternRefusal` and `PosternUnreachable`.
- `run_view_model.js`: `describe` and `status` to what to draw, with no DOM and
  no network, so every protocol rule can be exercised without a page.
- `refusal_copy.js`: a next move for each error code, and the status-class arm
  for a code it has never seen.
- `run_renderer.js`: the DOM, run, stop and retry, the timeline, the result, the
  seller's composition (`ui.json`), the input choice (`options.choice`) and the
  hosted mode (`options.hosted`).
- `gatehouse.css`: the stylesheet those classes expect, themable through
  `--sx-*` custom properties.

### Changed

- The global is `window.Gatehouse`. `window.SigrixRun`, the name inside its
  first host, remains as a deprecated alias for the same object and is removed
  at 1.0.
