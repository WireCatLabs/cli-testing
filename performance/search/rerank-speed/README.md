# Reranker speed in Core: where the seconds go, batching, and the native runtime

## Why this was run

Core 0.435.0 made `search messages --discover` read its top 50 hits with the mMARCO reranker by default
(WireCatLabs/cli-core#2011). On the owner's archive, one command-line call went from about 2 s to 5–8 s.
The question: which step costs the time, and does scoring the 50 pairs in batches (one model run for many
pairs, instead of one run per pair) remove it? The answer decides how the next speed-up is done.

## Setup

- Machine: 24 cores, Linux, Node 24; load average 5–7 while the benchmark ran, other work on the machine.
- Core 0.435.0 as published, models from Core's own download: `e5-small` and `mmarco`
  (`onnx/model_quint8_avx2.onnx`, 8-bit), both run through onnxruntime's WebAssembly build, 8 threads.
- Text: synthetic Russian words (no real messages), an 8-word question. "Mixed" = 50 passages of 10 to 250 words.
- Command: `node bench.mjs <path to @wirecat/cli-core>`, three runs; raw output in [results.jsonl](results.jsonl).
- A real-archive timing (the owner's six known questions, totals only) was run beside it with installed max 0.78.0.

## Results

### On the owner's archive (totals only, medians of 12 calls, load average 6–16)

| Command | Median | Difference |
| --- | ---: | --- |
| `search messages …` (words only) | 0.8 s | |
| `… --discover`, reranker off | 1.9 s | +1.1 s: load e5, meaning search, loose word search, replies |
| `… --discover` (default) | 5.1 s | +3.2 s: load mMARCO, score 50 pairs |

### Models alone (synthetic text, three runs)

| Step | Time |
| --- | ---: |
| Load e5 | 0.9–1.2 s |
| Embed the question | 40 ms |
| Load mMARCO | 0.6–0.7 s |
| Score 50 pairs one by one, 40-word passages | 0.85–0.97 s |
| … 120-word passages | 1.6–2.0 s |
| … 300-word passages | 3.5–3.7 s |

### Batching (50 mixed passages, first run; the other runs agree)

| Scoring | Time | Largest score change against one-by-one |
| --- | ---: | ---: |
| One by one | 1.54 s | — |
| Batches of 5, in arrival order | 2.12 s | 0.78 |
| Batches of 5, sorted by length | 1.33 s | 1.01 |
| Batches of 10, sorted by length | 1.41 s | 1.17 |
| Batches of 25, sorted by length | 1.72 s | 1.34 |
| One batch of 50 | 2.37 s | 0.85 |

The same pair scored three ways: alone 0.043; alone but padded to 200 tokens 0.477; beside one other pair 0.342.

## What it showed

- **The reranker is most of the added time**, and scoring costs more than loading: 50 pairs scale with their
  length, and Core's input (chat, author, date, the parent message) makes passages longer than the message.
- **Batching saves at most ~15%** (sorted batches of 5), and is slower when passages of different lengths share a
  batch: every pair is padded to the longest one, and WebAssembly does the padding's work too.
- **Batching changes the scores.** With the 8-bit model a pair's score depends on its padding and its neighbours
  in the batch, by up to 1.3 (logit units) here. Probably because the quantized model sets its 8-bit range from
  the whole input of each run (dynamic quantization), so other pairs move it. The ranking would then depend on which
  hits happen to share a batch. Core keeps scoring one pair per run.
- The remaining options are elsewhere: native onnxruntime instead of WebAssembly (the Python harness scored 50
  pairs in about 0.2 s natively against 0.9–1.7 s in WebAssembly, [evidence pipeline, "In Core"](../evidence-pipeline/README.md)), keeping the model loaded
  between calls (as the MCP server already does), or fewer than 50 pairs.

## Not measured

- Native onnxruntime in Node, and whether its batched scores have the same dependence.
- A non-quantized (fp32) mMARCO, which should not depend on batch neighbours, at its larger size and slower speed.
- BGE reranker (the opt-in setting); quality effects of fewer pairs.

## Native runtime (onnxruntime-node) instead of WebAssembly

### Why

Batching was ruled out above. The owner asked to test the remaining large option properly: run Core's models
through ONNX Runtime's native Node package instead of its WebAssembly build. The questions: how much faster is a
real `--discover`, do the answers change, and can every platform Core supports run it?

### Setup

- onnxruntime-node 1.30.0 (the same ONNX Runtime version as Core's WebAssembly package), the same model files.
- Synthetic, same process shape: [runtime.mjs](runtime.mjs) loads e5 and mMARCO in a fresh process per runtime and
  thread count; [compare.py](compare.py) runs it three times each ([runtime-results.json](runtime-results.json)).
- Realistic synthetic pairs: the [evidence pipeline](../evidence-pipeline/README.md)'s 9 holdout questions × 50
  units with graded answers. [python_native.py](python_native.py) scores them with Python's ONNX Runtime (1.23.2, as
  in the evidence pipeline), [pairs.mjs](pairs.mjs) with Core's WebAssembly and with onnxruntime-node,
  [agreement.py](agreement.py) compares ([holdout-timing.json](holdout-timing.json),
  [holdout-agreement.json](holdout-agreement.json)).
- Real `--discover`: max-cli main with cli-core v0.439.0, patched only to load onnxruntime-node when an environment
  variable says so (not merged), on a copy of the owner's store in a temporary home; the six known questions × 3
  runs × {WebAssembly, native} × {reranker on, off}. Totals only; per-question rows stay private.
- Platforms: the package's binaries listed and loaded; Alpine checked in `node:24-alpine`; Bun 1.3.14.

### Results

Real `--discover` on the owner's archive (median of 18 calls, load average 2–5):

| | WebAssembly | Native | Saved |
| --- | ---: | ---: | ---: |
| `--discover`, reranker off (e5 only) | 1.66 s | 1.30 s | 0.36 s |
| `--discover` (default, mMARCO) | 4.58 s | 3.20 s | 1.38 s (30%) |
| Reranker's share | 2.92 s | 1.90 s | |
| Questions with a direct answer in the top 5 | 6 of 6 | 6 of 6 | |
| Same top-5 hits (of 30) | | 29 | |

Inside one native call (CPU profile): scoring the 50 pairs ~1.4 s (WebAssembly ~2.6 s), each tokenizer ~0.3 s
to load (17 MB of JSON, the same in both runtimes), garbage collection ~0.35 s. The real pairs are long: median 153
tokens, 75th percentile 428, 90th 762; 43 of 282 pairs are cut at the model's 512. The synthetic holdout's median
is 48 tokens, which is why the Python harness's "~0.2 s for 50 pairs" did not carry over.

Same pairs, one pair per run (holdout, 50 pairs per question, medians):

| Runtime | Threads | Load | 50 pairs |
| --- | ---: | ---: | ---: |
| Core's WebAssembly | 8 | 0.51 s | 0.60 s |
| onnxruntime-node | 4 | 0.18 s | 0.25 s |
| onnxruntime-node | 8 | 0.17 s | 0.30 s |
| Python ONNX Runtime 1.23.2 | 4 | 0.19 s | 0.17 s |

Agreement on the holdout: Spearman 0.96–0.98 between any two runtimes; a graded answer in the reranker's own top
3 for 7 of 9 questions in all three. The same pair can score differently across runtimes (by up to ~0.8 logits), so
the order of near-ties moves; the answers found do not.

Synthetic text (300-word passages, 50 pairs): WebAssembly 3.3–3.7 s, native 1.5–1.7 s; e5 loads in 0.5 s natively
against 0.9–1.2 s; peak memory 1.1 GB against 1.7 GB.

Platforms in onnxruntime-node 1.30.0 (288 MB unpacked, all platforms in one package):

| Platform | Native library | Size |
| --- | --- | ---: |
| Linux x64, glibc ≥ 2.28 | yes | 46 MB |
| Linux arm64, glibc ≥ 2.28 | yes | 25 MB |
| macOS arm64 | yes | 45 MB |
| macOS x64 (Intel) | **no** | |
| Windows x64 / arm64 | yes (plus optional DirectML) | 29 / 30 MB |
| Linux musl (Alpine) | **no**: fails to load (`ld-linux-x86-64.so.2` missing) | |
| Bun 1.3.14 | works, same scores | |

### What it showed

- **Native saves about 1.4 s of 4.6 s (30%)** on a real `--discover`, with the same answers. It is 2–2.5× faster
  per pair, not the 4–10× the earlier short-text comparisons suggested.
- **Even native, the reranker costs ~1.9 s**: long inputs (with the parent message) dominate. Shorter input per pair
  and faster tokenizer loading are the next levers, independent of the runtime; neither was measured for quality.
- **WebAssembly must stay** as the fallback for Alpine and Intel Macs, so native would be an addition: per-platform
  packages like `@wirecat/cli-core-sqlite`, 25–46 MB each, with a load failure falling back to WebAssembly.
- Four threads are as fast as eight for one pair at a time.

### Not measured

- A per-platform repackaging of the native library, its install size and its CI.
- Windows, macOS and Linux arm64 at run time (only the files were listed). Since cli-core 0.451.0 the `Native runtime`
  workflow runs two tiny models natively on each of them; speed there is still not measured.
- Quality with a shorter input cap (256 tokens) and with the parent left out.
- The MCP server, where models stay loaded and only scoring would get faster.

## Picture models (CLIP) on the native runtime

### Why

Core 0.448.0 moved text models and the reranker to the native runtime; picture models stayed on WebAssembly because
nobody had checked them natively. The question: are CLIP vectors from the native runtime close enough to
WebAssembly's that pictures embedded before still match, and is it faster? It decided cli-core#2075 (0.451.0).

### Setup

Same machine, load average about 2. [picture.mjs](picture.mjs) with a built cli-core 0.452.0 checkout and clip-b32:
12 synthetic pictures (plain coloured shapes, 320×240) and 5 short text queries, 4 threads, two runs per runtime,
`WIRECAT_STATE_DIR` pointing at a folder with the native library (native) or with only the model (WebAssembly).

### Results

| runtime | 12 pictures | 5 queries |
| --- | --- | --- |
| native, run 1 (first load) | 769 ms | 137 ms |
| native, run 2 | 375 ms | 122 ms |
| WebAssembly, runs 1–2 | 809–842 ms | 182–197 ms |

Cosine similarity native vs WebAssembly, lowest of each set: pictures 0.9916, queries 0.9996.

### What it showed

Native is about 2× faster for pictures once loaded. At cosine 0.99 or more, a picture embedded through WebAssembly
should still match the same queries; that was not checked on a labelled set. A cold first run is about as slow as WebAssembly.

### Not measured

Real photos, SigLIP2, Windows and macOS, and search quality on a labelled set.

## Reranker input: how much of the replied-to message

### Why

On real archives the reranker's pairs are long — median 153 tokens, 90th percentile 762 — because Core gives it the
hit with the message it replies to, parent first, cut at the model's 512 tokens from the end. With a long parent
the hit itself fell outside the window. The question: which shorter input keeps the answers and saves time? The
synthetic evidence-pipeline corpus cannot answer it: none of its pairs is longer than 256 tokens (median 38).

### Setup

The six known questions on one real chat (totals only; queries and per-question rows stay private), max-cli with
cli-core v0.439.0 patched only to switch the input form and the token cap by environment variables (not merged),
native runtime, a copy of the owner's store, two runs. The machine was loaded by other work (load average 15–26), so
the comparison is CPU time per call (all threads), not wall time. Answers graded with earlier judgments; hits no
earlier method returned are "not graded".

### Results

| Input | Direct answer in top 5 | Direct / background / off / not graded | Top 5 shared with current (of 30) | CPU per call |
| --- | ---: | --- | ---: | ---: |
| Parent then hit, cut at 512 tokens (current) | 6 / 6 | 9 / 15 / 6 / 0 | 30 | 27.1 s |
| Cut at 256 tokens | 6 / 6 | 9 / 14 / 5 / 2 | 27 | 16.3 s |
| Cut at 128 tokens | 6 / 6 | 9 / 15 / 4 / 2 | 24 | 12.9 s |
| Hit then parent | 6 / 6 | 10 / 15 / 5 / 0 | 29 | 22.6 s |
| Hit then parent, 256 tokens | 6 / 6 | 10 / 14 / 4 / 2 | 26 | 15.5 s |
| **Parent cut to 300 characters, then hit** | **6 / 6** | **10 / 16 / 4 / 0** | 27 | **16.0 s** |
| Parent cut to 300 characters, 256 tokens | 6 / 6 | 10 / 15 / 3 / 2 | 24 | 15.3 s |
| No parent | 5 / 6 | 10 / 13 / 6 / 1 | 22 | 14.9 s |
| No parent, 256 tokens | 5 / 6 | 10 / 14 / 4 / 2 | 20 | 16.9 s |

In 18 of the 119 pairs with a parent, the parent alone was longer than ~512 tokens: the reranker never saw the hit.

### What it showed

- **The parent is needed**: without it one question lost its answer.
- **Cutting the parent to 300 characters kept every answer**, fixed the hidden-hit case and cost about 40% less CPU.
  Core does that from its next release (WireCatLabs/cli-core#2053, merged).
- Six questions on one chat is a small sample; a synthetic set with long messages and replies would test it better.
  That set now exists: on it, cutting to 256 tokens lost 3 of 33 answers and 128 lost 6, so Core keeps 512
  ([long messages](../evidence-pipeline/README.md#cancelled-decisions-and-long-messages)).

### Release check

The released change (parent cut) together with the native runtime (WireCatLabs/cli-core#2058), in max on the store
copy, six questions × 2: native library loaded on 12 of 12 calls; direct answer in the top 5 for 6 of 6 with native
and with WebAssembly; 29 of 30 hits shared; CPU per call 22 s native against 45 s WebAssembly (load average 17, wall
times not comparable).

## Released: max 0.81.0 on cli-core 0.448.0

The owner's archive, the six known questions × 2, installed `max` 0.81.0 (cli-core 0.448.0: the parent cut and the
native runtime), load average 1–6, 2026-10-26 22:50 UTC. WebAssembly by hiding the runtime folder for that run.

| | WebAssembly | Native |
| --- | ---: | ---: |
| Word search | 0.66 s | 0.66 s |
| `--discover`, reranker off | 1.54 s | 1.28 s |
| `--discover` (default) | 4.10 s | **2.91 s** |

Before both changes (max 0.78.0, WebAssembly, whole parent) the same calls were 0.8 / 1.9 / 5.1 s at load average
6–16 — not the same load, so only a rough baseline.


## How to repeat

Synthetic runs need only this folder and a built `@wirecat/cli-core`:

- Models and batching: `node bench.mjs <path to @wirecat/cli-core>`.
- WebAssembly against native: `python compare.py <cli-core dir> <node_modules with onnxruntime-node> <out.json>`,
  which runs [runtime.mjs](runtime.mjs) three times per runtime.
- Holdout pairs: `python python_native.py <evidence-pipeline dir> <mmarco dir> <threads> <out.json>`, then
  `node pairs.mjs <cli-core dir> <node_modules> <wasm|native> <threads> <pairs file> <out.json>` for each runtime,
  then `python agreement.py <python.json> <wasm.json> <native.json>`. The pairs come from the
  [evidence pipeline](../evidence-pipeline/README.md)'s holdout questions.
- Picture models: `WIRECAT_STATE_DIR=<dir> node picture.mjs <built cli-core checkout> install|native|wasm <out.json>`;
  the file's header explains the two folders.

Runs on a real archive (the native runtime on `--discover`, the reranker input) also need:

- **A Core build with the bench switches.** Branch `bench/rerank-input` in WireCatLabs/cli-core (never merged) adds
  environment variables to Core's reranker:
  - `WIRECAT_BENCH_PAIR` picks the input form: `parent-first`, `hit-first`, `parent-300` (the released one) or
    `no-parent`;
  - `WIRECAT_BENCH_RERANK_TOKENS` replaces the 512-token cap;
  - `WIRECAT_BENCH_TOKENS=1` prints each pair's lengths (`bench-pair`, `bench-tokens`) on stderr.

  Build max-cli against that branch. The native runtime is in Core since 0.451.0, so the older
  `WIRECAT_BENCH_ONNX_NATIVE` switch is not needed. The original runs used cli-core v0.439.0, where the default form
  was `parent-first`.
- **A copy of the store in a temporary home.** Copy max's config folder there, and copy the store database with
  SQLite's `.backup`, never by copying the open file. The runs are `--offline` and need no sign-in. Pass the runner
  only `PATH` and `HOME`, so the copy cannot reach the system keyring.
- **The questions and the earlier grades.** They are private, together with the runners that keep only totals:
  `tools/context-gathering/pmed-discover-native-v1.py` and `pmed-rerank-input-v1.py` in the owner's private
  repository.
