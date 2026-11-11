# A pattern that starts with `*`: what reading the whole word list costs

Measured 2026-11-11 for [cli-core #2861](https://github.com/WireCatLabs/cli-core/pull/2861).

## Why we ran it

The owner asked that search match part of a value by default, and that WireCat Desktop's «Составить запрос» write
queries that way. For a person or a chat that is cheap: cli-core reads the names it knows and tries the pattern on
each. For words in the text it is not. The search finds a pattern's words in the index's word list, and a pattern
with a known start (`отч*`) reads only the words with that start. A pattern that starts with `*` (`*отчет*`) has no
known start, so it reads every word in the store.

The question: can `*word*` in the text run inside a search's 2 s time limit on a large store, or should it stay
refused with a hint to write `word*`?

## Setup

- AMD Ryzen AI 9 HX 470, Linux 7.0, Node v24.19.0 (`node:sqlite`), in memory.
- [`vocab.ts`](vocab.ts) builds an FTS5 table shaped like cli-core's `message_words` (contentless,
  `unicode61 remove_diacritics 2`, `prefix='3'`) with N distinct random words of 4-12 letters `а`-`я` and `a`-`z`,
  20 per row, and one word that holds `отчет`. It then lists every word through `fts5vocab` and tests each with
  cli-core's own wildcard automaton (`dist/search/lucene/automaton.js`), as the query compiler does.
- Synthetic words only; no store is opened.
- Run: `node vocab.ts <cli-core checkout with dist/>`, one run, warm.

## Results

| Distinct words | Pattern | Reading the list, ms | Testing each word, ms | Total, ms |
|---:|---|---:|---:|---:|
| 100,000 | `*отчет*` | 66 | 110 | 176 |
| 100,000 | `*ость` | 48 | 136 | 184 |
| 300,000 | `*отчет*` | 146 | 371 | 517 |
| 300,000 | `*ость` | 117 | 351 | 468 |
| 1,000,000 | `*отчет*` | 652 | 1,063 | 1,715 |
| 1,000,000 | `*ость` | 516 | 1,205 | 1,721 |

Two earlier runs, with a different set of letters, gave 1.7-2.0 s at 1,000,000 words.

## What it showed

At a million distinct words, reading and testing the whole list takes 1.7-2.0 s: the whole time limit of a search,
before the search itself runs. cli-core therefore keeps `*word*` in the text under its expansion budget (10,000 words):
it works on a small store and is refused on a large one, and the refusal now says to write `word*`, which also finds
the word's other forms. Names, chats, subjects, mailboxes and tags take patterns anywhere, because their lists are
small.

## Not measured

- A real store's vocabulary size. Distinct words grow more slowly than messages; we did not open the owner's store
  to count them.
- The query that follows: thousands of matched words joined by OR into one FTS5 match would add more time.
- A cold disk cache, and a trigram index, which would make `*word*` fast at the cost of a larger store.
- In this script `отч*` also reads the whole list. cli-core reads only the words between `отч` and its end.
