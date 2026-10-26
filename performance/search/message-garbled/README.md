# Message search: voice-note transcripts in any word form, and garbled spellings

## Why we ran it

Message search (tg, max, wa) found a word in a voice note's transcript only in the exact form typed. Meeting search
already widens a word to the spellings speech recognition garbles ([meeting-garbled](../meeting-garbled/README.md)).
The owner chose to bring this to messages with a separate transcript index and a store migration, rather than
reading word forms at query time. The questions: does the migration apply cleanly to a real store; how many more
voice notes do word forms and widening find; how much of the widening is noise; and what does a search cost.
The answers fed [cli-core#1761](https://github.com/WireCatLabs/cli-core/pull/1761) (store version 29).

## Setup

- AMD Ryzen AI 9 HX 470, Node 24.19.0, `node:sqlite`, cli-core at the PR's branch, built.
- A copy of the owner's store (`sqlite3 .backup`, then a second copy for the run; the real file was only read),
  at store version 28. Totals only here; the queries, words and per-query rows are private.
- 47 voice-note transcripts, all Telegram, 1,163 distinct words of five letters or more. 45 of the 47 were written by
  an agent rather than by speech recognition; they count as transcripts since
  [cli-core#1755](https://github.com/WireCatLabs/cli-core/pull/1755).
- 80 queries, chosen from the transcripts' own words as the meeting measurement chose them: the 40 most frequent
  words of five letters or more (not number words), and 40 picked evenly from the rest.
- `node measure.mjs <cli-core checkout> <store copy> <private rows.jsonl>` — opens the copy through `openStore`
  (which migrates it), runs one search to fill the transcript index, then each query as a bare word three times
  (median) and once with `--exact`, through `searchStore` over every messenger account, 1,000 hits at most.

## Results

| | |
|---|---|
| open and migrate to version 29 | 16 ms |
| first search, filling the index of 47 transcripts and loading the dictionary | 259 ms |
| rows in `transcript_stems` after it | 47 of 47 |
| search, median / 95th percentile | 60 ms / 154 ms |
| `--discover` search, median of 5 | 261 ms |

Voice notes found, over the 73 queries whose answer stayed under the 1,000-hit page:

| | voice notes found |
|---|---|
| typed form only (`--exact`) | 423 |
| any form of the word | 504 (+81, +19 %) |
| and garbled spellings | 509 (+5, in 3 queries) |

Read by hand, the 5 garbled hits: 3 were the same word (another form of a verb the stemmer cut differently, and a
cut-off swear word); 2 were a different, real word. Both of those came through the rule for a stem one side extends,
which meeting search uses for names cut differently («циана», «цианом») and which skips the dictionary check.

The other 7 queries are frequent words that filled the 1,000-hit page with message text, so word forms pushed voice
notes off it; their counts do not compare.

## What it showed

- The migration and the first fill are cheap at this size, and a search costs about what a meeting search costs.
- Word forms are what pays: a fifth more voice notes found. Garbled spellings are rare on these 47 transcripts,
  and 2 of 5 widened hits are real other words, from the stem-extension rule rather than the one-edit rule.

## What was not measured

- 47 transcripts are too few to give a noise rate. The meeting measurement (119 meetings) is the better guide.
- No speech-recognition garbling was planted; the queries are the transcripts' own words, so a widened hit is a
  neighbour of a word that is already there.
- Search time before this change, on the same copy, was not measured.
