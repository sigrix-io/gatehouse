# Changelog

Format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
follows [VERSIONING.md](VERSIONING.md), which is worth reading before pinning.

## [Unreleased]

### Added

- `CODE_OF_CONDUCT.md`, issue forms and a pull request template, the set the
  other open repositories carry. Blank issues are off: a report is a defect, a
  change, or a dependent saying so, which is the issue `VERSIONING.md` asks
  anyone building on 0.x to open. A security report goes to
  security@sigrix.io, and a question about the specification to
  `sigrix-io/postern`. Nothing in the package changes.

### Changed

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
