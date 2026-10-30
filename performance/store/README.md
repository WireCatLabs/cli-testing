# Store

Measurements of the SQLite store that tg-cli, max-cli, memo and drive share through cli-core.

- [folded-filters](folded-filters/README.md) — list filters on names in any script: `lower()` against a stored
  `fold()`ed copy (2026-10-14).
- [stored-chat-ids](stored-chat-ids/README.md) — reading every chat id of one account in one call, as
  `storedChats` gets them (2026-10-19).
- [rekey-batch](rekey-batch/README.md) — the first `serve` after upgrading re-keys every phone-form chat: how long,
  and how long it keeps other commands from the write lock (2026-10-19).
- [table-sizes](table-sizes/README.md) — row counts, table sizes and integrity checks for the desktop app's Storage
  page: which can be live (2026-10-25).
- [gcal-baseline](../calendar/gcal-baseline/README.md#3-sync-without-the-network) — the `node:sqlite` driver prepares every
  statement again on each call. A per-connection cache made a calendar sync 3–5 times faster (2026-10-30).
