# Gatehouse

A browser client for [Postern](https://github.com/sigrix-io/postern). Given a runner's `describe` and `status` documents, Gatehouse draws a run page (a form, a run button, the steps as they happen, the result and its usage) and connects it to Postern's four verbs over `fetch`. It holds nothing else.

Four scripts and a stylesheet. No build step, no runtime dependency, no second origin.

> **0.x.** Nothing is stable before 1.0; pin the minor. See `VERSIONING.md`.

## Use it

Serve the five files from `src/` (or install `@sigrix-io/gatehouse` and serve them from `node_modules`), and load the scripts in this order:

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

## The rules that are easy to erode

Each is held by a test rather than by memory (`tests/contract.test.js` and the suites beside it).

- **The base URL is a constructor argument.** Every request goes to it and to the protocol's own path prefix. A font, an icon CDN or a "check for updates" call would each be a second origin, so a test intercepts `fetch` and asserts the origin of everything.
- **No markup from the agent.** `innerHTML` appears nowhere. Agent output and every streamed `delta.text` reach the page through `textContent`.
- **No `EventSource`, and no retry loop around the stream.** It cannot POST and it reconnects on its own, and a reopened stream is a new run: the way a client spends someone's money twice. A disconnect is a cancel, so Stop is an `AbortController`.
- **Zero imports, and no distributor.** Nothing here names a marketplace or a listing.
- **Documents are handed in.** The composition and the choice arrive as data from whoever mounted the page. Fetching them here would be reaching for a fifth verb, and Postern has four.

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

## Styling

`gatehouse.css` styles every class the renderer draws, and `tests/stylesheet.test.js` fails when one has no rule. Colours are custom properties on `.run-shell`: each `--run-*` reads a host's `--sx-*` token when the page defines one and falls back to its own value, so the file works alone and a host can theme it. Dark values apply under `[data-theme="dark"]` on any ancestor.

## Tests

```sh
npm ci
npm test
```

The scripts are loaded the way a browser loads them, read and evaluated in order, rather than imported. The fixtures in `tests/fixtures/postern_describe/` are real documents: the Postern conformance fake's, a pipeline crew's, and an MCP server's as a runner builds it from a real `tools/list` answer.

## Licence

Apache-2.0. The Sigrix name and logo are not covered by the licence; see `NOTICE`.
