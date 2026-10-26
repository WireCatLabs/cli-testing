# Reranker speed in Core: where the seconds go, and why batching is not the fix

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
