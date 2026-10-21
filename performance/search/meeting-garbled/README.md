# Meeting search: widening garbled words, and what reading the word list costs

## Why we ran it

Most of the owner's meetings are in Russian, and speech recognition garbles words: one transcript holds
«реелтора», «Рилторов» and «Дриелтора» for one spoken «риелтора», and a search for «риелтор» found none of those
lines. The owner ruled that meeting search always widens a query word to such spellings and shows which stored
word each widened hit matched. Widening needs the list of stored words. The question: read that list at query
time from the index that already exists (`meeting_words_vocab`, no migration), or keep a trigram table of the
words (a migration, and upkeep on every write)? The answer chose the first for cli-core
[`feat/meeting-garbled-words`](https://github.com/WireCatLabs/cli-core/tree/feat/meeting-garbled-words).

## Setup

- AMD Ryzen AI 9 HX 470, Node 24.19.0, `node:sqlite`.
- Synthetic text only: random Cyrillic syllables built into 6,000 stems with 19 endings, a skewed choice of
  stem, 2 % of words with one letter replaced. 120 meetings × 600 cues × 15 words, about 1.08 million words.
  The planted words «риелтор», «реелтора», «рилторов», «дриелтора», «циана», «цианом» go into every 97th cue.
- `node vocabulary.mjs` — a bare `meeting_words`-shaped FTS5 table: reading the word list, and the same lookup
  through a trigram table. Twenty runs each, the mean.
- `node bench.mjs <cli-core checkout, built>` — the real store through `openStore`, `saveMeeting`,
  `indexSearch` and `searchHits` of cli-core `feat/meeting-garbled-words`. Seven runs per query, the median.

## Results

Reading the word list from `meeting_words_vocab`, 125,964 distinct words:

| | time per query word |
|---|---|
| read the whole list | 82 ms |
| read it and compute the edit distance to every word | 106–128 ms |
| trigram table lookup, then the edit distance | 0.3–0.8 ms |
| building the trigram table once | 1,229 ms |

The trigram lookup keeps the 200 words sharing the most trigrams. For «циана» that kept 33 of the 58 words within
the distance a full read found.

The store with widening, 120 meetings, 72,000 cues (indexing them took 11–13 s, as before this change):

| query | median | hits | of them widened |
|---|---|---|---|
| риелтор | 159 ms | 586 | 445 |
| циана | 127 ms | 254 | 115 |
| exact:риелтор | 6 ms | 141 | 0 |
| проверка (not in the text) | 138 ms | 0 | 0 |
| риелтор квартира | 163 ms | 0 | 0 |

The first version stemmed every stored word in the query process and took 610–770 ms a query. Comparing the
query stem with the beginning of each stored word first, and stemming only the near ones, brought it to the times
above. The first version also allowed two edits on a stem of seven letters or more; on the synthetic text
«проверка» then widened to «провела» and similar words in 677 cues, so the rule became one edit.

## What it showed

- Reading the word list at query time costs about 0.15 s a query at this size, and needs no migration, no
  re-fill and no upkeep. The trigram table is about 200 times faster but needs all three, and its candidate cap
  loses words.
- The time grows with the number of stored words, not with the hits: a 1,000-meeting store would read about
  eight times as many words, so expect roughly a second. A trigram table is the way out if that becomes real.

## What was not measured

- The owner's store. The synthetic syllable text has more near neighbours than Russian speech, so the widened
  counts above say little about noise in real transcripts; that check is the acceptance run on the owner's store.
- Memory use, and stores above 120 meetings.
