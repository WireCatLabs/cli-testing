# Drive AI extraction

Drive requires an exact source quote for every extracted fact or memory. Its shared model
gateway appended a blanket instruction not to quote source data. This check reproduces that
contradiction, verifies the explicit source-quote permission, and confirms the fix through a
fresh npm installation of Drive **0.12.2**.

## Setup and reproduction

Runs began on 2026-10-15; released-package verification completed on 2026-10-16, Europe/Madrid.
Linux, Node 24.19.0. The reviewed release pins Core **0.294.0** and Base **0.35.0** exactly.
The runner checks the declared and runtime versions, requires one physical Base instance,
and verifies the gateway actually permits evidence quotes alongside structured output.

```sh
D=$(mktemp -d -p /var/tmp) && T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix "$D" --ignore-scripts --no-audit --no-fund @wirecat/drive-cli@0.12.2
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/drive-ai/run.mjs "$D/node_modules/@wirecat/drive-cli" --released
```

To reproduce the known-conflict baseline, install **0.12.0** in a separate fresh directory and
use `--baseline`. Its runtime pins must be Core **0.289.0** and Base **0.33.0**. Both modes
refuse unreviewed versions. `--candidate` accepts a local build, records compiled module hashes
and explicitly labels its result as local; it is not npm release evidence.

[run.mjs](run.mjs) starts the actual compiled Drive executable in child processes. It seeds
synthetic documents through the public shared-store API, then uses ordinary CLI commands,
the real model gateway, an OpenAI-compatible loopback HTTP responder and the real SQLite store.
Only the in-flight source-change case calls the compiled public command entry point in the
parent, supplying a synthetic Google source to perform a real sync while the model response waits.
No injected Complete function replaces the executable's gateway or transport.

[guard.mjs](guard.mjs) permits child fetch requests only to the exact loopback origin and
chat-completion path; redirects, other HTTP requests, process launches and keyring access are
refused. Child environments contain only temporary paths and an allowlist of process settings.
The responder asserts that no Authorization header is present. No Google account, owner database,
real document or model credential is used. Temporary synthetic state remains for inspection.

## Executable results

Each recorded run passed **59 CLI command checks**, with **12 loopback provider requests**,
across seven behavior groups. Passing the baseline means reproducing its contradictory quote
policy; it does not mean that prompt is correct.

| Run | Drive / Core / Base | Quote policy |
| --- | --- | --- |
| [Reviewed npm baseline](results-baseline-reviewed-pins.json) | 0.12.0 / 0.289.0 / 0.33.0 | Known blanket no-copy conflict |
| [Initial local candidate](results-candidate.json) | 0.12.0 / 0.292.0 metadata / 0.35.0 | Explicit evidence quotes |
| [Packed local candidate](results-packed-candidate.json) | 0.12.2 / 0.293.0 metadata / 0.35.0 | Explicit evidence quotes with normal dependency resolution |
| [Fresh npm release](results-released.json) | 0.12.2 / 0.294.0 / 0.35.0 | Final permission wording verified |

The two candidate Core version numbers describe local package metadata, not the same-number npm
artifacts: those candidates contain the unpublished quote opt-in. Their code hashes distinguish
them. The [earliest baseline record](results-baseline.json) is retained separately; the reviewed
baseline rerun adds runtime Base verification. [npm-integrities.json](npm-integrities.json) records
SHA-512 integrity values from the fresh installation's lockfile and verifies exactly one copy of
each reviewed WireCat package.

| Behavior | Observed result |
| --- | --- |
| Preview | No facts or memories saved; source hash, reference, provider and model retained |
| Select one document tab | Sibling tab content excluded from the outbound request |
| Explicit save and review | One scoped fact and one scoped memory saved as proposals with source evidence; explicit confirmation succeeds |
| Invalid or failed response | Invented quote, invalid kind, oversized batch, malformed JSON, truncated response, HTTP 429 and HTTP 500 all save nothing; provider error body is absent from output |
| Empty extraction | Successful no-op with no new proposals |
| Guards before network | Offline, read-only, policy denial, absent tab, disabled provider and dry run do not contact the responder |
| Source changes during extraction | Actual sync changes source hash; extraction refuses stale proposals with document.changed; the earlier confirmed memory becomes stale |

## Other release checks

Drive passed **195 unit tests**, with **90.26% line coverage**, against the published Core/Base
pair. Types, lint, shared standards, generator freshness, eight CLI/MCP contracts, five
previous-store upgrade checks, leak checks, docs and installed Node/Bun package smoke all passed.
Command lint reported **zero new violations**; the existing lint and coverage baselines were
not weakened. These checks include the latest catalog tree fix merged before the release.

The initial cross-repository Core symlink setup made Biome crash and split Commander instances,
so a missing-option contract returned internal_error. A packed SDK with normal dependency
resolution resolved both failures. The final published dependency pair passed the same checks;
the failures were not accepted as a new baseline.

The earlier Core candidate passed 4,577 tests, four existing skips and 95.11% lines at
`2ae50456e501652107c2e413e7b6c98708e3be71`. Later shared changes are covered by the complete
[Core 0.294.0 release validation](https://github.com/WireCatLabs/cli-core/actions/runs/38815194042),
not by that earlier local run. The first release attempt passed 4,592 tests but stopped on duplicate
changelog headings; [the notes-only repair](https://github.com/WireCatLabs/cli-core/pull/1337)
preserved every release note and the corrected publishing run succeeded.

## Published change and limits

[Core #1330](https://github.com/WireCatLabs/cli-core/pull/1330) adds
`ModelRequest.allowSourceQuotes: true`; [#1333](https://github.com/WireCatLabs/cli-core/pull/1333)
clarifies that it permits quotes rather than requiring a quote-only answer. This is an SDK
request option, not a saved CLI setting. Ordinary requests retain their no-copy instruction.
Source data remains in a separate message that instructs the model to treat it as untrusted content.

[Drive #86](https://github.com/WireCatLabs/drive-cli/pull/86) opts in from the evidence extraction
caller and pins the published Core/Base pair. The [Drive 0.12.2 release](https://github.com/WireCatLabs/drive-cli/actions/runs/38817541530)
passed from `0e06e0a779cb332926d2409acfd93a6be2e89f45`; the fresh npm result above is separate
from the local candidates. The [historical caller patch](drive-caller.patch) remains available.

The deterministic responder establishes transport, policy selection, validation, proposal
persistence and source-change handling. It does not establish real model extraction quality,
resistance to prompt injection, factual entailment or compliance with instructions. Quotes support
owner review, not automatic factual approval. Source-change staleness is verified for memories;
this suite does not establish freshness or retraction behavior for accepted facts. No live
AI-provider call or Google write was made.

## Shared Core workflows

Drive's extraction and source lifecycle moved into Core's public document module in
[Core #1348](https://github.com/WireCatLabs/cli-core/pull/1348) and
[Drive #90](https://github.com/WireCatLabs/drive-cli/pull/90). The
[0.14.0 npm result](results-shared-core.json) repeats all 59 executable invocations and
12 loopback requests with Core 0.295.0 and Base 0.40.0. It checks one physical Base instance
and records compiled hashes for the six shared workflow modules. Earlier results are retained.

Repeat against a fresh npm installation using the same isolated-state setup above, with
`node performance/documents/drive-ai/run.mjs /absolute/path/to/installed/node_modules/@wirecat/drive-cli --shared-core`.
The mode enforces that exact released package tuple. [Registry integrity values](npm-integrities-shared-core.json)
identify all three packages. These checks exercise actual installed CLI behavior and a real temporary
store, with synthetic sources and the guarded loopback model; they do not test live Box/Microsoft
adapters or real model accuracy. Core separately tests non-Google source ports and provider-ID isolation.
