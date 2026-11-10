# Stemming: do Russian and Spanish word forms get found?

Measured 2026-10-05 to 2026-10-07 for the stem index in the message store (cli-messaging migration 15).

## Why we ran it

Search matched words exactly. A user who typed `квартира` did not find `квартиру`, and `alquilar` did not find
`alquilo`. In Russian and Spanish one word has many forms, so exact search missed most of the messages a person
meant. A first measurement on treebanks showed exact search found about a quarter of the relevant Russian messages.

The question: does an index of Snowball stems find word forms better than the options we already had or could add
with trigrams, and at what cost in disk, build time and query time?

The decision it fed: add a stem index (`message_stems`) to the store as migration 15, with the exact word index
read first and the stems second. The plan set a gate of seven numbers (section S12 of the plan, repeated below).
The gate was run on the product code, not on a prototype. The owner then replaced one target, the query time, with
"at most 2 times today's exact search" (2026-10-06).

## Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0. Node v24.19.0, SQLite 3.53.3 (`node:sqlite`).
- Stemmer: official Snowball 3.1.1 JavaScript, generated from snowballstem/snowball at cd195b5. It has 0 mismatches
  on the official Russian and Spanish test vocabularies.
- Quality data: Universal Dependencies r2.18 treebanks with human lemmas. Russian: SynTagRus (87,337 sentences)
  and GSD (5,030). Spanish: AnCora (17,662). English: EWT, for one side check. One sentence is one message.
  A message is relevant to a query if it holds a token with the same lemma and part of speech.
- Queries: 102 lemmas per language in three bands by document frequency (rare, medium, common), each asked as the
  lemma and as an attested other form, so 204 queries per language. Seed 42.
- Cost data: a synthetic corpus of 100,000 and 1,000,000 messages, with the databases on tmpfs (RAM).
- Rows compared: Exact (strict word match), Prefix (`word*`), T0 (typo correction), T1 (trigram neighbours),
  T2 (trigrams over normalized text), S (Snowball stems), S+T1.
- Licences: SynTagRus is CC BY-NC-SA 4.0 and was used locally. AnCora is CC BY 4.0. GSD and EWT are CC BY-SA 4.0.
  Only totals and a few short words are published here.
- Command, from a cli-core checkout that has been built (`pnpm build`):
  [`bench/stemming/run.sh`](https://github.com/WireCatLabs/cli-messaging/blob/a6486e7b3fd66628b95d2243be182b1a34297df8/bench/stemming/run.sh).
  It downloads the pinned treebanks, runs everything and rewrites
  [`results.md`](https://github.com/WireCatLabs/cli-messaging/blob/a6486e7b3fd66628b95d2243be182b1a34297df8/bench/stemming/results.md)
  there, which holds every row and band. The harness stays in cli-core because it imports cli-core's unpublished
  build (`dist/store/sqlite/stems.js`).

## Results

Recall, precision, F1 and gain. Gain is the number of extra relevant messages found per query compared with Exact.
Precision is the mean over queries that returned anything.

**Russian, SynTagRus**

| row | recall | precision | F1 | gain |
|---|---|---|---|---|
| Exact | 0.260 | 0.992 | 0.411 | 0.0 |
| Prefix | 0.916 | 0.739 | 0.818 | 43.9 |
| T0 | 0.311 | 0.955 | 0.469 | 0.3 |
| T1 | 0.686 | 0.518 | 0.590 | 36.1 |
| T2 | 0.315 | 0.883 | 0.465 | 2.9 |
| **S** | **0.881** | **0.839** | **0.860** | 37.8 |
| S+T1 | 0.913 | 0.522 | 0.664 | 46.9 |

Russian GSD agrees: Exact 0.245 / 0.993, T1 0.771 / 0.654, S 0.862 / 0.874 (F1 0.868).

**Spanish, AnCora**

| row | recall | precision | F1 | gain |
|---|---|---|---|---|
| Exact | 0.391 | 0.870 | 0.540 | 0.0 |
| Prefix | 0.984 | 0.620 | 0.761 | 30.5 |
| T0 | 0.408 | 0.867 | 0.555 | 0.0 |
| T1 | 0.854 | 0.440 | 0.581 | 23.2 |
| T2 | 0.563 | 0.799 | 0.661 | 8.4 |
| **S** | **0.956** | **0.693** | **0.804** | 25.8 |
| S+T1 | 0.980 | 0.397 | 0.565 | 30.5 |

Spanish Exact precision is only 0.870 because many words are written the same with a different part of speech
(`parte` as noun and as verb), and the ground truth counts those as wrong for every row.

**Cost, synthetic corpus** (build time, disk, query time at 1M messages for a word in about 1% of messages)

| index | build 1M | disk 1M | query p50 / p95 ms |
|---|---|---|---|
| Exact (the word index of the time) | 40 s | 170 MB | 5.3 / 17.8 |
| S | 142 s (93 s of it Snowball) | 97 MB | 5.3 / 18.9 |
| T1 vocabulary | 26 s | 203 MB | 14.0 / 47.0 |
| T2 | 66 s | 538 MB | 10.7 / 24.2 |

**The gate through the store** (migration 15, `fillStems`, the write drain of `saveMessages`), at 1M messages:

| check | target | measured | verdict |
|---|---|---|---|
| stem fill | 75 s or less | 23.7 s | pass |
| of which Snowball | 25 s or less | 8.8 s | pass |
| disk of `message_stems` | 140 MB or less | 101 MB | pass |
| ingest with the drain on, median of 5 rounds | +25 % or less | +21 % | pass |
| exact hits the stems alone miss | 0 | 0 of 136,181 | pass |
| query p95, first target | 30 ms or less | 47.8 ms | miss |
| query p95 through the compiler, stemmed vs exact on the same words | 2 times exact or less (new target) | 39.5 ms vs 51.3 ms | pass |

The first query target sat just above the time of today's exact query (29.6 ms p95), so a search that reads more
could not meet it. Through the compiler the stemmed query ran in 0.77 times the exact time, because exact forms
fill the first page and the stems are read only when they run out. Quality through the store matched the
prototype within 0.002.

## What it showed

- **S has the best F1 in both languages.** In Russian recall goes from 0.26 to 0.88 and precision stays at 0.84.
  T1 reaches only 0.69 recall with precision 0.52. Today's search with `word*` added reaches 0.315 recall in
  Russian and 0.563 in Spanish.
- **T0 does not help word forms.** A known word is never corrected, so on attested forms its gain is 0.0.
  T1 finds forms, but it also pulls in look-alike words. S+T1 gains a few points of recall and loses the
  precision, so the two should not be joined. T1 stays for typos only.
- **Stem before folding.** If the text is folded first (й to и, ё to е) and then stemmed, Russian recall falls from
  0.881 to 0.785 on SynTagRus. Spanish barely changes (0.956 to 0.945). So a separate stem index is the right
  shape. Query-time expansion over a vocabulary that holds only folded words could not do it.
- **Choosing the stemmer by script is acceptable.** On English the Spanish stemmer for Latin script still beats
  Exact on F1 (0.711 against 0.596). An English stemmer would reach 0.794, but that needs language detection.
- **The library matters.** Official Snowball 3.1.1 has 0 mismatches on the official vocabularies. The
  `snowball-stemmers` package (0.6.0) gets every word with ё wrong (112 mismatches), and `natural`'s Russian
  stemmer gets 569 wrong.
- **Cost is real but bounded.** S adds 97 MB at 1M messages. The prototype took 142 s to build. In the product the
  fill took 23.7 s, with a stem cache.
- **The stems set must be computed once per query.** Joined row by row, the same query took 420 ms p95 at 100k
  messages. Computed once, 5 ms.

## What was not measured

- Real messages. Everything here is treebank sentences and synthetic text. Treebank sentences are longer and
  cleaner than chat messages, and have no typos or mixed languages.
- Languages other than Russian and Spanish. English was a side check only.
- Some false merges are a difference in how the treebank writes lemmas (`главное` and `главный`), not an error.
  Precision of S is a lower bound.
- Ranking quality inside the result list. Only recall and precision of the returned set were scored.
- Other machines, and disks other than tmpfs.
