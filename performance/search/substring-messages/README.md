# `*word*` in message and mail text through a trigram index

Measured 2026-11-11 for the cli-core pull request that makes `*word*` fast in message text.

## Why we ran it

The owner wants every free-text value in a written query matched by part (`*договор*`). cli-core answers `*word*`
by reading the whole word list of the index and testing every word, which took 1.7–2.0 s at a million distinct
words ([leading-wildcard](../leading-wildcard/README.md)), so it refuses the pattern above 10,000 words and Desktop
falls back to `word*`.

The questions:

- Is a trigram index over the text fast enough to answer `*word*` instead?
- What does it add to the store, and how long does a migration that builds it take on a large store?

The coordinator's limits for a new index: no more than about 30% store growth and about 1 minute of migration on 1M
messages. Above them the work stops and the numbers go to the owner.

## Setup

- AMD Ryzen AI 9 HX 470, 30 GB RAM, Linux 7.0, Node 24.19.0 (`node:sqlite`, SQLite 3.53.3).
- Synthetic text from [`gen.mjs`](../substring-notes/gen.mjs) of the notes measurement (Russian and English
  syllable words, sentence case, some capitals, needles planted at fixed intervals). 38,034 distinct words.
- Chat messages: 40–240 bytes each, 100,000 and 1,000,000 rows. Mail: 1–6 KB each, 100,000 rows.
- [`bench.mjs`](bench.mjs) builds a table of rows and the store's word index (`unicode61`, contentless, prefix 3,
  over the folded text). It then builds the trigram index the store already keeps for message text
  (`messages_fts`: external content, `tokenize='trigram'`) with `rebuild`, as a migration over stored rows would.
- Queries: the newest 51 rows matching `"word"` in the trigram index, against today's path (list the word index's
  vocabulary, keep the words that contain the query, match them in the word index). p50 of 7 warm runs.

```sh
node bench.mjs 100000 /var/tmp/substring-messages
node bench.mjs 1000000 /var/tmp/substring-messages
node bench.mjs 100000 /var/tmp/substring-messages mail
```

## Results

### Size and build time

| Rows | Text | Rows + word index | Trigram index added | Growth | Trigram build |
|---|---|---|---|---|---|
| 100k chat messages | 20 MB | 38 MB | 43 MB | +114% | 1.1 s |
| 1M chat messages | 202 MB | 353 MB | 416 MB | +118% | 15.7 s |
| 100k emails | 356 MB | 612 MB | 693 MB | +113% | 41.6 s |

The growth is against the rows and their word index only. A real store also holds stems, vectors, people and
chats, so its share is smaller, but the index is about twice the size of the text it covers.

### Query time, p50 ms

| Query | Rows that match (1M chat) | Trigram, 100k chat | Trigram, 1M chat | Word list, 1M chat | Trigram, 100k mail | Word list, 100k mail |
|---|---|---|---|---|---|---|
| `тартус` | 2,500 | 0.08 | 0.33 | 330 | 0.15 | 647 |
| `артусск` (inside a word) | 2,500 | 0.09 | 0.42 | 316 | 0.20 | 632 |
| `ТАРТУСС` | 2,500 | 0.09 | 0.41 | 311 | 0.11 | 605 |
| `bernet` | 1,004 | 0.09 | 0.43 | 314 | 0.27 | 601 |
| `ёлкин` | 2,000 | 0.10 | 0.53 | 320 | 0.27 | 603 |
| `договор` | 6,667 | 0.46 | 3.68 | 313 | 1.44 | 614 |
| `ени` (in half the rows) | 471,096 | 3.2 | 34.6 | 346 | 20.2 | 916 |
| `про` | 411,042 | 2.8 | 28.2 | 338 | 8.1 | 763 |
| `щюфыжд` (absent) | 0 | 0.01 | 0.01 | 304 | 0.03 | 644 |

Raw lines: [`results/`](results/).

## What it showed

- Chat messages already have the index. Every store has kept `messages_fts` since 2026-09-29, so `*word*` in
  message text costs no migration and no store growth. It answers in under 5 ms for any word up to 1M messages,
  and about 35 ms for a fragment found in half of them. The word-list path takes 0.3 s at 1M messages even with
  only 38k distinct words, because listing the vocabulary reads every doclist.
- The trigram index finds a part inside a word and folds case in every script. It does not fold `ё` into `е`:
  `ёлкин` finds only `Ёлкин` (2,000), while the word index finds both spellings. A query must ask for both forms.
  A fragment of one or two characters finds nothing.
- Mail has no trigram index. One would add about twice the mail text (+113% over the mail rows and their
  words) and take 41.6 s per 100k emails, about 7 minutes for 1M. Both are over the limits, so mail, transcripts
  and file text keep the word-list path, its 10,000-word budget and the `word*` fallback.

## What was not measured

- A real store, or the owner's. All text is synthetic, with 38k distinct words. A real vocabulary is larger, which
  makes the word-list path slower ([leading-wildcard](../leading-wildcard/README.md)) and leaves the trigram path
  as it is.
- Transcripts and file text: no index was built. Their text is long like mail, so the cost would be similar.
- Cold cache and Bun.
- Writes: chat messages already pay for the trigram index on every insert.
