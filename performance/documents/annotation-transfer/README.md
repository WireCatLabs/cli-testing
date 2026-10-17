# Retain document context when changing stores

Drive's store switch refused to strand annotations, but users had no supported way to copy them into
the shared database. This check verifies Core's provider-neutral copy against actual packaged SDKs:
a store written by the Core version used in Drive 0.16.0, and the new transfer implementation. It
checks identity/reference collisions and retry behavior before Drive adopts the released SDK.

## Released Core SDK

[The registry run](results-core-registry-0327.json) repeats all nine checks with published Core
**0.327.0**, Base **0.43.0** and schema **21**, against registry Core 0.307.0 / schema 17 as source.
[Core release 39069033136](https://github.com/WireCatLabs/cli-core/actions/runs/39069033136) passes its
checks and tags [v0.327.0](https://github.com/WireCatLabs/cli-core/releases/tag/v0.327.0) at
cad9a03b368b12ee480e311363dc1baed14cc211. Publication used the documented MCP adoption ref for the
already-pending Telegram/MAX change; it did not disable parity. The feature is ready for Drive's
exact dependency adoption. This SDK result is separate from a Drive CLI release claim.

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

For the released run, install exact registry Core 0.307.0 with Base 0.40.4 into `SOURCE_PREFIX`,
and Core 0.327.0 with Base 0.43.0 into `TARGET_PREFIX`. For the historical candidate result, use the
reviewed tarball instead of target Core 0.327.0. Keep the installations separate, then run:

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

## Compiled Drive consumer

`cli.mjs DRIVE_PREFIX PREVIOUS_CORE_PREFIX OUTPUT_JSON` checks the installed Drive binary in
separate guarded processes. It seeds two new schema-17 stores through the previous public SDK and
writes the published v1 synthetic cache/config format used by Drive's upgrade contracts. It imports
no private Drive or Core implementation. Child processes refuse network, browser, subprocess and
keyring access. The synthetic source is retained. This runner requires Node 24's module hooks.

It checks explicit-profile/readonly/fingerprint refusals, unchanged preview checkpoints, migration
and row-reference collisions, cached reading, tag search, owner context and completed-copy replay.
The consumer must resolve one physical Base and Commander with its Core peer; dependency-version
strings alone do not prove that shared error classes are the same runtime instance.

[Installed candidate results](results-drive-candidate.json) pass **14 guarded CLI invocations**
against a newly packed Drive artifact with registry Core 0.327.0 and Base 0.43.0. The source and
preexisting destination are both created by registry Core 0.307.0 (schema 17). The CLI migrates only
the destination, rewrites the checkpoint, preserves source bytes and unrelated destination evidence,
and reads/searches the copied context after the previous process exits. Profile, readonly and
fingerprint refusals pass; replay does not double the memo. Existing read-only MCP tools remain
semantically unchanged and the contract adds store_check; the write-enabled consumer test verifies
store_import is mounted and bad extra arguments are refused/audited before I/O.

The candidate reports Drive 0.16.0 because release preparation is separate. It is built from
[6d92e7062828543abe003873bc66ff207ba2c1df](https://github.com/WireCatLabs/drive-cli/commit/6d92e7062828543abe003873bc66ff207ba2c1df)
([Drive#115](https://github.com/WireCatLabs/drive-cli/pull/115)); it does not establish that registry
Drive 0.16.0 includes transfer. The source unit suite passes 310 tests / 91% lines, with ten CLI/MCP
contracts, five older-store upgrade cases and Node/Bun installed smoke. These source checks and the
independent installed fixture exercise different boundaries; the fourteen calls are not HTTP calls.
