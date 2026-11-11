# The coverage step of every message search, and word-end patterns

Measured 2026-11-11 for the cli-core pull request that fixes the search gaps of the 2026-11-11 audit (PERF-100,
PERF-99).

## Why we ran it

A message search answers with its coverage: which chats it read, which are held in full, which need a sync. The
audit's CPU profile of [`*word*` in chat messages](../infix-chat-text/README.md) showed that this step alone took about
0.48 s of every search at 1M messages, whatever the query: it counted and dated every message of every chat
(`chatStats`, a `count`/`min`/`max` grouped over all messages). That is a quarter of the 2 s limit agents and MCP
search under.

The same audit found that a word-end pattern (`*ени`, `*ость`) without `chat:` or `date:` was refused before a single
message was checked, because the budget counted every candidate up front, and the refusal did not say what to write.

The questions: how much faster is a search once coverage reads the trigger-kept `chats.message_count` and each chat's
newest message off its time index, and does a word-end pattern answer once candidates are checked in the answer's
order and stop at the page? The answer decided whether the change ships in the gap-fixing pull request.

## Setup

- AMD Ryzen AI 9 HX 470, 30 GB RAM, Linux 7.0, Node 24.19.0 (`node:sqlite`).
- cli-core `origin/main` at 0.641.0 (`647fae685`) as "before", and the branch `fix/search-gaps` as "after", both built
  to `dist/`.
- The synthetic stores of the [infix-chat-text](../infix-chat-text/README.md) measurement: 100,000 and 1,000,000
  messages in 100 chats, Russian and English syllable words, written through the store's own API. Nothing from a real
  account.
- [`bench.mjs`](bench.mjs) times `chatStats` (the old coverage read), `chatsNewest` (the new one, after only) and
  `searchStore` (what `search messages` runs) with limit 50; p50 of 7 warm runs.

```sh
node ../infix-chat-text/bench.mjs gen <cli-core checkout> /var/tmp/infix-chat-text/chat-1000000.db 1000000
node bench.mjs <cli-core checkout>/dist /var/tmp/infix-chat-text/chat-1000000.db after-1m
```

## Results

p50 ms; "50" is a full first page, "refused" the reason and budget.

| Step or query | 100k before | 100k after | 1M before | 1M after |
|---|---|---|---|---|
| coverage read (`chatStats` → `chatsNewest`) | 39.6 | 0.2 | 445.5 | 0.2 |
| `договор*` | 50, 44.5 | 50, 5.8 | 50, 478.0 | 50, 30.7 |
| `договор` | 50, 44.6 | 50, 6.1 | 50, 460.3 | 50, 28.6 |
| `*договор*` | 50, 48.9 | 50, 10.0 | 50, 532.1 | 50, 80.8 |
| `договор AND chat:12` | 50, 43.6 | 50, 5.3 | 50, 484.7 | 50, 24.6 |
| `*ени` (word end, frequent) | refused (body bytes), 65.1 | 50, 93.1 | refused (candidate rows), 620.3 | 50, 647.3 |
| `*ени*` | 50, 93.9 | 50, 55.0 | 50, 951.7 | 50, 511.5 |
| `*ость` (word end) | 50, 59.8 | 50, 19.3 | refused (body bytes), 174.5 | 50, 179.1 |

Raw lines: [`results/`](results/).

## What it showed

- The coverage read was nearly all of an ordinary search: at 1M messages `договор*` went from 478 ms to 31 ms, and
  every query in the table lost the same ~0.45 s. The new read takes 0.2 ms at both sizes, since it reads one row per
  chat.
- A frequent word end now answers with a full first page instead of a refusal, at 1M in about the time the refusal
  used to take (647 ms against 620 ms): the candidate query is the same, and checking stops at the 51st hit.
- A word end that cannot fill a page within the budget is still refused; the refusal now names the pattern and
  suggests `*part*`, more of the word, `chat:` or `date:`.

## What was not measured

- A store with many more chats: the new coverage read does one index probe per chat, so 10,000 chats cost 10,000
  probes. It was not timed here.
- A cold OS cache: the runs are warm, as in the earlier search pages.
- Mail, whose coverage has no per-chat step of this kind.
- Real archives: only synthetic stores.
