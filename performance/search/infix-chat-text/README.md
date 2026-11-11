# `*word*` in chat messages through the trigram index, end to end

Measured 2026-11-11 for the cli-core pull request that answers `*word*` in chat-message text from `messages_fts`.

## Why we ran it

The owner wants to find a part inside a word in chat messages (`*договор*` finds «переговоры» and «ДОГОВОРЫ»). Until
cli-core 0.640.0, such a pattern read the whole word list of the index, and a store with more than 10,000 distinct
words refused it (`query.too-large`, [leading-wildcard](../leading-wildcard/README.md)). Every store already keeps a
trigram index of message text, and a bare index query answers in 0.3–35 ms at 1M messages
([substring-messages](https://github.com/WireCatLabs/cli-testing/pull/353), closed, on its branch).

The question here: once cli-core's own search uses that index, how long does the whole search take, with its joins,
order by date, filters and Boolean logic, and which queries does it still refuse?

## Setup

- AMD Ryzen AI 9 HX 470, 30 GB RAM, Linux 7.0, Node 24.19.0 (`node:sqlite`).
- cli-core `origin/main` at 0.640.0 (`cbe080a8f`) as "before", and the same tree with the change as "after", both
  built to `dist/`.
- Synthetic text from [`gen.mjs`](../substring-notes/gen.mjs) of the notes measurement (Russian and English syllable
  words, sentence case, some capitals, needles planted at fixed intervals). 40–240 bytes per message, 100 chats, one
  message a minute from 2025-01-01. Stores of 100,000 and 1,000,000 messages written through the store's own API
  (`saveMessages`, then `fillSearchIndex`). The 1M store is 1.47 GB.
- [`bench.mjs`](bench.mjs) times `searchStore` (what `search messages` runs), limit 50, p50 of 7 warm runs.

```sh
node bench.mjs gen   <cli-core checkout> /var/tmp/infix-chat-text/chat-1000000.db 1000000
node bench.mjs query <cli-core checkout> /var/tmp/infix-chat-text/chat-1000000.db after-1m
```

## Results

p50 ms of the whole search; "50" is a full first page, "refused" the reason and budget.

| Query | 100k before | 100k after | 1M before | 1M after |
|---|---|---|---|---|
| `*тартус*` | refused, 38 | 50 hits, 100 | refused, 147 | 50 hits, 628 |
| `*артусск*` (inside a word) | refused, 39 | 50, 103 | refused, 138 | 50, 522 |
| `*ТАРТУСС*` | refused, 36 | 50, 105 | refused, 142 | 50, 652 |
| `*bernet*` | refused, 39 | 50, 111 | refused, 146 | 50, 514 |
| `*ёлкин*` (finds Ёлкин and Елкин) | refused, 40 | 50, 109 | refused, 144 | 50, 521 |
| `*договор*` | refused, 44 | 50, 112 | refused, 144 | 50, 557 |
| `*ени*` (in half the messages) | refused, 44 | 50, 206 | refused, 157 | 50, 989 |
| `*про*` | refused, 42 | 50, 211 | refused, 146 | 50, 922 |
| `*щюфыжд*` (absent) | refused, 39 | 0, 102 | refused, 145 | 0, 557 |
| `*договор* AND chat:12` | refused, 39 | 50, 81 | refused, 146 | 50, 502 |
| `*ени* AND chat:12` | refused, 42 | 50, 72 | refused, 144 | 50, 552 |
| `*ени* AND date:[2025-02-01 TO 2025-02-07]` | refused, 42 | 50, 137 | refused, 144 | 50, 1,202 |
| `NOT *договор* AND chat:12` | refused, 39 | 50, 55 | refused, 143 | 50, 482 |
| `*арендой* OR *ёлкин*` | refused, 42 | 50, 70 | refused, 143 | 50, 651 |
| `*ость` (end of a word) | refused, 39 | 50, 106 | refused, 142 | refused (body bytes), 170 |
| `*ени` (end of a word, frequent) | refused, 38 | refused (body bytes), 104 | refused, 142 | refused (candidate rows), 663 |
| `*ени AND chat:12` | refused, 40 | 50, 76 | refused, 142 | 50, 522 |
| `*дог?вор*` | refused, 36 | 50, 76 | refused, 139 | 50, 541 |
| `договор*` (word start, unchanged path) | 50, 100 | 50, 84 | 50, 503 | 50, 519 |

Raw lines: [`results/`](results/).

## What it showed

- **`*part*` is no longer refused**, alone or with `AND`, `OR`, `NOT`, `chat:` and `date:`, and finds the part in
  any case, with ё and е as one letter. On 1M messages it takes 0.5–1.0 s, 1.2 s with a date range over a fragment
  found in half the messages. All of it fits the 2 s limit of a search.
- **About 0.5 s of that is not the pattern.** At 1M, `договор*`, which never touched the word list, also takes
  0.5 s, and so does a part found nowhere. A CPU profile puts 0.48 s of each search in the coverage step, which
  counts every message of every chat (`chatStats`). The trigram lookup and the sort add 0–0.5 s on top of it.
- **The end of a word (`*ость`, `*ени`) is checked word by word**, after the index finds where the part occurs. When
  the part is in too many messages, that check refuses (`query.too-large`, candidate rows or body bytes), as before
  but now only for frequent parts; `chat:` or `date:` makes it pass (`*ени AND chat:12`, 0.5 s at 1M).
- "Before" refused every pattern without a word start in 40–150 ms, because both stores have more than 10,000
  distinct words.

## What was not measured

- A real store, or the owner's. The synthetic vocabulary has about 38,000 distinct words; a real one is larger, which
  changes nothing for the trigram path.
- Mail, transcripts and file text: they have no trigram index and keep the word list, unchanged by this pull request.
- Cold cache and Bun.
- The coverage step on its own beyond the profile above.
