# Meeting search: words, meaning, or both

## Why we ran it

The owner searches Russian Zoom meetings. Speech recognition garbles words, and the owner types both literal words
(«залог склад») and natural questions («что решили по цене?»). Word search finds exact words and their garbled
spellings, but not a question or other words for the same thing.
[cli-core#1738](https://github.com/WireCatLabs/cli-core/pull/1738) adds `searchMeetingsCombined`: word hits and passage
vectors ranked together by reciprocal rank fusion, with a question searched by its content words.

The question: does the combined search beat words-only and meaning-only, and does it lose to words on literal Russian
queries? The answer decides whether combined search becomes the default meeting search, and what to fix in #1738 before
it does.

## Setup

- AMD Ryzen AI 9 HX 470 (24 threads), Linux 7.0.0-38-generic x86_64, Node 24.19.0, `node:sqlite`.
- cli-core at `d2f3f5d6` (branch `feat/meeting-hybrid-search`, #1738), built with `pnpm build`, imported from `dist/`.
- Model: local e5-small (`multilingual-e5-small`, 8-bit), key `local:e5-small:384`, similarity floor (`meaningFloor`)
  0.8.
- Invented corpus ([corpus.mjs](corpus.mjs), fixed seed): 48 meetings (40 Russian, 8 English), 20–80 lines each, 2,409
  lines, invented speakers (Алиса Пример, Bob Sample…). Eight topics: pricing, hiring, travel, a release, an office
  lease, a mortgage, a realtor, marketing. Each meeting has topic talk, small talk and, in Russian, garbled spellings of
  the kind recognition makes («релис», «ипатеку», «реелтор»; 30 % chance per word kind per line). Several meetings per
  topic share the common words («цена», «скидки», «банк») without the fact, so a topic word alone does not find the
  answer.
- 19 facts, one line each, planted in one meeting each. Seven fact lines are garbled; their queries spell the word
  right. 134 passages; the longest is 369 tokens, so e5-small (512 tokens) cut none.
- 62 queries, three per fact plus five more questions: 19 **literal** (the fact's words), 19 **paraphrase** (other words
  for the same thing, none of the fact's words), 24 **questions** in Russian and English. Five questions use forms the
  question detector does not know («почему», «зачем», «что-то», "did", "is"), on purpose.
- Modes, top 10 each:
  - **words**: `searchMeetingHits(query)`, the meeting query language as typed.
  - **words (question words)**: the same with the question's content words (`questionTerms`), which is what the combined
    search's word side runs.
  - **meaning**: `meetingVectors.ranked`, no floor.
  - **meaning ≥ floor**: the same, passages above 0.8 only, which is what the combined search's meaning side keeps.
  - **combined**: `searchMeetingsCombined(query, { limit: 10 })`.
- Scores: **R@10** — the fact's meeting is among the top 10; **MRR** — 1 / rank of its first item. Each query has one
  relevant meeting, so R@10 is a hit rate. **Line** — an item counts only if it cites the fact line or is a passage that
  contains it; a passage gets credit for any line in its range, so line scores are lenient for meaning.
- Latency: after one untimed run, each query 5 times one after another (310 runs per mode), index refresh on as in the
  product.
- `node bench.mjs <cli-core checkout, built> <work directory> [runs=5]` writes `results.json` to the work directory.

## Results

| mode | literal R@10 · MRR | paraphrase R@10 · MRR | question R@10 · MRR | all R@10 · MRR | line R@10 · MRR, all |
|---|---|---|---|---|---|
| words | **100 % · 1.00** | 0 % · 0.00 | 0 % · 0.00 (24 errors) | 31 % · 0.31 | 31 % · 0.31 |
| words (question words) | **100 % · 1.00** | 0 % · 0.00 | 33 % · 0.33 (6 errors) | 44 % · 0.44 | 44 % · 0.44 |
| meaning | 79 % · 0.79 | **84 % · 0.51** | **96 % · 0.75** | **87 % · 0.69** | **84 % · 0.63** |
| meaning ≥ floor | 79 % · 0.79 | 79 % · 0.45 | 83 % · 0.72 | 81 % · 0.66 | 76 % · 0.60 |
| combined | **100 % · 1.00** | 79 % · 0.45 | 67 % · 0.67 (6 errors) | 81 % · **0.70** | 76 % · **0.65** |

On Russian queries only: literal — words 15/15, meaning 11/15, combined 15/15; paraphrase — meaning 12/15, combined
12/15; questions (18) — meaning 17, meaning ≥ floor 15, combined 12.

| latency, warm | p50 | p95 |
|---|---|---|
| words | 4.8 ms | 9.1 ms |
| words (question words) | 5.7 ms | 11.0 ms |
| meaning | 12.9 ms | 19.4 ms |
| combined | 18.9 ms | 27.3 ms |

Once per store: opening the model 1.2 s; embedding 134 passages 8.2 s (about 16 a second); the first word search, which
builds the word index, 59–164 ms.

Similarity of e5-small: the passage holding the fact scored 0.768–0.867 (median 0.823); the best passage per query
0.775–0.876. Passages above the 0.8 floor per query: 0 to 114 of 134 (median 52).

Per query: the rank of the first item that holds the fact line; `(n)` when only another line of the right meeting was
found, at rank n; `–` nothing in the top 10; `error` the search failed.

| class | query | words | meaning | meaning ≥ floor | combined | fact passage score |
|---|---|---|---|---|---|---|
| literal | подписка двенадцать евро | 1 | 1 | 1 | 1 | 0.847 |
| paraphrase | новая месячная плата для клиентов | – | 1 | 1 | 1 | 0.864 |
| question | сколько будет стоить подписка? | error | 1 | 1 | 1 | 0.851 |
| literal | скидка студентов | 1 | 1 | 1 | 1 | 0.823 |
| paraphrase | уступка в цене для учащихся | – | 1 | 1 | 1 | 0.834 |
| question | какую скидку дадим студентам? | error | 1 | 1 | error | 0.817 |
| literal · garbled line | собеседование оффер | 1 | 4 | 4 | 1 | 0.867 |
| paraphrase · garbled line | приём на работу после интервью | – | 10 | 10 | 10 | 0.865 |
| question · garbled line | кому решили сделать оффер? | error | 7 | (1) | (1) | 0.793 |
| literal | испытательный срок | 1 | – | – | 1 | 0.825 |
| paraphrase | проверочный период новых сотрудников | – | (2) | (2) | (2) | 0.837 |
| question | какой испытательный срок у джунов? | error | 1 | 1 | 1 | 0.840 |
| literal | билеты Лиссабон | 1 | 1 | 1 | 1 | 0.822 |
| paraphrase | поездка в Португалию | – | 1 | 1 | 1 | 0.829 |
| question | когда летим в Лиссабон? | error | 1 | 1 | 1 | 0.802 |
| question (not detected) | is the Lisbon trip booked? | error | 6 | – | error | 0.768 |
| literal · garbled line | суточные командировка | 1 | 1 | 1 | 1 | 0.822 |
| paraphrase · garbled line | дневное пособие в поездке | – | 3 | 3 | 3 | 0.844 |
| question · garbled line | сколько суточные в командировке? | error | 1 | 1 | 1 | 0.831 |
| literal · garbled line | релиз переносим вторник | 1 | 1 | 1 | 1 | 0.825 |
| paraphrase · garbled line | выпуск новой версии откладывается | – | – | – | – | 0.808 |
| question · garbled line | когда выйдет релиз три ноль? | error | 2 | – | – | 0.774 |
| question (not detected) · garbled line | почему перенесли релиз? | error | 7 | 7 | error | 0.818 |
| literal | приложение ревью | 1 | 1 | 1 | 1 | 0.839 |
| paraphrase | отправка программы на проверку в магазин | – | – | – | – | 0.826 |
| question | когда приложение отправим на ревью? | error | 1 | 1 | 1 | 0.844 |
| literal · garbled line | арендодатель аренда офиса | 1 | 1 | 1 | 1 | 0.855 |
| paraphrase · garbled line | хозяин помещения уступает по оплате | – | 7 | 7 | 7 | 0.826 |
| question · garbled line | что сказал арендодатель про аренду офиса? | error | 2 | 2 | 2 | 0.853 |
| literal | залог склад | 1 | 1 | 1 | 1 | 0.809 |
| paraphrase | депозит за хранилище | – | 1 | 1 | 1 | 0.808 |
| question | когда вернут залог за склад? | error | 2 | 2 | 1 | 0.825 |
| question (not detected) | зачем платить залог за склад? | error | 1 | 1 | error | 0.820 |
| literal · garbled line | ипотека одобрил | 1 | – | – | 1 | 0.828 |
| paraphrase · garbled line | кредит на жильё согласовали | – | 3 | 3 | 3 | 0.839 |
| question · garbled line | под какой процент дали ипотеку? | error | 8 | – | – | 0.799 |
| question (not detected) · garbled line | одобрили что-то по ипотеке? | error | – | – | error | 0.816 |
| literal | первоначальный взнос | 1 | – | – | 1 | 0.818 |
| paraphrase | собственные средства при покупке жилья | – | 7 | 7 | 7 | 0.823 |
| question | какой нужен первоначальный взнос? | error | 6 | 6 | 1 | 0.810 |
| literal · garbled line | риелтор балкон | 1 | – | – | 1 | 0.801 |
| paraphrase · garbled line | агент по недвижимости нашёл жильё с лоджией | – | (7) | (7) | (7) | 0.807 |
| question · garbled line | какие квартиры показал риелтор? | error | 2 | 2 | 1 | 0.824 |
| literal | комиссия агентства | 1 | 1 | 1 | 1 | 0.843 |
| paraphrase | вознаграждение посредника за сделку | – | – | – | – | 0.811 |
| question | кто платит комиссию агентству? | error | 1 | 1 | 1 | 0.820 |
| literal | бюджет реклама инстаграм | 1 | 1 | 1 | 1 | 0.854 |
| paraphrase | тратим меньше на продвижение в соцсетях | – | 4 | 4 | 4 | 0.844 |
| question | что решили с бюджетом на рекламу? | error | 1 | 1 | 1 | 0.819 |
| literal | enterprise plan seat | 1 | 1 | 1 | 1 | 0.805 |
| paraphrase | corporate tier cost increase | – | 1 | 1 | 1 | 0.813 |
| question | how much will the enterprise plan cost? | error | 1 | 1 | 1 | 0.822 |
| question (not detected) | did we agree on the enterprise price? | error | 1 | 1 | error | 0.819 |
| literal | backend role postgres | 1 | 1 | 1 | 1 | 0.857 |
| paraphrase | database engineer vacancy | – | 4 | 4 | 4 | 0.805 |
| question | who are we hiring for the backend? | error | 1 | 1 | 1 | 0.832 |
| literal | offsite seville | 1 | 1 | 1 | 1 | 0.814 |
| paraphrase | team retreat location change | – | 1 | – | – | 0.794 |
| question | where is the offsite now? | error | 1 | 1 | 1 | 0.804 |
| literal | code freeze thursday | 1 | 1 | 1 | 1 | 0.805 |
| paraphrase | stop merging before launch | – | 2 | 2 | 2 | 0.817 |
| question | when is the code freeze? | error | 1 | 1 | 1 | 0.823 |

## What it showed

- **Combined does not lose to words on literal Russian queries.** It found all 15, and the word hit on the fact line
  came first every time (line MRR 1.00), including the 7 garbled fact lines. Meaning alone missed 4 of 15: the fact
  passage ranked 11th to 52nd because other meetings on the same topic scored as high.
- **Paraphrases are meaning's job.** Words found none, as built. Combined equals meaning above the floor; the floor cost
  one English paraphrase whose correct passage scored 0.794.
- **Questions are where combined falls behind meaning: 67 % against 96 %.** Eight misses:
  - Six searches failed outright with `validation_error` ("query.unsupported-operator"). When the detector does not see
    a question, the text goes to the query language as typed, and a word ending in `?` is refused there. The error stops
    the whole search, so meaning, which had the fact in its top 10 for five of the six (first for three), returns
    nothing. The detector missed the five questions written to miss («почему…?», «зачем…?», «одобрили что-то…?»,
    "did…?", "is…?") and one that was not: «какую скидку дадим студентам?» — the list has «какой/какая/какие/какое» but
    not «какую».
  - Two lost the only correct passage to the floor (0.774 and 0.799).
- **The question word side rarely helps.** A question's content words must all match one line, and a question uses other
  verbs than the answer («дали», «решили», «отправим», "cost", "now"). Words found 8 of 24 questions; in all 8 meaning
  found the fact too.
- **The 0.8 floor does not separate good from bad on e5-small.** Correct and best passages all sit between 0.77 and
  0.88. For one query the floor keeps 114 of 134 passages, for another none. It dropped the correct passage in 5 of 62
  queries and filtered nothing useful in the rest.
- **Cost:** combined is about 19 ms at the median against 5 ms for words, on 134 passages. Meaning reads every vector,
  so the gap grows with the store.

What this suggests for [#1738](https://github.com/WireCatLabs/cli-core/pull/1738), in order of effect: when the word
side refuses the text, rank by meaning alone instead of failing; treat any text ending in `?` as a question, and add the
missing forms («какую», «почему», «зачем», "did", "is", "are", "do"); drop or lower the e5-small floor. With the first
two, combined would have answered the six failed questions as meaning did, and kept 100 % on literal words. Those
changes were not run here.

## What was not measured

- Real meetings. The same author wrote the corpus, the queries and the labels, and the facts are one clear line each;
  real answers are spread over several lines and speakers.
- Words spread over neighbouring lines, chat and summaries, filters (`since`, `project`, `from:`), paging.
- More than one relevant meeting per query, so recall here is a hit rate.
- Larger stores: latency and the meaning side's ranking at hundreds of meetings. EmbeddingGemma and remote models.
- Memory use.
