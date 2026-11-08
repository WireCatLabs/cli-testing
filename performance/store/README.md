# Store

Measurements of the SQLite store that tg-cli, max-cli, memo and drive share through cli-core.

- [folded-filters](folded-filters/README.md) — list filters on names in any script: `lower()` against a stored
  `fold()`ed copy (2026-10-14).
- [stored-chat-ids](stored-chat-ids/README.md) — reading every chat id of one account in one call, as
  `storedChats` gets them (2026-10-19).
- [rekey-batch](rekey-batch/README.md) — the first `serve` after upgrading re-keys every phone-form chat: how long,
  and how long it keeps other commands from the write lock (2026-10-19).
- [lock-hold](lock-hold/README.md) — which writer holds the shared write lock: one mail save per transaction costs
  about 300 ms once it queues text, and slices of 50 fix the wait (2026-10-31).
- [lock-gap](lock-gap/README.md) — how big a gap between a writer's transactions lets another process's write in:
  none fails even a 1 ms retry, 2 ms lets in both kinds of wait (2026-10-31).
- [table-sizes](table-sizes/README.md) — row counts, table sizes and integrity checks for the desktop app's Storage
  page: which can be live (2026-10-25).
- [gcal-baseline](../calendar/gcal-baseline/README.md#3-sync-without-the-network-resultssync-json) — the `node:sqlite` driver prepares every
  statement again on each call. A per-connection cache made a calendar sync 3–5 times faster (2026-10-30).
- [records-import-sheets](records-import-sheets/README.md) — the first real import of two payment spreadsheets into
  memo's records store: split payments needed a per-link amount, and 7 of 7 totals matched the sheets (2026-11-05).
- [integrity](integrity/README.md) — a harness that damages a synthetic store on purpose: T1 rebuilds the
  2026-11-06 damage (a second open in a live process) on cli-core 0.593.0, and 0.608.0 survives it; only the older
  `sqlite3` shell's close deleted the WAL; `store recover run` makes a sound file from each broken store but cannot
  bring back rows the damage destroyed. Its [What can happen again](integrity/README.md#what-can-happen-again)
  lists the risks that remain after the fix (2026-11-08).
- [records-jsonl-stream](records-jsonl-stream/README.md) — the streaming JSONL records import (cli-core 0.612.0),
  1,000 to 300,000 synthetic business records: peak memory levels off at 340–365 MB from 100,000 records while the
  file triples, so large imports need no chunking advice for memory (2026-11-08).
