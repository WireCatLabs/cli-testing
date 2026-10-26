# Search quality and performance experiments

For the full sequence of ideas, experiments and conclusions, read [PROCESS.md](PROCESS.md).

The [compact pipeline handoff and feasibility check](compact-pipeline/README.md) reuses these
experiments, compares the existing multilingual reranker with a larger CPU export on synthetic
diagnostics, and orders the next mathematical/context/model experiments within explicit budgets.

The [evidence pipeline](evidence-pipeline/README.md) (25 October) then measured those stages on frozen
synthetic splits with Core's published discovery as the baseline. It found discovery returning nothing for
questions ending in "?", and showed native context and E5 fusion help while diversity and mMARCO do not.

Start with [LIGHTWEIGHT-RANKING.md](LIGHTWEIGHT-RANKING.md) for the small-footprint options,
then [MODELS.md](MODELS.md) for the plain-language model explanation, then
[the evaluation guide](combined-search-evaluation.md) for the metrics. The
[model research](combined-search-model-research.md) contains the technical shortlist and sources.
[message-search/README.md](message-search/README.md) describes the fixtures, runners and results.

This area is an offline research harness, outside the published `src/` suites. It uses synthetic
messages and an explicitly selected cli-messaging **build**, including the experimental internal
service. It never imports that project's TypeScript source, opens an existing message store or
contacts a messenger. The public CLI/MCP search defaults are unchanged. Explicit discovery is now released; the
[released-package contract check](released/README.md) verifies both published CLI binaries offline.

The [tool review](TOOL-RESEARCH.md) examines QMD, Meilisearch and Typesense. The
[lightweight matrix](matrix/README.md) records 23 tested approaches, fresh held-out results and
small-model resource measurements.

The [robustness validation](validation/README.md) challenges negation, conditional approvals and
reply context. It shows why the first feature model is not ready for production and distinguishes
cheap ranking from reliable answer-availability decisions.

The [model-free path](model-free/README.md) now tests actual questions end to end without manual
keyword anchors: bounded lexical planning, stemmed BM25 and eligible reply context. It records
ranking failures and full-process RAM. The [fresh validation](model-free/FRESH-VALIDATION.md)
now measures the built storage-backed discovery option and archive scaling, with strict defaults
preserved and missing-fact partial hits explicitly retained. The
[candidate/ranking follow-up](model-free/RANKING-VALIDATION.md) separates missing candidates from
poor ordering and records unsuccessful cheap rerankers. The
[compact-model comparison](compact/README.md) tests 5 MB and 24 MB models, evidence loss and a
bounded supplement design. The [supplement validation](supplement/README.md) adds crowded cases,
byte limits and a stable merge, while keeping production model-free.

The [image search levels](images/README.md) compare caption, context and picture models (CLIP, SigLIP2) on one
person's images, totals only.

[Mentions](mentions/README.md): how long finding phones, e-mail, links and documents by rules takes on one person's
messages, and how many of each it finds, totals only.

[Startup stages](startup/README.md) separates process start, built store import, empty-store opening and text-model loading.

[Vector index](vector-index/README.md) compares Core's current vector scan with an index on chunks, int8 vectors,
sqlite-vec, usearch, hnswlib and packed blocks of vectors, on synthetic stores of 100k and 1M chunks (2026-10-25).
Its [Core implementation](vector-index/README.md#core-implementation-cli-core2001) section measures the `vec0` index
Core adopted: the same answers as the scan, 1.2 s → 0.2 s warm and 1.9 s → 0.6 s cold for one account at 600k
message vectors.

## Layout

| Path | Purpose |
|---|---|
| [message-search/](message-search/README.md) | Synthetic corpus, question supplement, benchmark runners, pinned model manifest and historical JSON reports |
| [everywhere/](everywhere/README.md) | Latency of a bare word that also looks in transcripts, file names and file text (2026-10-13) |
| [envelope-s4/](envelope-s4/README.md) | Ranking before and after search moved onto the list envelope: identical (2026-10-14) |
| [vector-index/](vector-index/README.md) | Storage and index options for search by meaning, 100k and 1M chunks: packed blocks recommended; then Core's `vec0` index measured at 100k and 600k (2026-10-25) |
| [search-all-meaning/](search-all-meaning/README.md) | What searching messages by meaning adds to `search all`, and sharing the model with notes: 1.7 s → 0.9 s (2026-10-25) |
| [local-documents/](local-documents/README.md) | qmd compared with memo and drive search on the owner's notes and Drive documents (2026-10-13) |
| [run.py](run.py) | Portable launcher against a chosen cli-messaging build; also checks the benchmark TypeScript |
| [migration.json](migration.json) | Original file hashes and source commit before the transfer |
| [MODELS.md](MODELS.md) | Worked example, model architectures, download/RAM explanation and experiment plan |

## Run against the prototype

The selected cli-messaging checkout must contain the combined-search prototype from
[merged PR 803](https://github.com/WireCatLabs/cli-messaging/pull/803), installed dependencies and a fresh
`pnpm build`. Build it in its own checkout, then run these commands from the cli-testing root:

```sh
export SEARCH_MESSAGING_ROOT=/absolute/path/to/cli-messaging-checkout
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" typecheck
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" run > /tmp/search-baseline-new.json
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" combined > /tmp/search-combined-new.json
```

The launcher stages the benchmark scripts in a new temporary directory and links only
`dist/` and installed dependencies from the selected checkout. This preserves their relative
imports without committing a machine-specific path or installing another copy of the runtime.
The selected build must use WireCat packages; no retired-scope import aliases are needed. It records
both repository commits, package version, Node version
and command in `launch.json`; existing reports also record input and relevant build-file hashes.
The temporary harness, launch metadata and benchmark stores are retained for inspection.

Model preparation is an explicit download step, separate from offline evaluation:

```sh
python3 performance/search/message-search/prepare-reranker.py /tmp/message-search-reranker-1427fd6
MESSAGE_RERANKER_DIR=/tmp/message-search-reranker-1427fd6 \
  python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" semantic --crossencoder > /tmp/search-reranked-new.json
MESSAGE_RERANKER_DIR=/tmp/message-search-reranker-1427fd6 \
  python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" resources > /tmp/search-resources-new.json
```

For e5, use `semantic` without `--crossencoder`; that requires the separately installed, pinned
e5-small cache expected by the selected build. No runner downloads weights automatically.

## Historical evidence and new results

The original reports and fixtures came from cli-messaging commit
`13d352ad5735042e716cfb62a85262bac296f374`. Package names in the historical copies now use WireCat.
`migration.json` keeps the original import hashes and records normalized copies separately.
Changing a package name does not create a new measurement. Formatting and import sorting remain disabled for
the transferred harness. Its JSON report output is allowed on stdout;
other lint checks and the explicit benchmark typecheck still apply.
The archived reports are synthetic research evidence, explicitly kept here at the owner's request.
Operational audit results and any private-account results retain the repository's private-results policy.

Write new runs to an explicit output location, normally outside the checkout. Preserve the old
reports rather than overwriting them. Review synthetic-only results before deliberately adding a
new research artifact here. Keep production unit tests beside their implementation in cli-messaging.
The existing conversation-search benchmark was outside this migration.

## Migration validation

On 2026-10-09, the launcher passed the separate benchmark TypeScript check. A new baseline run
reproduced every archived aggregate metric and every query's ranked output exactly. The relocated
resource probe loaded the existing pinned cache and completed its 300-pair run. An invalid build
path was rejected before staging or inference. All transferred scripts, fixtures, model pins and
historical JSON reports matched the original hashes in `migration.json`. Documentation was
updated separately. Package lint, typechecking, coverage and document checks passed in both
repositories; no new model weights were downloaded during the migration.

[Meeting garbled words](meeting-garbled/README.md): widening a query word to the spellings speech recognition
made of it, and the cost of reading the stored word list at query time instead of keeping a trigram table.

[Message garbled words](message-garbled/README.md): voice-note transcripts in message search found in any form of a
word and widened to garbled spellings (store version 29), on a copy of one person's store, totals only.
