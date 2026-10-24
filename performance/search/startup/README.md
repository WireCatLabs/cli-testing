# Where search startup time goes

CORE-6 started from reports that memo and drive take 1.2–2.4 seconds for one search while a warm vector lookup
can take milliseconds. This measurement separates process startup, built module import, store opening and model
loading before choosing what to optimize. It uses an empty synthetic store and a fixed sentence; it reads no account
configuration or user data and performs no network calls.

## Reproduce

Use a built cli-core checkout and an already downloaded e5-small text model. No model is downloaded by the runner.
The model directory contains `e5-small/`; the runner creates a temporary HOME and synthetic SQLite stores.

```sh
node performance/search/startup/measure.mjs /absolute/path/to/built-cli-core /absolute/path/to/models/text 8
```

The runner writes `results.json` next to itself. It prepares the reused store before timing and starts a fresh Node
process for each scenario and round. Fresh-store samples create a separate empty database each time. Model samples
open the model, embed one fictional sentence twice, then close it. Raw samples and hardware/runtime versions are
in [results.json](results.json).

## Results

Measured 2026-10-24 on an AMD Ryzen AI 9 HX 470, Node 24.19.0, 4 model threads, 8 samples per scenario.
Built cli-core commit `f2d64158ed2887b92afa35acaf1669b13d0deb20` is 0.404.0 with a documentation-only changelog edit.
The OS file cache was not cleared; these are new-process measurements with warmed filesystem caches. Other work
could use the laptop during the run. With eight samples p95 is the maximum, not a stable tail estimate.

Milliseconds; each row has its own distribution, so percentile rows must not be added together.

| Stage | p50 | p95 |
|---|---|---|
| Bare Node process, through exit | 31.7 | 40.4 |
| Import built store module, new process | 250.8 | 272.7 |
| Create an empty store and migrate it | 64.6 | 102.3 |
| Reopen an existing empty store | 8.4 | 13.7 |
| Open e5-small, including runtime import | 1439.7 | 3019.8 |
| First query embedding | 49.4 | 71.8 |
| Second query embedding | 12.9 | 23.2 |
| Whole model worker, through exit | 1892.3 | 3527.3 |

## What this shows

Model opening dominates the measured work: about 1.44 seconds at the median, versus 8.4 ms to reopen the empty
store and 31.7 ms for a bare Node process. Importing the store module costs about 251 ms in a new process.
A second query embedding takes about 13 ms. Keeping a model in a long-lived process is the next experiment;
cli-core already has `warmEmbedders`, but this run does not establish whether memo and drive use it on every path.
A store-opening optimization alone cannot recover the model-loading time measured here.

## Limits

This is a component benchmark, not an end-to-end memo or drive search. It does not measure CLI module loading,
profile resolution, real-store size or indexes, vector lookup, ranking, result rendering, MCP routing, other models,
network requests or the effect of an idle model cache. The earlier 1.2–2.4 second user report is motivation, not
reproduced evidence. Next, compare those tools through a long-lived MCP process and one-shot CLI calls on the same
synthetic corpus before changing their lifecycle.
