# Meeting search: widening garbled words, and what reading the word list costs

## Why we ran it

Most of the owner's meetings are in Russian, and speech recognition garbles words: one transcript holds
«реелтора», «Рилторов» and «Дриелтора» for one spoken «риелтора», and a search for «риелтор» found none of those
lines. The owner ruled that meeting search always widens a query word to such spellings and shows which stored
word each widened hit matched. Widening needs the list of stored words. The question: read that list at query
time from the index that already exists (`meeting_words_vocab`, no migration), or keep a trigram table of the
words (a migration, and upkeep on every write)? The answer chose the first for cli-core
[cli-core#1703](https://github.com/WireCatLabs/cli-core/pull/1703).

## Setup

- AMD Ryzen AI 9 HX 470, Node 24.19.0, `node:sqlite`.
- Synthetic text only: random Cyrillic syllables built into 6,000 stems with 19 endings, a skewed choice of
  stem, 2 % of words with one letter replaced. 120 meetings × 600 cues × 15 words, about 1.08 million words.
  The planted words «риелтор», «реелтора», «рилторов», «дриелтора», «циана», «цианом» go into every 97th cue.
- `node vocabulary.mjs` — a bare `meeting_words`-shaped FTS5 table: reading the word list, and the same lookup
  through a trigram table. Twenty runs each, the mean.
- `node bench.mjs <cli-core checkout, built>` — the real store through `openStore`, `saveMeeting`,
  `indexSearch` and `searchHits` of [cli-core#1703](https://github.com/WireCatLabs/cli-core/pull/1703). Seven runs per query, the median.

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

## The owner's store: noise, and a dictionary as the filter

The synthetic text cannot say how many widened hits are wrong, so the rules ran on a read-only backup copy of the
owner's store (`sqlite3 .backup`; the real file was only read). Totals only; the queries and words are private.

- 119 meetings, 72,225 different words. 130 queries: 10 from the task, the 40 most frequent words of five
  letters or more, and 80 picked evenly from the rest.
- First rules (one stem edit, a stem one side extends, ztx's "a stored word that begins the query word"):
  10,271 widened word matches. 84 % were words found in more than 10 passages, that is real other words one
  stem edit away; 15 % came from the ztx rule. Real garbled spellings were found in one to three passages each.
- Filter: widen a stem edit only to a word the Hunspell Russian dictionary (`dictionary-ru` 3.0.0) does not know;
  drop the ztx rule. 1,157 widened word matches (−89 %), every target spelling of the task still found.
  Median 110 ms a query, 95th percentile 165 ms.
- Loading the dictionary through nspell takes 1.4 s and 172 MB, because it expands 146,269 entries into 1.44
  million forms. Checking a word as Hunspell does, an ending at a time, loads in 141–176 ms and agreed with nspell
  on all 64,858 Cyrillic words of the store; the 676 words it knows and nspell does not are names and
  abbreviations the dictionary writes in capitals.
- A dictionary does not separate «устав» from «устал»: Snowball, Hunspell, pymorphy3 and Az.js all read «устав»
  also as a form of «устать». Ranking the typed form first does.

## Parity with ztx, the trial import, and proximity on the owner's store

Same read-only copy, totals only. The scripts read private data and stay outside this repository; what they do is
described here.

- **Trial import of the `.txt` archive** (zoom-cli with cli-core main, on a second copy): 119 meetings before, 119
  files imported with no warning. A first run gave 127 meetings: the files' time was the end of each recording, not
  its start (all seven meetings the API also held were apart by exactly the transcript's length), so the API copies
  were not matched. With the start derived from the end: 120 meetings, every API copy merged, no meeting with two
  current transcripts; the one new meeting had no earlier copy.
- **Parity with ztx**, 45 queries over April–September (the task's words, 20 frequent words, 20 picked evenly from
  the rest): ztx found 45,833 lines, zm 50,232. zm missed 1,112 of ztx's: 755 in three meetings where zm holds the
  API's transcript, which splits lines differently (747 of them on a day zm has hits for that query), and 357 found
  only by ztx's rule "a stored word that begins the query word" — about 280 real other words and about 70 words
  recognition cut off. The rule came back behind the dictionary, which keeps the second kind and drops the first.
  With it, the 130-query noise check widened 1,321 passages instead of 1,157; median query 160 ms instead of 110.
- **Proximity** (`"a b"~N`, N in transcript lines): about 150 ms a query, 20 lines included.

## What it showed

- Reading the word list at query time costs about 0.15 s a query at this size, and needs no migration, no
  re-fill and no upkeep. The trigram table is about 200 times faster but needs all three, and its candidate cap
  loses words.
- The time grows with the number of stored words, not with the hits: a 1,000-meeting store would read about
  eight times as many words, so expect roughly a second. A trigram table is the way out if that becomes real.

## What was not measured

- Whether each of the 1,157 remaining widened matches is right: no passage was labelled by hand.
- Memory use, and stores above 120 meetings.
