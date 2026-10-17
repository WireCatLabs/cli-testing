# Retain document context when changing stores

Drive's store switch refused to strand annotations, but users had no supported way to copy them into
the shared database. This check verifies Core's provider-neutral copy against actual packaged SDKs:
a store written by the Core version used in Drive 0.16.0, and the new transfer implementation. It
checks identity/reference collisions and retry behavior before Drive adopts the released SDK.

## Candidate result

[Nine packaged checks pass](results-core-candidate-2026-10-17.json) on Linux x64 / Node 24.19.0.
Source data is created through registry Core **0.307.0**, its original schema **17**, and its fresh
compatible Base resolution **0.40.4**. The target is a packed Core candidate from source
[c7560189194657f09a098ee882eba463fa20664b](https://github.com/WireCatLabs/cli-core/commit/c7560189194657f09a098ee882eba463fa20664b),
with schema **21** and Base **0.43.0**. Core's implementation is merged in
[Core#1480](https://github.com/WireCatLabs/cli-core/pull/1480).

The candidate package reports version 0.326.0, but **this is not a registry 0.326.0 capability claim**.
That release was captured before this feature. The JSON records full package integrity, public store
entry hash, Base version and schema for each independently installed SDK. Each resolves one physical
Base within its own graph; the source and target graphs are deliberately different. This tests the
SDK Core version used by Drive 0.16.0, not the exact dependency graph of its compiled CLI artifact.

| Check | Result |
| --- | --- |
| An actual previous registry SDK writes the source | Pass |
| An incoming project link cannot reuse a colliding row ID without an explicit binding | Pass |
| A forced SQLite interruption rolls back every newly copied record | Pass |
| Text, notes, tags and aliases transfer while unrelated destination records remain | Pass |
| Memory scope/status/evidence, decisions and observed editor identity retain meaning | Pass |
| Transfer leaves the old source file byte-for-byte unchanged | Pass |
| The previous SDK writes to the migrated destination and the new SDK reads its note | Pass |
| Retrying a completed copy preserves later destination writes without duplicates | Pass |
| A changed completed source refuses another copy, retaining both versions | Pass |

The last check deliberately adds a synthetic annotation to the source through the old SDK. That
owner-like write is separate from the transfer, whose own read-only source handling leaves it intact.

## Reproduce

The runner accepts SDK installation prefixes, not existing database paths. It creates its own
source, destination and two synthetic provider collections, including same-path files, colliding
project/note/document rows, an incoming project link, a tag alias, an editor and proposed memory.
It imports only public compiled `@wirecat/cli-core/store` APIs. A guard refuses network, browser,
keyring and subprocess helpers throughout the run; no model is loaded and no owner data is read.

Install exact registry Core 0.307.0 into `SOURCE_PREFIX`, retaining its peer resolution. Install the
reviewed packed candidate and exact Base 0.43.0 into a separate `TARGET_PREFIX`, then run:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/annotation-transfer/run.mjs SOURCE_PREFIX TARGET_PREFIX OUTPUT_JSON
```

`run.mjs` uses the public cache seam only for the synthetic failure trigger and row-count checks;
it never imports a private Core table module. Runtime results are standard API records, rather than
CLI envelopes. The nine checks are groups of SDK calls, not nine CLI commands or HTTP requests.

## Boundaries

This is a bounded local snapshot copy, not ongoing synchronization or migration of an entire person's
messages, contacts or tasks. Core copies minimal current identity associations and author handles;
it does not copy credentials. Unmatched external references block the plan. Source changes after a
completed copy refuse rather than overwrite destination edits. Large graphs reject without truncation.
Vectors and pictures are derived and need explicit indexing again; literal free-text references are
not rewritten. These cases do not certify Google conversion, OAuth, remote writes or universal schema
compatibility. Drive's profile/checkpoint behavior is checked separately through its consumer tests.
