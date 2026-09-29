# Changelog

Format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project
follows [VERSIONING.md](VERSIONING.md), which is worth reading before pinning.

## [Unreleased]

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
