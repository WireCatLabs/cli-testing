# Search quality and performance experiments

Start with [LIGHTWEIGHT-RANKING.md](LIGHTWEIGHT-RANKING.md) for the small-footprint options,
then [MODELS.md](MODELS.md) for the plain-language model explanation, then
[the evaluation guide](combined-search-evaluation.md) for the metrics. The
[model research](combined-search-model-research.md) contains the technical shortlist and sources.
[message-search/README.md](message-search/README.md) describes the fixtures, runners and results.

This area is an offline research harness, outside the published `src/` suites. It uses synthetic
messages and an explicitly selected cli-messaging **build**, including the experimental internal
service. It never imports that project's TypeScript source, opens an existing message store or
contacts a messenger. The public CLI/MCP search defaults are unchanged.

The [tool review](TOOL-RESEARCH.md) examines QMD, Meilisearch and Typesense. The
[lightweight matrix](matrix/README.md) records 23 tested approaches, fresh held-out results and
small-model resource measurements.

## Layout

| Path | Purpose |
|---|---|
| [message-search/](message-search/README.md) | Synthetic corpus, question supplement, benchmark runners, pinned model manifest and historical JSON reports |
| [run.py](run.py) | Portable launcher against a chosen cli-messaging build; also checks the benchmark TypeScript |
| [migration.json](migration.json) | Original file hashes and source commit before the transfer |
| [MODELS.md](MODELS.md) | Worked example, model architectures, download/RAM explanation and experiment plan |

## Run against the prototype

The selected cli-messaging checkout must contain the combined-search prototype from
[draft PR 803](https://github.com/leemour/cli-messaging/pull/803), installed dependencies and a fresh
`pnpm build`. Build it in its own checkout, then run these commands from the cli-testing root:

```sh
export SEARCH_MESSAGING_ROOT=/absolute/path/to/cli-messaging-checkout
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" typecheck
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" run > /tmp/search-baseline-new.json
python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" combined > /tmp/search-combined-new.json
```

The launcher stages the unchanged benchmark scripts in a new temporary directory and links only
`dist/` and installed dependencies from the selected checkout. This preserves their relative
imports and the historical runner hashes without committing a machine-specific path or installing
another copy of the runtime. It records both repository commits, package version, Node version
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

The transferred JSON reports and fixtures are byte-for-byte copies from cli-messaging commit
`13d352ad5735042e716cfb62a85262bac296f374`. Their hashes describe the original runs; moving them does
not create a new measurement. Documentation paths were updated; experiment scripts were preserved. Formatting and import sorting are disabled for
the transferred harness to preserve those hashes. Its JSON report output is allowed on stdout;
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
