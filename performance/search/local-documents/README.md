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

## Not measured

- qmd as a resident server (MCP), where model loading happens once.
- Other languages: all queries and documents are Russian.
- More than one labeller: the owner's agent wrote the queries and answers; 25 per corpus is small.
- memo against qmd on the Drive documents, and drive against qmd on the notes.
