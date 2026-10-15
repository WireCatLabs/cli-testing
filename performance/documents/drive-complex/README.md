# Complex Drive documents and sync recovery

The initial Google comparison covered five single-tab Docs. It could not establish whether
multi-tab documents retain their content or whether edits and moves keep local context intact.
These checks answer those questions before extending the connector further: a read-only live
sample measures content retention, while a synthetic compiled-package fixture exercises changes
without editing an owner's Google files.

## Setup and reproduction

2026-10-15, Linux, Node 24.19.0, fresh npm Drive **0.11.2** and **0.12.0**, exact Core **0.289.0**
and Base **0.33.0**. The runner accepts those reviewed versions and refuses others. It imports only the installed package's public
compiled `createProgram` and `googleSource` exports, the SDK and framework helpers. It never
imports Drive TypeScript source or replaces the index with a mock.

```sh
D=$(mktemp -d -p /var/tmp) && T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix "$D" --ignore-scripts --no-audit --no-fund @wirecat/drive-cli@0.11.2
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/drive-complex/run.mjs "$D/node_modules/@wirecat/drive-cli"
```

Repeat these commands with `@wirecat/drive-cli@0.12.0` for its independent compatibility check;
the first command creates another fresh installation directory.

[fixture.mjs](fixture.mjs) supplies valid-shaped Docs responses with five tabs, two nested
levels, a table containing another table, an empty cell/tab, a footnote, a table of contents,
person/link chips and Unicode text. Headers and footers have excluded markers. Native Markdown
uses CRLF and remains a separate provider artifact; it is deliberately different from all-tab
search text. [run.mjs](run.mjs) scripts the installed Google SDK's request seam and runs the
compiled command parser/handlers and real shared SQLite store with fresh explicit-profile state.
HTTP, browser/process launching and the actual installed keyring are denied. SDK methods must
be reads. Temporary fixture state remains available for inspection; cleanup is separate.

## Compiled-package results

**45 command invocations and ten behavior groups passed on each package.** Synthetic-only summaries
are saved separately for [0.11.2](results.json) and [0.12.0](results-0.12.0.json). The newer release
adds uploads; it leaves the document extraction, Google source, sync and store modules unchanged.
This compatibility run exercises reading and local source lifecycle, not uploads.

| Behavior | Observed result |
| --- | --- |
| One Markdown export fails during import | Partial sync raises `provider_error` with reason `sync.partial`; the other source saves; retry drains pending work without relisting folders |
| Nested tab/text extraction | All five tab IDs retain order; body, nested tables, footnotes, table of contents, chip labels and Unicode remain readable |
| Retrieval and export | Distinct content markers find their own source; headers/footers are excluded; exported bytes preserve provider Markdown and CRLF |
| Duplicate titles | Two file IDs retain distinct references |
| Rename | Source reference, tag, owner note and confirmed memory survive unchanged content |
| Edit | New words become searchable; old words disappear; confirmed source memory becomes stale |
| Move inside selected roots | Parent metadata and both parent listings update; source reference and tag survive |
| Trash and restore | Trashed text/listing/snapshot disappear; unrelated duplicate stays; restoration reuses the reference and owner note; memory stays stale |
| Parent folder leaves scope, then re-enters | Descendant disappears without its own file event; re-entry discovers it and preserves reference/note |
| Repeat the same change observation | No new text saves |

This is a composed behavior test through the published compiled entry point. It does not start
the executable in another process, test SIGINT, or reproduce a real Google mutation. Prior
[installed executable/MCP and interruption evidence](../offline-catalog/README.md) remains separate.

## Read-only Google sample

The owner authorized the existing profile and selected folder. A copy of the earlier isolated
validation store was opened under npm 0.11.2; the normal owner database was untouched. Google
access stayed read-only, with no scope or permission changes and no AI/model requests.

| Check | Observed result |
| --- | --- |
| Multi-tab sources | Seven documents, 83 tabs, 107 tables |
| Source stability | All seven Google versions matched the cached version before and after reading |
| Indexed text | 7,159 nonempty body/table text-run fragments; none missing from the matching cached tab or the combined text |
| Tab metadata | IDs, order and titles matched Google |
| Last-tab retrieval | Offline exact search found the original source reference for all seven |
| Cached Markdown export | All seven matched cached native Markdown bytes; output mode 0600 |
| Operations | 42 comparison commands plus an offline selected-root guard; 21 provider-read commands |

Private scripts, source IDs and per-source totals:
`cli-private/reports/drive/2026-10-15-live-read/complex-0112/`. Public material contains totals
only. Raw Google responses were held in memory, not committed. Local snapshots/exports remain
inside the private validation workspace.

## Decision and limits

Keep all-tab search extraction separate from native Markdown export, retain file-ID identity
through metadata changes, and preserve replayable pending work. The composed fixture found no
product failure requiring a code change in these paths.

The live sample contains **no nested tabs or footnotes**; those have synthetic SDK-fixture
coverage. Markdown roundtrip checks preserve the cached provider artifact; they do not compare
it with a newly fetched Google Markdown export or certify complete layout/tab conversion.
Fresh OAuth, live edit/move/trash propagation, OCR, real embeddings, AI extraction and a real
process interruption are outside this run. Google exposes [tab content and child tabs through
`includeTabsContent`](https://developers.google.com/workspace/docs/api/how-tos/tabs); schema
coverage alone does not establish live provider fidelity.
