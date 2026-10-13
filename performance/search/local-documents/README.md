# qmd compared with memo and drive search on local documents

Measured 2026-10-13. Owner's decision to run it: NEED-190 (A), in the field-test journal.

## Why we ran it

memo indexes a folder of notes, and drive indexes a Google Drive folder exported as text. Agents use both to find
a project's documents. In the 2026-10-12 field test the owner worked a real project through them and asked:
would [qmd](https://github.com/tobi/qmd), a local search engine for Markdown with keyword search, vector search
and a hybrid mode with reranking, find the right document more often than what we built?

Our [tool review](../TOOL-RESEARCH.md#qmd) read qmd's source but never ran it. This runs it on the same documents
and the same questions as memo and drive, to decide whether its approach — or qmd itself — is worth adopting for
documents.

## Setup

- Two corpora, the owner's, private, Russian:
  - **notes:** 59 Markdown notes of one project (journals, reports, a client card). memo against qmd.
  - **drive:** 63 Google Docs of the same project, exported to Markdown (7.3 MB). drive against qmd.
  - Left out of both sides: two notes memo had not indexed yet, and anything that is a chat log.
- **50 known-answer queries,** 25 per corpus, written before any engine ran: 5 exact words, 5 other word forms,
  4 typos, 5 paraphrases (different words, same meaning), 6 questions. Each lists the documents that answer it.
  The queries and document names stay private (`cli-private`, `reports/2026-10-13-qmd-vs-memo-drive/`).
- **Engines:** memo 0.20.0 (`memo search notes --folder <id>`), drive 0.1.0 (`drive <profile> search`), qmd 2.8.3
  in three modes: `search` (BM25 keywords), `vsearch` (vectors), `query` (hybrid with query expansion and
  reranking). qmd models: EmbeddingGemma 300M (Q8), Qwen3 reranker 0.6B, qmd query expansion 1.7B.
- Each query is one process, as an agent runs it, so latency includes start-up. Top 10 results are scored after
  dropping anything outside the corpus. AMD Ryzen AI 9 HX 470, Linux 7.0, Node v24.19.0; other work was running
  on the machine.
- Run: [`run.py`](run.py) with the private data named by environment variables (see its header), then
  `python3 -I score.py runs.json --markdown`.

## Results

Share of the 25 queries per corpus whose right document came 1st, in the top 3, in the top 10; MRR@10 (1 for
first place, 1/2 for second, …); time per query, one process each. One query is 0.04 of a share.

| corpus | engine | hit@1 | hit@3 | hit@10 | MRR@10 | p50 | p95 |
|---|---|---|---|---|---|---|---|
| notes | **memo** | **0.72** | 0.84 | 0.88 | **0.78** | 2.4 s | 2.5 s |
| notes | qmd search (keywords) | 0.16 | 0.16 | 0.16 | 0.16 | 0.26 s | 0.30 s |
| notes | qmd vsearch (vectors) | 0.56 | 0.64 | 0.76 | 0.63 | 9.9 s | 19 s |
| notes | qmd query (hybrid) | 0.48 | **0.96** | **0.96** | 0.70 | 25 s | 28 s |
| drive | drive, words only (no vectors) | 0.36 | 0.48 | 0.48 | 0.41 | 2.4 s | 2.5 s |
| drive | **drive, words and meaning** | **0.68** | **0.80** | **0.92** | **0.76** | 1.3 s | 1.5 s |
| drive | qmd search (keywords) | 0.28 | 0.32 | 0.32 | 0.30 | 0.25 s | 0.27 s |
| drive | qmd vsearch (vectors) | 0.56 | 0.76 | 0.80 | 0.66 | 11 s | 24 s |
| drive | qmd query (hybrid) | 0.48 | **0.80** | 0.88 | 0.65 | 25 s | 27 s |

Top 3, by kind of query (5 exact, 5 word forms, 4 typos, 5 paraphrases, 6 questions):

| corpus | engine | exact | word forms | typos | paraphrases | questions |
|---|---|---|---|---|---|---|
| notes | memo | 5/5 | 5/5 | 3/4 | 2/5 | 6/6 |
| notes | qmd query | 5/5 | 5/5 | 4/4 | 4/5 | 6/6 |
| drive | drive, words only | 5/5 | 5/5 | 1/4 | 0/5 | 1/6 |
| drive | drive, words and meaning | 5/5 | 5/5 | 4/4 | 2/5 | 4/6 |
| drive | qmd vsearch | 3/5 | 5/5 | 3/4 | 4/5 | 4/6 |
| drive | qmd query | 4/5 | 5/5 | 3/4 | 4/5 | 4/6 |

Cost of qmd: 2.2 GB of models (embedding 334 MB, reranker 639 MB, query expansion 1.28 GB); embedding 122
documents (7,803 chunks) took 12 min 49 s at 1.1 GB peak memory; the index is 58 MB. memo and drive add no model
download for this; their index lives in the shared store.

## What it showed

- **drive was first measured without its vectors.** Its documents had been synced without `--embed`, so it searched
  by words alone while answering `by: "words and meaning"`. After `drive <profile> sync --embed` (2,684 passages,
  3 min 22 s with e5-small on this machine) it is the best engine on these documents: right document first 0.68
  against qmd's 0.56, top 3 0.80, the same as qmd's hybrid, in 1.3 s against 11–25 s. On paraphrases, typos and
  questions it reaches 10 of 15 in the top 3; qmd's vectors 11 of 15.
- **memo puts the right note first more often than qmd** (0.72 against 0.48), and qmd's hybrid more often has it
  somewhere in the top 3 (0.96 against 0.84). The gap is paraphrases: 2 of 5 for memo, 4 of 5 for qmd. drive shows
  the same weak spot (2 of 5).
- **qmd's keyword search alone is poor on Russian** (0.16 on notes): word forms, typos and questions miss,
  probably because it does not stem Russian. Its quality comes from the vectors and the reranker.
- **qmd is too slow to run once per query:** 10–25 s a search, because each process loads its models. An agent
  calls a CLI once per question. A resident qmd (its MCP server keeps models loaded) was not measured.
- **Conclusion:** keep memo and drive; do not adopt qmd. Make sure documents get vectors (drive's sync does not
  embed by default) and say so when a search ran without them.
- **memo's and drive's time per search** was 2.4 s in the first run and 1.3 s for drive in the rerun, with less
  other work on the machine. Most of it is probably start-up; not measured apart.

## How each engine works

memo and drive share one search, `searchNotes` in
[cli-messaging](https://github.com/WireCatLabs/cli-messaging/blob/main/src/services/notes-search.ts); drive passes it
its own folder. qmd is described from the README in the npm package `@tobilu/qmd` 2.8.3, the version measured, and
from our [source review](../TOOL-RESEARCH.md#qmd).

| | memo and drive | qmd |
|---|---|---|
| Index | One SQLite store shared with chats, mail, meetings and notes; a document is a note with its source URL | Its own SQLite index over Markdown folders (collections) |
| Keywords | SQLite FTS5 with Snowball stemming, by default Russian for Cyrillic and English and Spanish for Latin: `редиректами` finds `редиректы` | SQLite FTS5 BM25 without Russian stemming: other word forms miss (0.16 on the notes) |
| Vectors | multilingual-e5-small, 8-bit ONNX, 118 MB, 384 dimensions, 512-token input; passages of ~1,200 characters (~300 tokens) with 150 overlapping | EmbeddingGemma 300M, Q8 GGUF, 334 MB, 768 dimensions; passages of 900 tokens with 15% overlap |
| Weak vector hits | Dropped below cosine 0.8 (`meaningFloor`, measured for e5-small) | Kept; `minScore` optional |
| Fusion | Reciprocal rank fusion (RRF, k = 60) of the keyword list and the vector list | RRF (k = 60) of every list from every query variant; the original query counts twice; +0.05 for a first place, +0.02 for second or third |
| Query expansion | None | A fine-tuned 1.7B model (1.28 GB) writes variants of the query: `lex` (keywords), `vec` (meaning), `hyde` (an imagined answer) |
| Reranking | None for notes and documents | Qwen3-Reranker 0.6B (639 MB) reads the query with each of the top 30–40 candidates and answers yes/no; its score is blended with the fusion rank: 25% for places 1–3, 40% for 4–10, 60% below |
| Each hit says why | `foundBy: words`, `meaning` or both; the answer says when meaning was skipped | A score; `--explain` breaks it into stages |
| Models to download | 118 MB, once, shared with chats and meetings | 2.2 GB |
| One search, a new process each time | 1.3–2.4 s | 0.25 s keywords, 10–25 s with models |
| Kept running | tg's and memo's MCP servers keep the vector model loaded | `qmd mcp` keeps all three models loaded |

The vector model is not the difference that matters here. EmbeddingGemma is also one of our models
(`tg models text download embeddinggemma`, 4-bit ONNX, ~200 MB); on chat it ranked better than e5-small but embeds
7–15 times slower (1.5–2 passages a second against 10–31, by thread count), so e5-small is the default. In this run qmd's vectors were
EmbeddingGemma and ours e5-small; [EmbeddingGemma against e5-small](#embeddinggemma-against-e5-small-vectors-only)
compares the two models on the same passages.

## Why ours ranks first more often, and where qmd is ahead

- **Exact words and word forms: ours.** Stemming finds every form of a Russian word; qmd's keywords do not, and
  its vectors drop some exact names (3–4 of 5 exact queries on the Drive documents in qmd's top 3, 5 of 5 for drive).
  The fusion keeps an exact keyword hit at the top, so memo and drive put the right document first more often
  (0.72 and 0.68 against 0.48 for qmd's hybrid).
- **Paraphrases: qmd.** 4 of 5 in the top 3 for qmd's hybrid on each corpus, 2 of 5 for memo and for drive. A
  paraphrase shares no words with the answer, so only the vector list can find it, and one vector list is a thin
  vote in the fusion. qmd adds query variants and a reranker that reads query and text together.
- **Typos and questions: even.** On the Drive documents, drive and qmd both reach 3–4 of 4 typos and 4 of 6
  questions in the top 3. On the notes, memo has every question and 3 of 4 typos.
- **Speed and cost: ours.** 1.3–2.4 s against 10–25 s a search, 118 MB against 2.2 GB of models, and one store for
  everything instead of a second index per folder.

## Query expansion and reranking: what we have

- **Query expansion: not needed as a model.** qmd runs a local 1.7B model to rephrase the query because a plain
  CLI user types one query. Our callers are agents, and an agent is a language model already: it can search again
  with other words, or with the words an answer would contain. qmd's own MCP tool takes the variants from the
  agent (`searches` of type `lex`, `vec`, `hyde`) and skips its expansion model. The cheap equivalent for us is a
  skill rule — "nothing relevant: search again with other words" — not a 1.28 GB download.
- **Reranking: we tried three on message search; none ships, and note search has none.**
  - **Rules, no model**
    ([`messages-combined.ts`](https://github.com/WireCatLabs/cli-messaging/blob/main/src/services/messages-combined.ts)):
    how many query words a message covers, how close together and in what order; an exact word counts more than
    a stem, a stem more than a beginning or a typo correction. In the dev sweep of 180 settings (candidate depth,
    RRF k, each rule alone and all together, chat caps) every setting gave the same recall, MRR and nDCG: the
    rules moved no answer into or out of the top ten
    ([combined-search.md, "Measured lexical experiment"](https://github.com/WireCatLabs/cli-messaging/blob/main/docs/dev/combined-search.md)).
    The code stays, default `rerank: "all"`, but its only caller, `--discover`, passes `rerank: "none"`.
  - **e5-small cosine as a reranker**: recall@10 on the dev keyword queries fell to 0.275, below strict search's
    0.313; no cosine floor kept the answers while dropping hits for questions with no answer. Rejected.
  - **A cross-encoder**,
    [mmarco-mMiniLMv2-L12-H384](https://huggingface.co/cross-encoder/mmarco-mMiniLMv2-L12-H384-v1), 8-bit ONNX,
    ~130 MB: reads the query and the message together. Dev recall/MRR/nDCG 0.525/0.553/0.477 with no false hits,
    better than strict and legacy; on the held-out queries 0.438/0.488, under the 0.45/0.50 gates, and 3–4 s a
    query. Not shipped; it is not retuned on held-out results by the plan's rule.
  - **Note and document search (memo, drive) only fuses its word and meaning lists.** A reranker there is the
    one qmd idea with a measured reason behind it, the paraphrase gap. It would run in a long-lived process (the
    MCP server), as qmd's does, or every search pays the model load. The owner's ruling: an opt-in download,
    never on by default (NEED-1002). Measured below: [Rerankers on these queries](#rerankers-on-these-queries).

## Rerankers on these queries

Run 2026-10-13 evening, owner's decision NEED-1002 (A): would a reranker close the paraphrase gap, and which one.

**Setup.** [`collect.py`](collect.py) takes memo's and drive's top 40 per query from the CLIs, read-only (memo
0.20.0, drive 0.1.0 with its vectors). [`rerank.mjs`](rerank.mjs) runs in one long-lived process, as the MCP
server would: for each query it takes the top 30, picks one passage per document as qmd does (the 1,200-character
passage holding most query words, matched on their first five letters), scores query and passage with the
reranker, and orders by the score alone or by qmd's blend (place 1–3: 75% the original place, 4–10: 60%, below:
40%). The right document was among the 40 candidates for all 50 queries.

- **mmarco**: [mmarco-mMiniLMv2-L12-H384](https://huggingface.co/cross-encoder/mmarco-mMiniLMv2-L12-H384-v1),
  8-bit ONNX, 130 MB, pinned in `message-search/reranker.json`; our WebAssembly runtime, 8 threads; score through a
  sigmoid.
- **Qwen3**: Qwen3-Reranker-0.6B Q8 (639 MB), qmd's model, through qmd's node-llama-cpp 3.20.0, context 4,096.

Time is the reranking of one query's 30 passages in the warm process. Loading took 0.6 s (mmarco) and 2.2 s
(Qwen3), once.

| corpus | engine | hit@1 | hit@3 | hit@10 | MRR@10 | added per query |
|---|---|---|---|---|---|---|
| notes | memo | 0.72 | 0.84 | 0.88 | 0.78 | — |
| notes | **memo + mmarco** | **0.84** | 0.96 | 0.96 | **0.89** | 2.1 s |
| notes | memo + mmarco, blend | 0.72 | 0.92 | 1.00 | 0.82 | 2.1 s |
| notes | memo + Qwen3 | 0.80 | 0.92 | 1.00 | 0.88 | 6.5 s |
| notes | memo + Qwen3, blend | 0.72 | **1.00** | 1.00 | 0.85 | 6.5 s |
| notes | qmd query (for reference) | 0.48 | 0.96 | 0.96 | 0.70 | 25 s a search |
| drive | drive | 0.68 | 0.80 | 0.92 | 0.76 | — |
| drive | drive + mmarco | 0.68 | 0.80 | 0.96 | 0.76 | 2.0 s |
| drive | drive + mmarco, blend | 0.68 | 0.88 | 0.92 | 0.78 | 2.0 s |
| drive | drive + Qwen3 | 0.72 | 0.80 | 0.92 | 0.78 | 6.1 s |
| drive | drive + Qwen3, blend | 0.68 | **0.92** | 0.92 | 0.78 | 6.1 s |
| drive | qmd query (for reference) | 0.48 | 0.80 | 0.88 | 0.65 | 25 s a search |

Paraphrases, top 3: notes memo 2/5 → 5/5 with mmarco, 5/5 with Qwen3; drive 2/5 → 3/5 with mmarco, 4/5 with Qwen3.

**What it showed** — one run of 25 queries per corpus, no held-out set. The message cross-encoder also looked
good on its dev queries and then missed the held-out gates; these numbers justify a second, frozen run on fresh
queries, not a release.

- **On the notes a reranker closes the paraphrase gap.** mmarco alone puts the right note first in 21 of 25 (memo
  18, qmd 12) and finds every paraphrase in the top 3. It beats qmd's whole pipeline here at a fifth of its
  model size, and needs no query-expansion model.
- **On the Drive documents the gain is within noise.** At most two more queries in the top 3 (blend), and the score
  alone pushes exact and word-form hits down: drive + mmarco puts the exact-word answer first in 3 of 5, against
  5 of 5 without it. The blend keeps them.
- **Score alone or blend.** Score alone wins first place on the notes; the blend never loses an exact or
  word-form hit. Which to ship depends on what the owner values more; the sample is too small to tell
  0.84 from 0.72 with confidence (three queries).
- **Qwen3 got our 1,200-character passages**; qmd feeds it ~900-token chunks. "No better" holds for these
  passages only.
- **mmarco is the cheaper choice:** 130 MB and ~2 s per query warm against 639 MB and ~6 s for Qwen3, with
  results as good or better. It must not run per CLI process: loading alone is 0.6 s, and a search warm takes
  milliseconds (vector search over all passages, 7 ms a query here).
- **Most of memo's and drive's 1.2–2.4 s a search is probably start-up and model loading.** Searching the vectors
  in the warm process took 7–11 ms; the CLI phases were not timed apart.

### EmbeddingGemma against e5-small, vectors only

Each model embeds every 1,200-character passage; a document's score is its best passage's cosine; no words, no
fusion. The same 25 queries per corpus as above, the same passages for both models.

| corpus | vectors | hit@1 | hit@3 | hit@10 | MRR@10 | query embedding, warm | passages a second |
|---|---|---|---|---|---|---|---|
| notes | e5-small (default) | 0.48 | 0.84 | 0.96 | 0.67 | ~10 ms | 14.9 |
| notes | EmbeddingGemma | **0.68** | **0.88** | **1.00** | **0.79** | ~95 ms | 1.6 |
| drive | e5-small (default) | 0.48 | 0.76 | 0.76 | 0.60 | ~10 ms | 11.0 |
| drive | EmbeddingGemma | **0.80** | **0.84** | **0.96** | **0.85** | ~70 ms | 0.7 |
| drive | for comparison: drive, words and meaning (e5-small fused with words) | 0.68 | 0.80 | 0.92 | 0.76 | 1.3 s a process | — |

Top 3 by kind on Drive (5 exact, 5 word forms, 4 typos, 5 paraphrases, 6 questions): e5-small 4/5, 4/5, 3/4, 3/5,
5/6; EmbeddingGemma 4/5, 4/5, 4/4, 4/5, 5/6.

EmbeddingGemma puts the right note first in 17 of 25 against 12, and the right Drive document in 20 of 25 against
12. On Drive its vectors alone rank better than drive's own search, which fuses e5-small with the word list (0.80
first against 0.68). Paraphrases in the top 3: 4 of 5 on both corpora, against e5-small's 3 of 5 on Drive.

The price is embedding time: the 6,065 Drive passages took 2 h 28 min with EmbeddingGemma (0.7 a second, with
other work on the machine; 1.6 a second on the notes alone) against 9 min with e5-small. A query costs ~70–95 ms
against ~10 ms, warm. Whether the gain survives fusion with the word list was not measured.

Two Drive documents were edited between the embedding and this ranking. Both models embedded the same earlier
text, so they are compared fairly; the passage count of the edited one is pinned with `PASSAGES_OVERRIDE` in
`rerank.mjs`. One of the 25 Drive queries names an edited document.

## Limits

| | memo and drive | qmd |
|---|---|---|
| Paraphrases | 2 of 5 in the top 3 | 4 of 5 |
| Russian word forms | Stemmed | Not stemmed; vectors only |
| Vectors present | memo's import embeds unless `--no-embed`; drive's sync embeds only with `--embed`, and the first run here searched without vectors while saying `words and meaning` | Built by `qmd embed`; a search without them is keyword-only |
| Large documents | Up to 200,000 characters of text per file today; 2,000,000 in an open change | No stated cap; 900-token passages |
| File types | Google Docs, Markdown, text; Sheets, PDF, Office in an open drive-cli change | Markdown and text files on disk; anything else must be exported first |
| Cost of one search | Process start-up, probably most of the 1.3–2.4 s; not measured apart | Model load per process: 10–25 s; a resident server not measured |
| Disk and memory | 118 MB model; the store is shared | 2.2 GB of models; 1.1 GB peak while embedding; a 58 MB index for 122 documents |
| Scope | Notes, documents, chats, mail, meetings in one search | Files in its collections only |

## What to take from qmd

1. **A reranker for note and document search, in the MCP server only, opt-in.** Measured: mmarco lifts notes
   from 0.72 to 0.84 first place and every paraphrase into the top 3, at ~2 s warm; on Drive documents the gain is
   within noise.
2. **EmbeddingGemma for documents.** Measured: on Drive its vectors alone put the right document first in 0.80
   against e5-small's 0.48, and above drive's fused search (0.68). Embedding is 7–15 times slower — hours, not
   minutes, for a large folder, once, then only changed documents. Next: the same run fused with the word list.
3. **Variants from the agent, not a model.** A rule in the tg and memo skills.
4. **Position-aware blending** if a reranker ships: keep the top keyword hits protected from it, as qmd does.
5. **Vectors by default.** drive's sync embeds unless told not to, and a search without vectors says so.

## Limits of this test

- **Small.** 25 queries per corpus; one query is 0.04 of a share, so a difference under about 0.10 is noise.
- **One labeller.** The owner's agent wrote the queries and answers before any engine ran; the owner did not
  check them.
- **One project, one language.** Russian notes and documents of one rental website project; no English, no code.
- **Documents only.** Chat messages, the main corpus of tg, were not tested.
- **Not crossed.** memo against qmd on the Drive documents, and drive against qmd on the notes.
- **Not equal models.** qmd's vectors are EmbeddingGemma, ours e5-small in the main table; the two models are
  compared on the same passages in their own section.
- **Process per query.** qmd as a resident server (MCP), where models load once, was not measured; nor our MCP
  servers.
