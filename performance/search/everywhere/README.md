# Search everywhere: what a bare word costs

Measured 2026-10-13 for [cli-messaging #1025](https://github.com/WireCatLabs/cli-messaging/pull/1025).

## Why we ran it

On 2026-10-12 the owner tried tg, memo and drive on a real project: one Telegram chat with a contractor, its 87
files, and the project's Google Drive folder. Two searches failed in a way a user cannot work around:

- a word said only in a voice note was not found, though its transcript was stored;
- a word that was only in a file's name or text was not found by a plain search. It needed `content:` or
  `filename:`, and nothing told the user so.

The owner decided (2026-10-13) that a plain search word looks in four places: message text, voice transcripts,
file names and file text. `text:`, `transcript:`, `content:` and `filename:` narrow it to one. Hits with the word
in the text rank first, then transcripts, file names, file text.

That puts every search on more tables. On the owner's store (4,436 messages, 2,430 files) the first build went
from about 7 ms to 18 ms per search. This test asks whether the cost stays small as a store grows.

## Setup

- AMD Ryzen AI 9 HX 470, Linux 7.0, Node v24.19.0 (`node:sqlite`). Store in the OS temp folder.
- Synthetic store, made by [`everywhere.ts`](everywhere.ts): 100,000 messages in one chat, 50,000 of them with a
  file. Every 20th file name and file text holds `heron`; one spreadsheet of 75k characters repeats it on every
  row. No real message or account is used.
- 30 rounds per query, limit 20, Lucene query language, warm.
- Run on each build, from this folder: `node everywhere.ts <cli-messaging checkout with dist/> 100000 50000`.

## Results

p50 / p95 in ms.

| Query | before #1025 (`db178517`) | #1025, names read in JS (`b7429317`) | #1025, name index (`7272ae8f`) |
|---|---|---|---|
| `heron` | 120 / 123 | 388 / 421 | 137 / 164 |
| `ledger` | 120 / 128 | 402 / 428 | 153 / 166 |
| `heron AND river` | 111 / 120 | 401 / 418 | 154 / 181 |
| `invoice OR census` | 168 / 171 | 480 / 553 | 210 / 233 |
| `квартира` | 119 / 145 | 390 / 426 | 141 / 145 |
| `text:heron` | 118 / 136 | 121 / 130 | 127 / 141 |
| `zzznothing` (no match) | 73 / 75 | 339 / 389 | 86 / 104 |

## What it showed

- The first build read every stored file name into JavaScript on each search. That cost a fixed ~270 ms at this
  size, even when nothing matched.
- An FTS5 word index of file names (`attachment_name_words`, store version 5, owner's choice) removes it. A bare
  word now costs 15–40 ms more than message text alone. That is probably the lookups in file text and
  transcripts; they were not measured apart.
- The index folds `й` and `ё` the way the store's own normalizer does, because SQLite's `unicode61` tokenizer
  folds only Latin accents. Without that, a Russian file name with `й` or `ё` would not be found.
- `text:` does not touch the other places and stays where it was.

## Not measured

- Word forms in files and transcripts: they have no stems yet, so other forms of a word are not found there.
- The owner's real store after the change: the field-test re-check runs after the release.
