# A long sync slows down as the chat grows

## Why it was run

A tg-cli user reported that `messages sync` of a big group started at about 75 messages/s and fell to about 7 as the
store filled ([tg-cli #917](https://github.com/WireCatLabs/tg-cli/issues/917)). The question: is it Telegram, or the
store? And if the store, which statement grows with the chat? The answer decided cli-core
[#3333](https://github.com/WireCatLabs/cli-core/pull/3333), a code-only fix released on 0.x, and an index added to
store version 73 with cli-core 1.0.

## Setup

- Machine: AMD Ryzen AI 9 HX 370, 59 GB RAM, Linux 7.0, Node 24.19.0.
- Code: cli-core `main` at `4e62a357a` (before) and `feadb663b` from #3333 (after).
- Data: synthetic only. [`bench.test.ts`](bench.test.ts) opens an empty store, then saves one group chat in pages of
  100 messages from the newest id down, as a history sync does: `saveMessages` then `markRange` for each page. Every
  fifth message replies to another. It prints the mean time per page for each 10,000 messages stored.
- The database is on tmpfs (`/dev/shm`), so the numbers leave out the fsync of each commit. On the sandbox's disk
  that adds about 200 ms per commit, whatever the chat size.

```sh
cp bench.test.ts <cli-core checkout>/src/store/zz-bench-917.test.ts
cd <cli-core checkout>
BENCH_DB=/dev/shm/bench917/m.db BENCH_TOTAL=90000 BENCH_OUT=$PWD/bench.txt pnpm exec vitest run src/store/zz-bench-917.test.ts
```

`BENCH_INDEX` takes SQL that runs on the new database before the first page, used here to try an index.

## Results

Time to save one page of 100 messages, by messages already stored in the chat:

| Stored | Before | Index only | After (#3333) |
|---|---|---|---|
| 10,000 | 78 ms | 19 ms | 32 ms |
| 20,000 | 190 ms | 24.9 ms | 32.9 ms |
| 30,000 | 294 ms | 21.9 ms | 37.1 ms |
| 40,000 | 452 ms | 23.4 ms | 38.4 ms |
| 50,000 | 531 ms | — | 40.6 ms |
| 60,000 | 593 ms | — | 42.2 ms |
| 90,000 | 919 ms | — | — |

`markRange` stayed under 1 ms per page in every run.

"Index only" is the code before the fix, with
`CREATE INDEX bench_thread ON messages (chat_id, thread_external_id) WHERE thread_root_id IS NULL AND thread_external_id IS NOT NULL`.

## What it showed

- The store is the cause. A CPU profile of the "before" run put 85% of the time in SQL inside `upsertMessage`.
- The statement that grows is the one that links replies saved before their thread's root:
  `UPDATE messages SET thread_root_id=? WHERE chat_id=? AND thread_external_id=? AND thread_root_id IS NULL`. No
  index covers `thread_external_id`, so SQLite's plan is `SEARCH messages USING INDEX messages_by_time (chat_id=?)`,
  a scan of the whole chat. It ran once for each saved message.
- #3333 runs it once per page. That leaves one scan per page, so the time still grows slowly (32 → 42 ms over
  60,000 messages). The index removes the scan and keeps the time flat. It needs a store migration, so it ships in
  version 73 with cli-core 1.0.

## What was not measured

- The "after" run was made on a busy machine (load average about 25). The "before" and "index only" runs were made
  earlier the same night under unknown load. Compare the trend, not the exact milliseconds.
- Telegram's own speed, flood waits and media downloads. The benchmark only covers the store.
- The fix and the index together.
- Chats beyond 90,000 messages.
