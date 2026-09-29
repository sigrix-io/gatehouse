# Security Policy

Gatehouse renders output produced by an AI agent, in a browser, on a page that
belongs to somebody else. That is the whole of its attack surface and it is
worth naming plainly: **every string this package puts on a page came from
somewhere the host does not control.**

## Reporting a vulnerability

**Do not open a public issue.**

Email **security@sigrix.io** with enough detail to reproduce — ideally the
`describe`, `status` or stream bytes that trigger it. You will get an
acknowledgement within three working days. [CONTRIBUTING.md](CONTRIBUTING.md) publishes
the queues everything else waits in; security reports jump all of them.

## What is in scope

- **Anything that gets agent output executed or interpreted as markup.**
  `innerHTML` appears nowhere in this package and every agent string reaches the
  page through `textContent`; a path that escapes that is the most valuable
  report we can receive. Markdown rendering is block structure only, and inline
  markers are left as typed *because* an anchor whose `href` comes from agent
  output is exactly the hole the ban exists to close.
- **A second origin.** Every request is supposed to go to the base URL the
  caller passed and to the protocol's path prefix. Anything reaching another
  origin — a font, an icon, a telemetry call — is a finding even if it looks
  harmless, because a page embedding this client did not agree to it.
- **A run started that the user did not ask for**, or started twice. A reopened
  stream is a new run and spends real money (SPEC §4.5).
- **Anything a hostile `describe` or composition document can do.** Both are
  authored by a seller and can come from any distributor; this package re-checks
  what it is handed rather than trusting it. A document that gets past that is
  in scope.
- **Leaking a credential into the page or a request.** Postern carries none by
  design (§4.1.3); a path here that carries one anyway is a finding.

## What is not in scope

- **A runner that is wrong.** Postern places obligations on runners, and one
  breaking them is that runner's defect. If a runner's breach makes *this*
  package do something unsafe, that is in scope here — say so.
- **CORS and Private Network Access.** Whether a page may reach a runner at all
  is the browser's decision and the runner's configuration (§2.3, §7). This
  package cannot widen it and must not try.
- **Weaknesses in the Postern specification itself.** Report those to
  [sigrix-io/postern](https://github.com/sigrix-io/postern/security/policy) — but
  if the specification is what led us here, say so and we will treat it as one.
- **A host that styles or embeds this badly.** Rendering it inside a page that
  already has an XSS is not a finding against this package.

## Supported versions

| Version | Status |
|---|---|
| 0.1.x | Pre-release — supported |

Pre-1.0, and [VERSIONING.md](VERSIONING.md) is blunt about what that means.
There is no back-porting because there is nothing to back-port to.

## What happens next

We will agree a disclosure timeline with you rather than impose one, and the
changelog entry will credit you unless you would rather it did not.
