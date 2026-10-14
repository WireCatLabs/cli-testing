# Offline Drive catalog

Drive kept Google folder ancestry in sync checkpoints but could not browse or annotate that
hierarchy through the shared database. This check asks whether a catalog can reuse existing
indexed documents, remain account-scoped and support folder context without contacting Google.
It supports adopting the shared `store.catalog` API rather than another Drive-specific store.

## Setup and reproduction

Synthetic data only: one root, one nested folder, one indexed PDF fixture and a second explicit
profile. Node 24.19.0 on Linux; candidate builds from the catalog branches, not npm releases.
The runner imports the core package's public store export to seed an isolated database, then
invokes the compiled Drive executable. HTTP/fetch, child process/browser calls and the keyring
entry constructor are blocked inside each CLI process. Config, database and cache paths all
point to a new temporary directory.

```sh
node performance/documents/offline-catalog/run.mjs /path/to/built-drive /path/to/built-core
```

Both paths must contain built package artifacts and installed dependencies. The runner never
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
NPM_CONFIG_USERCONFIG=/dev/null pnpm install --frozen-lockfile
NPM_CONFIG_USERCONFIG=/dev/null pnpm test:coverage
```

The producer's tests run from its own package test script; the compiled-consumer check runs
through [run.mjs](run.mjs). Later merges and release artifacts need their own validation.

## Released-package acceptance

Drive 0.4.0 is published on npm with exact dependencies `@wirecat/cli-core` 0.265.0 and
`@wirecat/cli-base` 0.27.1. A fresh isolated npm installation completed all 19 operations
with the same network/browser/keyring guards. This establishes package installation and
offline catalog behavior, separately from the earlier compiled-candidate checks.

```sh
NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix /tmp/drive-check --ignore-scripts --no-audit --no-fund @wirecat/drive-cli@0.4.0
node performance/documents/offline-catalog/run.mjs /tmp/drive-check/node_modules/@wirecat/drive-cli /tmp/drive-check/node_modules/@wirecat/cli-core
```

The combined release candidate passed 158 unit tests (89.76% line coverage), eight CLI/MCP
contracts, five prior-store upgrades, leak checks and Node/Bun installed-tarball smoke.
[Release validation](https://github.com/WireCatLabs/drive-cli/actions/runs/38498940380) passed
before publication. Optional image search is included in that release, but this catalog runner
does not measure real image inference or Google conversion fidelity.

## Limits

This is a functional contract check, not a latency benchmark or Google API integration test.
It does not establish extraction fidelity, live metadata completeness, Google verification or
live user sign-in. Metadata-only backfill never refreshes old Google responses, and
catalog retirement differs from regular sync's indexed-content removal. No owner account data
is used or published.
