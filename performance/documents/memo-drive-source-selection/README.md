# Selecting Drive documents in Memo search

## Why

Drive's backlog item DRV-18 asks for document-only search through Memo. cli-core already filters file notes
(`source:file`) and Memo already takes `--source`, so the item said: check the published pair end to end before
writing code. The answer decides whether DRV-18 needs code, and it feeds the design that makes Drive's data
first-class in the shared store (Drive files are stored as notes of a folder account today).

Questions:

1. Does `--source drive` (or `drive:<profile>`) in Memo return only Drive documents — no memo notes, no notes
   from a disk folder, no mail?
2. Does the kind word `--source documents` select them?
3. Do `memo search all` hits for a Drive file carry the Google link and Google's edit time?

## Setup

- Packages from npm: `@wirecat/drive-cli` 0.28.0 and `@wirecat/cli-memo` 0.92.0, which resolve one physical
  `@wirecat/cli-core` 0.406.0 (the runner asserts this).
- One temporary shared database. Drive imports one synthetic Google Doc through its public program with an
  injected source (no Google call). The public Core store adds one memo note, one note in a disk folder and one
  email. All four texts hold the words `zebra harbor`.
- Every Memo command runs as the compiled executable in its own process, under
  [the drive-shared-store guard](../drive-shared-store/guard.mjs), which refuses network, keyring and subprocesses.
  `--exact` keeps meaning search, and so the model, out of it.

```sh
P=$(mktemp -d -p /var/tmp) && (cd $P && npm init -y >/dev/null && npm install @wirecat/drive-cli@0.28.0 @wirecat/cli-memo@0.92.0)
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/memo-drive-source-selection/run.mjs $P /absolute/results.json
```

## Results (2026-10-24, [results-registry.json](results-registry.json))

| Memo command (`zebra harbor --exact`) | Exit | Hits |
|---|---|---|
| `search all` | 0 | mail, Drive, memo note, disk note |
| `search all --only notes` | 0 | Drive, memo note, disk note |
| `search notes` | 0 | Drive, memo note, disk note |
| `search notes --source drive` | 0 | **Drive only** |
| `search notes --source drive:synthetic` | 0 | **Drive only** |
| `search notes --source notes:<Drive folder id>` | 0 | **Drive only** |
| `search notes 'zebra harbor source:file'` | 0 | Drive, disk note |
| `search notes --source notes:internal` | 0 | memo note only |
| `search notes --source documents` | 2 | refused: `--source names nothing memo search notes reads: documents (no account in the store)` |

Every Drive hit carries `kind: document`, `provider: drive`, `account: synthetic` (the Drive profile), the Google
URL in `url`, and Google's edit time (`2026-01-02T03:04:05Z`) as its timestamp, not the import time. Memo notes and
disk notes carry the time they were stored and no URL.

## What it showed

- **Question 1 — yes, in `search notes`.** `--source drive`, `drive:<profile>` and the folder id each select the
  Drive documents alone.
- **`search all` has no Drive-only selection.** It takes no `--source`, and `--only` knows `messages,mail,notes`;
  `--only notes` mixes Drive documents with memo and disk notes.
- **Question 2 — no.** `documents` is refused, and the message says there is no account, although the store holds a
  Drive document. cli-core counts every folder account as kind `notes` (`heldOf` in
  `cli-core:src/search/account-list.ts`), so the kind word `documents` matches nothing. Memo's own source parser
  accepts `documents` and `drive` as the same word, but `search notes` reads through cli-core's account list.
- **Question 3 — yes.** Link and Google edit time arrive on `search all` and `search notes` hits.

## Not measured

- Meaning (vector) search: `--exact` only.
- Several Drive profiles, Shared Drives, and a Drive profile whose name collides with a folder.
- Memo's MCP tools; only the command line ran.
- `memo context <person>` and `memo ask`, which read documents through other paths.
- Live Google data: the import is synthetic.
