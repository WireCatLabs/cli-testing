# Notes found by any part of a word, in any letter case

Measured 2026-10-30 for [cli-core#2186](https://github.com/WireCatLabs/cli-core/pull/2186) (store version 39).

## Why we ran it

The owner wants notes found by any part of a word, without caring about letter case. Four reads did this with
`instr(lower(body), lower(?))`: `notes` with a search, documents in the same list, knowledge annotations, and
contacts `--notes`. SQLite's `lower()` folds only Latin letters, so `тартус` does not find `ТАРТУССКИЙ`. Every
search also reads every row.

The questions were: how much does today's search miss, how slow is it as notes grow, and which index fixes both
at an acceptable cost in disk and write time? The answer fed the owner's choice of option A2 on 2026-10-30.

## Setup

- AMD Ryzen AI 9 HX 470, 30 GB RAM, Linux 7.0. Node 24.19.0 (`node:sqlite`, SQLite 3.53.3) and Bun 1.3.14
  (`bun:sqlite`, SQLite 3.53.0).
- Synthetic text only, made by [`gen.mjs`](gen.mjs): Russian and English words built from syllables, 78% Cyrillic,
  sentence case, some words in capitals. Needles are planted at fixed intervals in three spellings each
  (`Тартусский`, `ТАРТУССКИЙ`, `тартусском`; `Kubernetes`, `KUBERNETES`; `договор аренды` in three cases; `Ёлкин`
  beside `Елкин`).
- Scale 1: 20,000 notes of 2 KB and 2,000 documents of 50 KB (42 MB and 103 MB of text). Scale 5: five times
  that.
- Each query returns the newest 51 live rows of notes and of documents, as the list does. p50 of 7 warm runs.

The options:

| Option | What it is |
|---|---|
| base | today: `instr(lower(body), lower(?))` |
| B | a folded copy of the body in a column, `instr(body_folded, fold(?))` |
| A | FTS5 trigram index over the body, external content, kept by triggers |
| **A2** | contentless FTS5 trigram index over the JS-normalized text (`normalize()`, the text the word index gets), filled from JS; the query normalized the same way and quoted as one phrase |
| C | contentless FTS5 word index with 3-letter prefixes, `"query"*` |

Commands, from this folder:

```sh
node correctness.mjs             # which option finds which spelling
./run.sh 1 node bun              # builds each option on scale 1, then queries and writes on Node and Bun
./run.sh 5 node bun
node summarize.mjs runs/x1/results.jsonl
node upgrade.mjs <cli-core checkout with dist/> <empty scratch dir> 1   # the shipped code, see below
```

`run.sh` writes about 2 GB per option at scale 5 and deletes each database after its run.

## Results

### What each option finds

From [`correctness.mjs`](correctness.mjs). "A2" behaves as "A MATCH" on text and query that were both folded in JS
first (the "A_d MATCH fold(q)" column, without `remove_diacritics`).

| Text | Query | base | B | A | A LIKE | C |
|---|---|---|---|---|---|---|
| Встреча в ТАРТУСЕ завтра | тартус | no | yes | yes | no | yes |
| Переподстроение системы | ПОДСТРО | no | yes | yes | no | no |
| KUBERNETES cluster | bernet | yes | yes | yes | yes | no |
| Елкин Петр | ёлкин | no | yes | no | no | no |
| ΣΟΦΟΣ άνθρωπος | σοφος | no | yes | yes | no | yes |
| Ян | ян | no | yes | no | no | yes |

- The trigram tokenizer folds case in every script; `LIKE` on the same table does not.
- `remove_diacritics` does not turn `ё` into `е`. Folding in JS first does.
- A trigram index returns nothing, with no error, for a query of one or two characters.
- A word index (C) does not find a part inside a word (`bernet`, `подстро`).

### Speed

p50 / p95 over all queries, ms, Node:

| Option | Scale 1 | Scale 5 |
|---|---|---|
| base | 299 / 382 | 1,456 / 4,192 |
| B | 295 / 395 | 1,173 / 1,813 |
| A | 0.14 / 16 | 0.28 / 200 |
| **A2** | 0.22 / 16 | 0.29 / 196 |
| C | 0.10 / 27 | 0.17 / 215 |

Per query at scale 5, p50 ms (Node), and all the notes / documents that match:

| Query | base | A2 | Found by base | Found by A2 |
|---|---|---|---|---|
| `тартус` | 3,258 | 0.21 | 83 / 8 | 250 / 25 |
| `ТАРТУСС` | 1,762 | 0.24 | 84 / 9 | 250 / 25 |
| `артусск` (inside a word) | 1,769 | 0.23 | 166 / 16 | 250 / 25 |
| `BERNET` | 918 | 0.30 | 101 / 11 | 101 / 11 |
| `договор аренды` | 3,480 | 2.24 | 0 / 0 | 667 / 67 |
| `ёлкин` (`Елкин` in text) | 1,746 | 0.48 | 0 / 0 | 400 / 40 |
| `про` (in almost every note) | 1.2 | 180 | 99,602 / 10,000 | 99,690 / 10,000 |
| `ельцу` (in ~80% of notes) | 1.3 | 196 | 78,229 / 10,000 | 81,996 / 10,000 |
| `щюфыжд` (absent) | 1,768 | 0.02 | 0 / 0 | 0 / 0 |

### Disk and writes

| Option | Database at scale 1 | Build at scale 1 (notes + documents) | Write per document (insert / update), ms |
|---|---|---|---|
| base | 194 MB | — | 0.24 / 0.09 |
| B | 387 MB | 3.0 s | 1.15 / 1.25 |
| A | 450 MB | 6.2 s | 3.9 / 5.0 |
| **A2** | 446 MB | 9.4 s | 4.5 / 4.3 |
| C | 274 MB | 8.8 s | 44 / 25 |

### The shipped code: cli-core store version 39

[`upgrade.mjs`](upgrade.mjs) builds a store at scale 1 through cli-core's own `openStore`, `addNote` and
`saveFileNote`, drains its index, then times `notes({ search })` against the old SQL on the same rows. It then
drops version 39 to stand for a store a 0.485.0 build left, opens it again with the new build, and times the
upgrade. Raw lines: [`results/upgrade-x1.jsonl`](results/upgrade-x1.jsonl).

| Step | Time |
|---|---|
| The version 39 migration (`openStore`) | 5 ms |
| Filling the trigrams of the 22,000 rows stored before it (`drainNoteIndex`) | 9.7 s |
| The same with every row queued again instead (first try, [`results/upgrade-x1-requeue.jsonl`](results/upgrade-x1-requeue.jsonl)) | 71 s |

The store grew from 367 MB to 604 MB (+237 MB, +65%).

`notes({ search, limit: 50 })`, p50 ms of 5 warm runs, and rows found:

| Query | Before (`instr(lower)`) | Version 39 | Version 39, not filled yet |
|---|---|---|---|
| `тартус` | 313 (19) | 1.6 (50) | 318 (19) |
| `ТАРТУСС` | 375 (19) | 1.6 (50) | 377 (19) |
| `артусск` | 374 (36) | 1.6 (50) | 378 (36) |
| `BERNET` | 220 (24) | 1.0 (24) | 223 (24) |
| `договор аренды` | 369 (0) | 4.4 (50) | 372 (0) |
| `ёлкин` | 310 (0) | 2.2 (50) | 310 (0) |
| `про` | 90 (102) | 102 (50) | 180 (50) |
| `ельцу` | 116 (102) | 100 (50) | 206 (50) |
| `щюфыжд` | 324 (0) | 0.16 (0) | 308 (0) |

"Before" counts up to 51 notes plus 51 documents; version 39 counts the list's page of 50.

## What it showed

- Today's search finds a third of the Cyrillic matches in mixed case, and none for `ё`/`е` or a phrase written in
  another case. It reads every row: 0.3 s at scale 1, 1.5–4 s at scale 5, and worst when nothing matches.
- A folded column (B) fixes what is found but not the speed.
- Every index answers a rare word in under 1 ms at both scales. A word index (C) is the smallest but cannot find a
  part inside a word, which is what the owner asked for.
- A2 finds what B finds, at A's speed, with the same text the word index already gets, so `ё`/`е` and accents
  match the way message search does. It costs about +65% on the store's size and a few ms per document write.
- A word in nearly every row gets slower (1 ms to 100–200 ms): the index lists every row before the newest 50 are
  chosen. Still well under a second.
- Queueing every note again to fill the new index would also redo their words, stems and chunks: 71 s. A fill of
  the trigrams alone took 9.7 s, so version 39 fills them alone, from the notes drain, and searches the rows not
  yet filled as before.
- One- and two-character queries are refused up front ("search needs at least three characters"), as message
  search is, rather than returning nothing.

## What was not measured

- The owner's real notes. Sizes here are synthetic; the real store's notes and documents were not opened.
- Bun for the shipped code. Only the raw options ran on Bun; the raw results per runtime are in `results/`.
- Cold cache: every timing is warm.
- A store written by an older CLI after the upgrade: such a build does not write trigrams, so its new or edited
  notes are not found by part of a word until `store rebuild`.
- Scale 5 through cli-core's own API (only the raw options ran at scale 5).
- Concurrent writers during the fill.
