# Document links introduced by message edits

Drive's incremental linker checked a message's first local insertion time. If an older saved message
later gained a Google document URL, sync could advance its checkpoint without connecting that message
to the imported document. This runner checks the compiled Drive command against saved text edits from
an older public Core SDK. It also checks repair of already-missed links after upgrading, rather than
only testing edits after a fresh installation.

## Baseline

[Published Drive 0.17.0 / Core 0.327.0](results-drive-0170-baseline.json) reproduces the defect.
Core 0.307.0 saves initial messages and later writes their text edits through public store APIs.
Two syncs import one synthetic document and then see unchanged Google content. Both provider
accounts have a visible URL in current message text, but neither gets a document link. The baseline
records “defect reproduced”, not a passing feature result. The same provider/account/chat/message
shapes are synthetic; no existing store is accepted as input.

[Core#1496](https://github.com/WireCatLabs/cli-core/pull/1496) uses the existing local text-revision
time and revision-by-message index. Older SDKs capture text revisions without advancing the message
row's update timestamp, so checking that timestamp alone would still miss their writes. Provider
edit timestamps can be absent or older than the local checkpoint. No schema change is required.
The source regression cases reproduce the old behavior and pass after the fix; released Drive
acceptance is recorded separately once it adopts the SDK.

## Reproduce

Install the Drive release in `DRIVE_PREFIX` and registry Core 0.307.0 / Base 0.40.4 in a separate
`PREVIOUS_CORE_PREFIX`, using their normal dependency graphs. Each Drive/Core pair must resolve one
physical Base and Commander. Node 24's hooks refuse native keyring loading; the shared guard refuses
network, browser and subprocess helpers. Google content comes from a narrow injected synthetic
source. Command parsing, sync orchestration, indexing, checkpoints and link queries use compiled
public package exports. A memory keyring is explicitly injected.

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/edited-message-links/run.mjs DRIVE_PREFIX PREVIOUS_CORE_PREFIX OUTPUT_JSON
```

Add `--expect-missing` for the historical Drive 0.17.0 baseline. It requires the missing links rather
than treating any failure as reproduction. Add `--upgrade-from PREVIOUS_DRIVE_PREFIX` to first run
the initial two syncs through that older Drive artifact, verify its missed links and advanced
checkpoint, then run the updated tool on the same synthetic state. Fresh acceptance uses five
syncs; upgrade acceptance uses six. Both require only one document-content read.

The checks cover two provider accounts with colliding external IDs, absent provider edit time,
repeated sync, current-text filtering after URL removal/deletion, and re-added URLs. Existing link
rows are retained as historical context; the current chat-document reader uses current message text.
These results do not establish remote edit-event delivery, hidden formatted-link support, OAuth,
Google conversion, model quality or complete history coverage.
