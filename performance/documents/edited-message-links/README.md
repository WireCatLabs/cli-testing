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
edit timestamps can be absent or older than the local checkpoint. The query needs no new table or index; Drive uses the adopted SDK's normal store upgrade.
The source regression cases reproduce the old behavior and pass after the fix; released Drive
acceptance is recorded separately once it adopts the SDK.

## Fixed SDK and packaged consumer

Core **0.331.0** is published from
[5ce8004d8f47dd499c1ea1019b57e2f488f61772](https://github.com/WireCatLabs/cli-core/commit/5ce8004d8f47dd499c1ea1019b57e2f488f61772).
[Release 39074709286](https://github.com/WireCatLabs/cli-core/actions/runs/39074709286) passes,
including Telegram/MAX/WhatsApp main parity. The launcher watcher briefly lost its GitHub API
connection; the existing run was followed without redispatch. Final local coverage at the feature
head passes 5,161 tests at 95.08% lines. An earlier full attempt exposed a sandbox-path test
assumption; its isolation assertion was corrected and the full run repeated successfully.

Drive's packed candidate from
[07f29b7def781be69e09ac59921c5eb8b67d371d](https://github.com/WireCatLabs/drive-cli/commit/07f29b7def781be69e09ac59921c5eb8b67d371d)
uses actual registry Core 0.331.0 / Base 0.43.2 in its normal dependency graph. It still reports
Drive 0.17.0 before release preparation; **this is not a registry Drive 0.17.0 feature claim**.

| Run | Result | Syncs | Content reads |
| --- | --- | --- | --- |
| [Registry baseline](results-drive-0170-baseline.json) | Expected missing links reproduced | 2 | 1 |
| [Packed fresh profile](results-candidate-fresh.json) | Five groups pass | 5 | 1 |
| [Packed upgrade from registry Drive 0.17.0](results-candidate-upgrade.json) | Six groups pass; already-missed URLs repaired | 6 | 1 |

Drive's host marker is saved only after historical and recent passes succeed. Existing checkpoints
without the marker get one historical local pass. Failure leaves retry state; later successful
runs return to incremental linking. The source suite passes 312 tests / 91.01% lines, ten CLI/MCP
contracts, five older-store cases and Node/Bun installed acceptance. Exact registry consumer
results remain a separate delivery check. The checker initially used a removed top-level reader
alias; it was corrected to the public messages store area before recording passing results.

## Registry Drive release

Drive **0.17.1** is published from
[388b9efa0e4cea4322385c2d9e2c5f569bc0f68b](https://github.com/WireCatLabs/drive-cli/commit/388b9efa0e4cea4322385c2d9e2c5f569bc0f68b).
[Release 39076294318](https://github.com/WireCatLabs/drive-cli/actions/runs/39076294318) passes every
required job. A fresh npm installation with registry Core 0.331.0 / Base 0.43.2 repeats the passing
[fresh-profile run](results-registry-fresh-0171.json) and
[upgrade from registry Drive 0.17.0](results-registry-upgrade-0171.json). The upgrade fixture requires
the old checkpoint to be strictly later than the missed edit, so merely extending the recent query
cannot repair it. Five/six syncs respectively read document content once; all five/six groups pass.

The JSON records the exact Drive/Core registry integrity and one physical Base/Commander in the
consumer graph. The installed command reports 0.17.1. The message writer remains the separate
registry Core 0.307.0 graph; existing SDKs can continue storing edits against the upgraded store.
These checks do not require an account login or a new Google grant.

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
