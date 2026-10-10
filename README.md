# Gatehouse

[![npm](https://img.shields.io/npm/v/@sigrix-io/gatehouse)](https://www.npmjs.com/package/@sigrix-io/gatehouse)
[![CI](https://github.com/sigrix-io/gatehouse/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/sigrix-io/gatehouse/actions/workflows/ci.yml)
[![Licence](https://img.shields.io/github/license/sigrix-io/gatehouse)](https://github.com/sigrix-io/gatehouse/blob/main/LICENSE)

A browser client for [Postern](https://github.com/sigrix-io/postern). Given a runner's `describe` and `status` documents, Gatehouse draws a run page (a form, a run button, the steps as they happen, the result and its usage) and connects it to Postern's four verbs over `fetch`. It holds nothing else.

Beside the run page, four blocks a host draws from its own data, for a page that shows several apps at once: a card per app, a list of them, a run history and a usage summary. They are handed documents rather than clients, so drawing a page of apps wakes none of their runners.

Five scripts and a stylesheet. No build step, no runtime dependency, no second origin.

> **0.x.** Nothing is stable before 1.0; pin the minor. See `VERSIONING.md`.

## Use it

```sh
npm install @sigrix-io/gatehouse
```

Serve the six files it installs in `node_modules/@sigrix-io/gatehouse/src/` (or copy them from this repository's `src/`; there is nothing to build). A run page loads four of the scripts, in this order:

```html
<link rel="stylesheet" href="gatehouse.css">
<div id="run"></div>

<script src="postern_client.js"></script>
<script src="run_view_model.js"></script>
<script src="refusal_copy.js"></script>
<script src="run_renderer.js"></script>
<script>
  const client = new Gatehouse.PosternClient('http://127.0.0.1:8765');
  const renderer = new Gatehouse.RunRenderer(document.getElementById('run'), client, {
    composition: uiJson, // optional: the seller's ui.json, read from the bundle by the host
  });
  renderer.load();
</script>
```

Each script is an IIFE that adds to one global, `window.Gatehouse`. `window.SigrixRun` names the same object and goes at 1.0.

**Where the page is served from matters.** A Postern runner answers a browser only from the origins its operator configured, and never allows every origin by default (SPEC §2.3), because any web page can reach a loopback port. Either start the runner with the page's origin allowed, or put a proxy on the page's own origin in front of it; `PosternClient`'s `headers` option carries what that proxy needs, a CSRF token say.

| Constructor | Arguments |
| --- | --- |
| `PosternClient(baseUrl, options)` | `baseUrl`: where the runner (or the proxy) answers; every request goes to it under `/postern/v0`. `options.headers`: extra headers for every request. `options.fetchImpl`: a `fetch` to use instead of the page's. |
| `RunRenderer(container, client, options)` | `container`: the element to draw into. `client`: anything with the four verbs. `options.composition`, `options.choice`, `options.hosted`: below. |

`renderer.load()` reads `describe` and `status` and draws the page. Running, stopping and retrying are the page's own buttons.

A page of apps loads `host_blocks.js`, alone or after the four; see [Host blocks](#host-blocks).

## The rules that are easy to erode

Each is held by a test rather than by memory (`tests/contract.test.js` and the suites beside it).

- **The base URL is a constructor argument.** Every request goes to it and to the protocol's own path prefix. A font, an icon CDN or a "check for updates" call would each be a second origin, so a test intercepts `fetch` and asserts the origin of everything.
- **No markup from the agent.** `innerHTML` appears nowhere. Agent output and every streamed `delta.text` reach the page through `textContent`.
- **No `EventSource`, and no retry loop around the stream.** It cannot POST and it reconnects on its own, and a reopened stream is a new run: the way a client spends someone's money twice. A disconnect is a cancel, so Stop is an `AbortController`.
- **Zero imports, and no distributor.** Nothing here names a marketplace or a listing.
- **Documents are handed in.** The composition and the choice arrive as data from whoever mounted the page, and so does everything the host blocks draw. Fetching them here would be reaching for a fifth verb, and Postern has four.
- **A link goes only to a web address.** An address a runner's author wrote becomes a link only when it is an absolute `http` or `https` one, so a `javascript:` address in `describe` is never something a click runs.

## The composition

`options.composition` is a seller's `ui.json`: how a runner's inputs and result are *presented*. A seller writes it, so the client re-checks everything in it rather than trusting the file it was handed.

| Member | Does | Refuses to |
| --- | --- | --- |
| `inputs[].widget`: `line`, `box`, `number`, `choice` | pick among the controls a field's declared type can wear | change what a field means; a hint outside its type's row is named on the page and not applied |
| `inputs[].help`, `inputs[].placeholder` | seller prose beside the control | be anything but text |
| `run_label` | name the action | |
| `output.mode`: `text`, `markdown`, `file` | choose how a text result is shown | touch `bytes` or an unrecognised type |
| `template`: `form-to-result` | | anything else; a template this client cannot draw falls back to the standard one, with a notice naming what was asked for |
| `version` | be carried as data a caller may show | be compared: a version family names a distributor, and gating on one would refuse another vendor's document |

Two properties are structural. **It cannot hide a field**: the form is walked from `describe.inputs`, and the composition is a lookup by key. **Markdown is block structure only**: headings, paragraphs, lists and fenced code, built with `createElement` and `textContent`. Inline markers are left as the agent typed them, because inline markdown's useful half is the link, and an anchor whose `href` comes from agent output is exactly the escape hatch `innerHTML` is banned to prevent.

## The choice

`options.choice` says that one `select` input chooses which of the others apply, as an MCP server's `tool` does when each tool takes arguments of its own. `describe` has no member that says so, so the host hands the fact in as data:

```json
{"key": "tool", "groups": {"watch_models": {"inputs": ["watch_models.provider"],
  "required": ["watch_models.provider"], "about": "Lists the models a provider released."}}}
```

The form shows only the chosen option's inputs; a chosen option's `required` adds to `describe`'s own and never removes one, and its `about` goes under the picker. A run sends every input no option governs, plus the chosen option's. A group that is not one of the select's options is ignored, so no choice can put an input out of reach.

## Hosted runs

`options.hosted: true` says the page's operator runs the runner, not the person reading it. It changes only what a failure may quote back: an `agent_error` is the one refusal whose message carries what a model provider said about the *operator's* credentials, so on a hosted page it is withheld and the reader sees the next move alone.

## Several apps on one page

A `RunRenderer` writes its ids under a scope of its own (`run-1-field-prompt` for the first renderer a page makes, `run-2-field-prompt` for the second), so two on one page never share one and each `<label>` stays bound to its own field. To find a field, look for its `name`, which is its input's key, inside the container you handed in: `container.querySelector('[name="prompt"]')`. The id is the renderer's own business.

## Host blocks

A page listing several apps should not ask each runner how it is: a runner that is asleep would be woken to draw one card. These blocks are drawn from documents the host builds from what it already holds, and they fetch nothing.

```html
<link rel="stylesheet" href="gatehouse.css">
<div id="apps"></div>
<div id="usage"></div>
<div id="runs"></div>

<script src="host_blocks.js"></script>
<script>
  new Gatehouse.AppList(document.getElementById('apps'), data.apps).render();
  new Gatehouse.UsageSummary(document.getElementById('usage'), data.usage).render();
  new Gatehouse.RunHistory(document.getElementById('runs'), data.runs).render();
</script>
```

| Constructor | Draws | Options |
| --- | --- | --- |
| `AppCard(container, summary, options)` | one app summary | `headingLevel` (2 to 6, default 3), `openLabel` (default `Open`), `locale`, `timeZone` |
| `AppList(container, summaries, options)` | a card per summary, in the order given | `emptyText`, and `AppCard`'s |
| `RunHistory(container, rows, options)` | a table of run rows, in the order given | `showApp` (default `true`), `emptyText`, `locale`, `timeZone` |
| `UsageSummary(container, usage, options)` | a period's figures, its caps, its runs per day and a table by app | `headingLevel`, `locale`, `timeZone` |

Each has `render()`, and `update(data)`, which replaces its document and draws again. `locale` and `timeZone` default to the reader's own. `Gatehouse.hostData` carries the readers the blocks use (`readAppSummary`, `readRunRow`, `readUsageSummary`, each answering `{ value }` or `{ refusal }`), so a host can test what it builds against them.

### The documents

Each carries `"v": 1`. A block refuses a document in a version it does not read, or one missing what its shape requires, whole, in a sentence saying why; a list draws the rest and says how many it left out. A member a shape does not name is ignored.

**App summary.** `app_id`, `name` and `state` are required. `state` is `ready`, `needs_key`, `starting`, `unavailable` or `ended`; one this client does not know is shown as spelled, in no tone. `access_ends_at` and `last_run_at` may be null, and `run_url` may be a path on the host's own page.

```json
{
  "v": 1,
  "app_id": "the host's id, opaque here",
  "name": "Property copy",
  "summary": "Writes a property's description from the agent's notes.",
  "by": "fernhill",
  "state": "needs_key",
  "missing_keys": [{"env": "CRM_API_KEY", "purpose": "Reads your contacts", "signup_url": "https://crm.example.com/keys"}],
  "access_ends_at": "2027-10-01T00:00:00Z",
  "last_run_at": "2026-09-30T15:47:12Z",
  "run_url": "/apps/a-property-copy/run"
}
```

**Run row.** `app_id`, `app_name`, `started_at`, `input_tokens`, `output_tokens` and `outcome` are required. `outcome` is `done`, `timed_out`, `failed` or `cancelled`; `duration_seconds`, `model`, `cost_estimate` and `detail` may be null; `currency`, an ISO 4217 code, goes beside a cost. `detail` is the host's own sentence about how the run ended, drawn as given, so it is written for the person reading. A runner's error message is not one: on a hosted run it can carry what a provider said about the operator's key (see [Hosted runs](#hosted-runs)).

```json
{
  "v": 1,
  "run_id": "r-77ae",
  "app_id": "a-lead-digest",
  "app_name": "Lead digest",
  "started_at": "2026-09-30T11:02:40Z",
  "duration_seconds": 240,
  "model": "claude-sonnet-4-6",
  "input_tokens": 52210,
  "output_tokens": 0,
  "cost_estimate": 0.15663,
  "currency": "USD",
  "outcome": "timed_out",
  "detail": "Stopped at the 240-second limit."
}
```

**Usage summary.** A `caps` member that is null or absent draws no meter. `runs_used` is what the host's own limit counts, over the last 24 hours, and the sentence above its meter says so. A bare date (`period.start`, `by_day[].date`) names a day and is written as that day in any time zone.

```json
{
  "v": 1,
  "period": {"label": "September 2026", "start": "2026-09-01", "end": "2026-09-30"},
  "runs": 128,
  "runs_done": 124,
  "input_tokens": 1391600,
  "output_tokens": 396700,
  "cost_estimate": 8.46,
  "currency": "USD",
  "caps": {"runs_per_day": 10, "runs_used": 3, "spend_per_period": 25.0},
  "by_app": [{"app_id": "a-property-copy", "app_name": "Property copy", "runs": 71, "input_tokens": 852000, "output_tokens": 248500, "cost_estimate": 4.62}],
  "by_day": [{"date": "2026-09-01", "runs": 5}]
}
```

### What every block keeps

- **Text only.** Every string reaches the page through `textContent`: an app's name and summary are its author's prose, and a model's name is whatever a runner reported.
- **A cost is an estimate, and says so.** It is the host's sum from token counts and a price list, not a bill, and the specification calls a runner's own `cost_usd` advisory too.
- **A link is a web address.** `signup_url` must be an absolute `http` or `https` address, and `run_url` may also be a path on the host's page; anything else draws no link.
- **Nothing is fetched.** A test spies on `fetch` while every block draws.

## Styling

`gatehouse.css` styles every class the scripts draw, the run page's `run-*` and the host blocks' `gh-*`, and `tests/stylesheet.test.js` fails when one has no rule. Colours are custom properties on `.run-shell` and on `.gh-block`, the root of every host block: each `--run-*` reads a host's `--sx-*` token when the page defines one and falls back to its own value, so the file works alone and a host can theme it. A status colour comes as a fill (`--run-ok`, `--run-warn`, `--run-danger`) for borders and bars, and as an ink (`--run-ok-text` and the rest, from a host's `--sx-*-text`) for words. Dark values apply under `[data-theme="dark"]` on any ancestor.

## Where it fits

Gatehouse is one of the open-source projects [Sigrix](https://sigrix.io) publishes, and the page between a person and a runner. On Sigrix it draws the buyer's run page and the seller's preview; elsewhere it meets:

- **[Postern](https://github.com/sigrix-io/postern)**, the protocol whose four verbs it calls. Its [§2.3](https://github.com/sigrix-io/postern/blob/main/SPEC.md#23-browser-clients) says what a runner owes a browser client, and why the default is to refuse.
- **[sigrix-runtime](https://github.com/sigrix-io/sigrix-runtime)** (`pip install sigrix-runtime`), a runner to point it at: the one inside every bundle Sigrix delivers, which can also serve an MCP server's tools as one agent. Start it with `--allow-origin` set to the page's origin.
- **[postern-conformance](https://pypi.org/project/postern-conformance/)** (`pip install postern-conformance`), which reports the level a runner really meets before you draw a page for it.
- **[Bailey](https://github.com/sigrix-io/bailey)**, the open-source assistant: the app planned for its 0.1 draws a solution's apps with Gatehouse.

Every project Sigrix publishes, and a map of how they connect: [sigrix.io/open-source](https://sigrix.io/open-source).

## Tests

```sh
npm ci
npm test
```

The scripts are loaded the way a browser loads them, read and evaluated in order, rather than imported. The fixtures in `tests/fixtures/postern_describe/` are real documents: the Postern conformance fake's, a pipeline crew's, and an MCP server's as a runner builds it from a real `tools/list` answer. Those in `tests/fixtures/host_blocks/` are the three documents a host hands the blocks, one of each state and outcome among them.

## Licence

Apache-2.0. The Sigrix name and logo are not covered by the licence; see `NOTICE`.
