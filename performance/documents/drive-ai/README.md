# Drive AI extraction

Drive requires an exact source quote for every extracted fact or memory. Its shared model
gateway appended a blanket instruction not to quote source data. This check reproduces that
contradiction and validates an explicit source-quote opt-in before publishing it.

## Setup

2026-10-15, Linux, Node 24.19.0. The baseline is npm Drive **0.12.0**, Core **0.289.0**,
Base **0.33.0**. The local candidate is compiled Drive 0.12.0 plus the extraction caller change
and Core PR [#1317](https://github.com/WireCatLabs/cli-core/pull/1317), with Base **0.35.0**.
Its Core package metadata still says 0.292.0; it is **not the npm 0.292.0 artifact**. Candidate
results record compiled module hashes to distinguish it. No fixed npm release is claimed here.

[run.mjs](run.mjs) starts the actual compiled Drive executable in child processes. It seeds
synthetic documents through the public shared-store API, then uses ordinary CLI commands,
the real model gateway, an OpenAI-compatible loopback HTTP responder and the real SQLite store.
Only the in-flight source-change case calls the compiled public command entry point in the
parent, supplying a synthetic Google source to perform a real sync while the model response waits.

```sh
D=$(mktemp -d -p /var/tmp) && T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix "$D" --ignore-scripts --no-audit --no-fund @wirecat/drive-cli@0.12.0
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/drive-ai/run.mjs "$D/node_modules/@wirecat/drive-cli" --baseline
```

For a locally built candidate, substitute its package directory and `--candidate`. This mode
records hashes and labels the result as local, rather than npm. Temporary state remains for
inspection. Each run refuses separate physical Base instances in Drive and Core.

[guard.mjs](guard.mjs) permits child fetch requests only to the exact loopback origin and
chat-completion path; redirects, other HTTP requests, process launches and keyring access are
refused. Child environments contain only the runner's temporary paths and an allowlist of
process settings. The responder asserts that no Authorization header is present. No Google
account, owner database, real document or model credential is used.

## Results

Both the [baseline](results-baseline.json) and [candidate](results-candidate.json) passed
**59 CLI command checks**, with **12 loopback provider requests**, across seven behavior groups.
The baseline explicitly expects the contradictory quote policy; passing that baseline does not
mean its prompt is correct. The candidate requires the explicit evidence-quote policy and the
absence of the blanket prohibition.

| Behavior | Observed result |
| --- | --- |
| Preview | No writes; source hash, reference, provider and model retained |
| Select one document tab | Sibling tab content excluded from the outbound request |
| Explicit save and review | One scoped fact and one scoped memory saved as proposals with source evidence; explicit confirmation succeeds |
| Invalid or failed response | Invented quote, invalid kind, oversized batch, malformed JSON, truncated response, HTTP 429 and HTTP 500 all save nothing; provider error body is absent from output |
| Empty extraction | Successful no-op with no new proposals |
| Guards before network | Offline, read-only, policy denial, absent tab, disabled provider and dry run do not contact the responder |
| Source changes during extraction | Actual sync changes source hash; extraction refuses stale proposals with `document.changed`; the earlier confirmed memory becomes stale |

Separately, the Drive candidate's **195 unit tests passed**, with **90.28% line coverage**.
The shared Core baseline passed **4,567 tests**, with four existing skips and **95.11% line
coverage**, before the concurrent meeting API/Base 0.35 changes were rebased in. The rebased
Core candidate passed its **29 focused model tests** and typecheck on Base 0.35. These scopes
are separate; the full earlier Core run does not certify the later unrelated changes.

## Decision and limits

Expose `ModelRequest.allowSourceQuotes: true` in Core and opt in only from Drive's evidence
extraction caller. Leave ordinary requests' existing no-copy instruction intact. Source data
remains in a separate message that instructs the model to treat it as untrusted content.

The deterministic responder establishes transport, policy selection, validation, persistence
and source-change handling. It does not establish real model extraction quality, resistance
to prompt injection or compliance with instructions. No live AI-provider call or Google write
was made. Publishing and validating a fresh installed npm artifact remain separate follow-up
steps; candidate results must not be presented as released-package evidence.
