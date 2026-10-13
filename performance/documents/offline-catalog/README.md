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

The candidate completed 18 CLI invocations with all assertions passing:

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
| Retire metadata when selected roots are removed | ✅ Active catalog emptied; existing indexed text retained |

The producer's store tests separately cover metadata/content updates, renames/reparenting,
re-entry, unreadable entries, batch validation, SQL query logic and reader metadata coexistence.
Drive's synthetic tests cover partial content batches, failed catalog persistence, retries and
ordinary sync removal. Test totals and coverage belong to those exact builds, not this runner.

## Limits

This is a functional contract check, not a latency benchmark or Google API integration test.
It does not establish extraction fidelity, live metadata completeness, Google verification or
npm installation readiness. Metadata-only backfill never refreshes old Google responses, and
catalog retirement differs from regular sync's indexed-content removal. No owner account data
is used or published.
