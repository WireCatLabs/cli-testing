# Offline Drive catalog

Drive kept Google folder ancestry in sync checkpoints but could not browse or annotate that
hierarchy through the shared database. This check asks whether a catalog can reuse existing
indexed documents, remain account-scoped and support folder context without contacting Google.
It supports adopting the shared `store.catalog` API rather than another Drive-specific store.
The release check also asks whether the new JSON envelope and config migration preserve those
workflows for installed-package consumers.

The [controlled Google checklist](live-checklist.md#use-the-prepared-checker) now includes a
reusable isolated acceptance runner. Google checks remain unrun until the owner connects a
dedicated test account; its synthetic and installed-package validation is recorded below.

## Live-checker preparation

The live checklist was manual and could not repeatedly check source identity and local context
after Google UI edits. `live.mjs` now verifies a private expected fixture through the compiled
CLI. It refuses unrelated selected roots and preserves prior reports. `--refresh` is the only
path to Google, and invokes sync only; fixtures are changed manually in Google's UI. Model/AI
requests and remote writes are outside the runner.

Reproduce its guard tests with no credentials or package installation:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node --test performance/documents/offline-catalog/live.test.mjs
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/offline-catalog/live.mjs plan
```

For compiled-package output compatibility, use an already installed exact npm package:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/offline-catalog/live-installed.mjs /path/to/node_modules/@wirecat/drive-cli
```

This seeds synthetic data through cli-core's public store API, wraps the actual published binary
with HTTP/browser/keyring denial, imports its catalog and checks local annotations plus a repeat
baseline. It does not import Drive source or pretend to test a real Google export. Fixture
directories remain available; cleanup is a separate owner action.

On 2026-10-14 (Linux, Node 24.19.0), all nine guard tests passed. The installed Drive 0.7.0
package on Core 0.278.0/framework 0.28.2 passed eight checks on the annotated synthetic fixture
and eight on a repeat using its baseline. The compiled-package run caught the real nested
notes list and structured tag records, preventing mocks from certifying a wrong consumer shape.
Negative cases cover wrong scope, wrong-source search hits, pending sync, changed references,
lost notes, unknown input, existing output and error-output canary exclusion. No Google login,
conversion fidelity, remote mutations, real embeddings or OAuth verification were measured.

### Installed knowledge lifecycle

On 2026-10-15, the same exact npm package and synthetic fixture passed seven further behavior
groups. The question was whether the document knowledge features work together through the
released CLI, including source retirement, rather than only through individual service tests.
Reproduce with the `live-installed.mjs` command above; it now also runs
[`knowledge-installed.mjs`](knowledge-installed.mjs).

| Behavior | Result |
| --- | --- |
| Explicitly link an imported document to a seeded person and filter by that person | Passed |
| Edit a local note, then try its old revision | Stale edit refused; updated text preserved |
| Create and confirm a memory | Proposed first; source subject/evidence and explicit work scope retained |
| List/search that memory within its scope and source | Work result found; personal scope empty |
| Remove the selected root and reconcile | Catalog, imported list, keyword search and source snapshot emptied |
| Inspect persisted knowledge after source retirement | Confirmed memory stale; owner-written note preserved |
| Reconcile again | No further removals |

The existing eight initial and eight baseline checks still passed before the lifecycle cases.
Setup: Linux, Node 24.19.0, Drive 0.7.0, Core 0.278.0 and framework 0.28.2. The person is seeded
through the shared store's public API; links, notes, memories and reconciliation use the actual
compiled Drive CLI. Persisted memory/note outcomes are inspected through the public store API.
No SQL or Drive source imports are used.

All processes use isolated state and the HTTP/browser/keyring denial wrapper. Reconciliation
calls `sync` without `--offline` only after `folders remove` leaves no selected roots: there is
no Google source to read, and the denial wrapper would fail an unexpected request. This is a
local source-retirement test, not a live Google move, trash or permission-change test. Automatic
editor identity association, project links, AI extraction and provider conversion fidelity remain
outside these results. Source removal intentionally exercises snapshot deletion; all other test
artifacts and reports remain available for inspection.

## Setup and reproduction

Synthetic data only: one root, one nested folder, one indexed PDF fixture and a second explicit
profile. Node 24.19.0 on Linux. Candidate results and exact npm releases are distinguished below.
The runner imports the core package's public store export to seed an isolated database, then
invokes the compiled Drive executable. HTTP/fetch, child process/browser calls and the keyring
entry constructor are blocked inside each CLI process. Config, database and cache paths all
point to a new temporary directory.

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/offline-catalog/run.mjs /path/to/built-drive /path/to/built-core
```

Run from a cli-testing checkout with its locked dependencies installed; the MCP client is pinned
by that lockfile. Both paths must contain built package artifacts and installed dependencies. The runner never
imports TypeScript source, opens a real profile, downloads a model or contacts Google. It leaves
its temporary fixture available for inspection. No publisher or Google credentials are needed.

## Result

The candidate completed 19 CLI invocations with all assertions passing:

| Behavior | Result |
| --- | --- |
| Import existing checkpoint metadata without downloads | ✅ Three catalog entries |
| Keep the indexed document reference, text and hash | ✅ Preserved |
| Navigate root → folder → file | ✅ Cached hierarchy |
| Filter by parent, observed person, kind and metadata words | ✅ Shared query syntax |
| Tag a folder and find it by tag | ✅ Shared owner tags |
| Save and read a folder memo/context | ✅ Shared notes |
| Keep another profile's catalog isolated | ✅ Empty/not-found response |
| Preview local writes; refuse read-only writes and missing profile | ✅ Guards applied |
| Retire metadata when selected roots are removed | ✅ Active catalog and ordinary search emptied; indexed text retained |

The producer's store tests separately cover metadata/content updates, renames/reparenting,
re-entry, unreadable entries, batch validation, SQL query logic and reader metadata coexistence.
Drive's synthetic tests cover partial content batches, failed catalog persistence, retries and
ordinary sync removal. Test totals and coverage belong to those exact builds, not this runner.

## Framework compatibility

The first Core release attempt still required framework 0.26, so it could not serve a Drive
consumer using framework 0.27. The compatibility check used published
`@wirecat/cli-base` 0.27.1, Drive candidate `7f250e9` and Core candidate `b08a6e49`
([integration PR](https://github.com/WireCatLabs/cli-core/pull/1102)). The same runner passed
all 19 operations against their compiled artifacts. These are local candidates, not registry
installation results.

Core's isolated suite at `b08a6e49` passed 3,896 tests with four existing skips and 94.84%
line coverage. Its image CLI and embedding runtime had previously failed the release's
per-file coverage gate; five new tests brought each file to 100% line coverage. They check
write guards, lazy sessions, tensors and attention masks, normalization and resource release
with synthetic runtime inputs. They do not validate real CLIP inference or model quality.

Reproduce the producer checks in a clean checkout of that commit:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null pnpm install --frozen-lockfile
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null pnpm test:coverage
```

The producer's tests run from its own package test script; the compiled-consumer check runs
through [run.mjs](run.mjs). Later merges and release artifacts need their own validation.

## Released-package acceptance

Drive 0.4.0 is published on npm with exact dependencies `@wirecat/cli-core` 0.265.0 and
`@wirecat/cli-base` 0.27.1. A fresh isolated npm installation completed all 19 operations
with the same network/browser/keyring guards. This establishes package installation and
offline catalog behavior, separately from the earlier compiled-candidate checks.

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix /var/tmp/drive-check --ignore-scripts --no-audit --no-fund @wirecat/drive-cli@0.4.0
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/offline-catalog/run.mjs /var/tmp/drive-check/node_modules/@wirecat/drive-cli /var/tmp/drive-check/node_modules/@wirecat/cli-core
```

The combined release candidate passed 158 unit tests (89.76% line coverage), eight CLI/MCP
contracts, five prior-store upgrades, leak checks and Node/Bun installed-tarball smoke.
[Release validation](https://github.com/WireCatLabs/drive-cli/actions/runs/38498940380) passed
before publication. Optional image search is included in that release, but this catalog runner
does not measure real image inference or Google conversion fidelity.

## Output migration acceptance

On 2026-10-14, fresh npm installations passed the updated runner:

| Package | Core / framework | Discovery | CLI invocations | MCP calls |
| --- | --- | --- | --- | --- |
| Drive 0.4.0 | 0.265.0 / 0.27.1 | Contract 1 | 22 passed | Not tested |
| Drive 0.5.0 | 0.268.0 / 0.27.2 | Contract 2 | 23 passed | 3 validation failures checked |
| Drive 0.6.0 | 0.275.0 / 0.28.2 | Contract 3 | 35 passed | 3 validation failures checked |
| Drive 0.7.0, precise expectations | 0.278.0 / 0.28.2 | Contract 3 | 41 passed | 3 validation failures checked |

The old 19-operation result above remains the original check. The updated totals add discovery,
provider dictionary preservation, a non-empty search and, for 0.5.0, a read after config migration.
They are not performance measurements or claims that the older release supports contract 2.

For contracts 2 and 3, every successful command response in this runner is validated against the installed framework's
public strict item/list envelope schemas. Each invocation explicitly names the expected shape:
rich results such as search/context use `item`; catalog lists/trees, tags and note lists use
`items`/`page`. Error responses are validated against the framework's error schema in both releases.
Discovery remains its canonical document, checked against the package version. Unknown discovery
contracts fail closed rather than being treated as legacy output.

The legacy camelCase config migrates on the first successful read. The check verifies snake_case
settings, unchanged file permissions, and unchanged bytes/inode/mtime after another read. Search
returns `found_by`, while a deliberately mixed-case provider metadata key remains unchanged.

For 0.5.0 and 0.6.0, a real MCP client starts the installed server over stdio under the same network,
browser and keyring guards. Bad argument types, an unknown argument and a missing required field
must each produce a field-specific `validation_error`. All three failures must appear in the
shared audit store; a synthetic argument canary must appear in neither replies nor audit rows.
No provider request is permitted. The caller is cli-testing's pinned MCP SDK 1.32.1; Drive uses
server SDK 2.1.0, so this also exercises their actual protocol boundary.

Contract 3 adds checks over every discovered command's effects and removal of old metadata keys.
Representative local reads/writes and Google reads/writes are checked explicitly, including the
generated API operation name. Successful responses require `meta.complete`; paginated catalog
and note lists must produce distinct rows and correct `next_page`/`has_more` values. Search page
two is empty for the one matching document. Removed `--offset`/`--agent-json` flags and an unknown
flag must be refused. JSONL must contain exactly two item records followed by one end record with
`complete` and continuation metadata. MCP local-read tools must not claim open-world access.
Expected validation/permission/not-found failures require `retry.safe: false`. Transient-provider
retry safety is covered by the release's unit tests, not injected through a live provider here.

Handwritten `documents get` declares local read plus remote read, while its generated API
counterpart declares remote read only. Both are read-only. The runner records that conservative
distinction rather than pretending the published metadata is identical.

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix /var/tmp/drive-check-050 --ignore-scripts --no-audit --no-fund @wirecat/drive-cli@0.5.0
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/offline-catalog/run.mjs /var/tmp/drive-check-050/node_modules/@wirecat/drive-cli /var/tmp/drive-check-050/node_modules/@wirecat/cli-core
```

The runner emits shape-only JSON containing package/runtime versions, contract and invocation
counts. It never opens the owner's home, account, Google credentials or store. A run uses a new
temporary fixture, which remains available until explicitly cleaned up.

To reproduce contract-3 acceptance, use the same two commands with exact package
`@wirecat/drive-cli@0.6.0` and a separate prefix such as `/var/tmp/drive-check-060`. The runner
uses that package's installed public schemas; it does not validate contract 3 against older schemas.

## Precise provider-only effects

The released handwritten Google reads conservatively claimed local data access, while equivalent
generated methods claimed none. This check supports making the two surfaces agree without
renaming commands or changing which operations are permitted.

The initial metadata-only run at runner commit `990a041` checked candidate
`38623cd15fdfe76a35881c36bdcb945aba2e56a2`: 35 CLI invocations and three MCP calls passed.
That candidate carried version 0.6.0/Core 0.277.0 but was not npm 0.6.0. The current precise
profile additionally checks JSON field selection; that older candidate is not certified against
the stronger profile.
Node 24.19.0 on Linux; the same synthetic fixture and HTTP/browser/keyring guards apply.

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/offline-catalog/run.mjs /path/to/built-drive /path/to/its/core --precise-effects
```

The mode requires contract 3, provider-only effects for handwritten reads, and no data access
for account-free discovery/completion. It retains the exact local-write/cached-read assertions,
page/JSONL checks and MCP validation/audit cases. Without the flag, historical release
expectations remain unchanged; the runner does not guess the new behavior from a reused version.
The JSON result records `effects_expectation` alongside runtime/dependency versions.

As a negative control, npm 0.6.0 fails the new expectation on `documents get`'s local effect.
That confirms this mode detects the actual metadata difference instead of merely accepting
both answers. The candidate's native suite passed 172 tests (90.73% line coverage), lint/types,
generation freshness and eight CLI/MCP contracts. Node and Bun installed-tarball smoke checks
also passed. Command lint retained 67 inherited findings,
zero new, zero overrides and the unchanged budget. No baseline was expanded.

### Released 0.7.0 field selection

A fresh npm installation of Drive 0.7.0 passed all 41 CLI invocations and three MCP calls on
2026-10-14, using exact Core 0.278.0/framework 0.28.2. Release commit
`dbaf2176e48d69f6b9cef74d47f5ad8dffe8972f` passed
[publication validation](https://github.com/WireCatLabs/drive-cli/actions/runs/38634638678).
This is a registry artifact result, separate from the earlier source candidates.

The stronger profile adds item/list JSON selection, JSONL selection with a complete end record,
a mixed-case provider metadata path, unknown-field refusal and refusal of undeclared write
selection before provider access. Catalog names survive projection as `name`; `title` belongs
to the generic document entity and is not silently substituted into the provider view.

Non-empty real-store fixtures exposed the selector bug while preparing this release: valid
catalog names were rejected against the generic entity, and an accepted missing field could
produce an empty object. [Core PR1221](https://github.com/WireCatLabs/cli-core/pull/1221) adds an
optional provider-field resolver to the public parser/validator; [Drive PR44](https://github.com/WireCatLabs/drive-cli/pull/44)
uses it, declares the catalog view, validates read responses before printing and refuses
undeclared write selection before execution. Core's original candidate suite passed 4,274 tests
with four existing skips and 95.02% line coverage; its
[0.278.0 release validation](https://github.com/WireCatLabs/cli-core/actions/runs/38632226817)
then passed against the merged current main. The Drive candidate passed 174 tests and 90.8%
line coverage, five previous-store upgrade cases and installed Node/Bun package smoke.

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix /var/tmp/drive-check-070 --ignore-scripts --no-audit --no-fund @wirecat/drive-cli@0.7.0
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/offline-catalog/run.mjs /var/tmp/drive-check-070/node_modules/@wirecat/drive-cli /var/tmp/drive-check-070/node_modules/@wirecat/cli-core --precise-effects
```

This check describes source-data effects. Common configuration/credential loading and MCP's
framework audit records are separate from a command reading or modifying cached documents.
Native tests also verify that a provider read does not open the content store and is refused
offline. No live provider response, real account or remote write is part of this result.

See the [standards gap review](standards.md) for the release/source distinction and next work,
and the [controlled live checklist](live-checklist.md) for the separately authorized Google test.

## Limits

This is a functional contract check, not a latency benchmark or Google API integration test.
It does not establish extraction fidelity, live metadata completeness, Google verification or
live user sign-in. Metadata-only backfill never refreshes old Google responses, and
catalog retirement differs from regular sync's indexed-content removal. No owner account data
is used or published.
