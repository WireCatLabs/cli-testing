# Offline Drive catalog

Drive kept Google folder ancestry in sync checkpoints but could not browse or annotate that
hierarchy through the shared database. This check asks whether a catalog can reuse existing
indexed documents, remain account-scoped and support folder context without contacting Google.
It supports adopting the shared `store.catalog` API rather than another Drive-specific store.
The release check also asks whether the new JSON envelope and config migration preserve those
workflows for installed-package consumers.

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

The old 19-operation result above remains the original check. The updated totals add discovery,
provider dictionary preservation, a non-empty search and, for 0.5.0, a read after config migration.
They are not performance measurements or claims that the older release supports contract 2.

For contract 2, every successful command response is validated against the installed framework's
public strict item/list envelope schemas. Each invocation explicitly names the expected shape:
rich results such as search/context use `item`; catalog lists/trees, tags and note lists use
`items`/`page`. Error responses are validated against the framework's error schema in both releases.
Discovery remains its canonical document, checked against the package version. Unknown discovery
contracts fail closed rather than being treated as legacy output.

The legacy camelCase config migrates on the first successful read. The check verifies snake_case
settings, unchanged file permissions, and unchanged bytes/inode/mtime after another read. Search
returns `found_by`, while a deliberately mixed-case provider metadata key remains unchanged.

For 0.5.0, a real MCP client starts the installed server over stdio under the same network,
browser and keyring guards. Bad argument types, an unknown argument and a missing required field
must each produce a field-specific `validation_error`. All three failures must appear in the
shared audit store; a synthetic argument canary must appear in neither replies nor audit rows.
No provider request is permitted. The caller is cli-testing's pinned MCP SDK 1.32.1; Drive uses
server SDK 2.1.0, so this also exercises their actual protocol boundary.

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix /var/tmp/drive-check-050 --ignore-scripts --no-audit --no-fund @wirecat/drive-cli@0.5.0
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/offline-catalog/run.mjs /var/tmp/drive-check-050/node_modules/@wirecat/drive-cli /var/tmp/drive-check-050/node_modules/@wirecat/cli-core
```

The runner emits shape-only JSON containing package/runtime versions, contract and invocation
counts. It never opens the owner's home, account, Google credentials or store. A run uses a new
temporary fixture, which remains available until explicitly cleaned up.

See the [standards gap review](standards.md) for the release/source distinction and next work,
and the [controlled live checklist](live-checklist.md) for the separately authorized Google test.

## Limits

This is a functional contract check, not a latency benchmark or Google API integration test.
It does not establish extraction fidelity, live metadata completeness, Google verification or
live user sign-in. Metadata-only backfill never refreshes old Google responses, and
catalog retirement differs from regular sync's indexed-content removal. No owner account data
is used or published.
