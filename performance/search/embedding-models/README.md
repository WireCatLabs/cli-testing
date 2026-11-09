# A third, larger local embedding model: does e5-large run, and how fast

**Why it was run.** The owner downloaded EmbeddingGemma and wanted to choose between about three model sizes, in the
CLIs and later in the desktop app. cli-core shipped e5-small (small) and EmbeddingGemma (medium), and needed a large
one with a permissive licence that its ONNX runtime runs as it is. The question: does multilingual-e5-large, 8-bit,
download with the hashes pinned in the catalogue, give vectors of the right length, and how fast is it? The answer
set `chunksPerSecond` for `e5-large` in cli-core's catalogue
([WireCatLabs/cli-core#2608](https://github.com/WireCatLabs/cli-core/pull/2608)), which `models set` uses for its
time estimate and memo for the size of a sync's batch.

Qwen3-Embedding-0.6B was not tried: it needs last-token pooling, which the runtime's embedder does not have.

## Setup

- 2026-11-07. A Ryzen AI 9 HX 470 laptop, Linux, Node 24, native ONNX Runtime 1.30.0, one session with 8 threads.
  Other benchmarks ran on the machine at the same time, so the speed is a lower bound.
- `Xenova/multilingual-e5-large` at commit `00fc3aeb3dbb95842de2ac1961d33c6319acf57b`: `onnx/model_quantized.onnx`
  (561,768,762 bytes), `tokenizer.json`, `tokenizer_config.json`; MIT, like `intfloat/multilingual-e5-large`.
- Synthetic text only: 20 passages of one Russian sentence about a supplier meeting repeated to about 1,100 characters
  (near the 300-token chunk the catalogue's speeds are given for), one query, one related and one unrelated passage.
- Command, from this folder, with cli-core built:

```sh
node check-e5-large.mjs /path/to/cli-core "$(mktemp -d)"
```

## Results

| Check | Result |
| --- | --- |
| Download through `downloadTextModel`, each file's sha256 against the catalogue | all three match |
| Vector length | 1024 |
| Speed, 20 chunks of about 1,100 characters | 3.37 chunks a second |
| Cosine, query to related passage / to unrelated passage | 0.850 / 0.773 |

## What it showed

e5-large runs unchanged in cli-core's embedder: mean pooling, the `query: ` and `passage: ` prefixes, 512 tokens.
It is about eight times slower than e5-small's measured 31 chunks a second. The catalogue says 4.

Its cosines sit in a narrow band, as e5-small's do: an unrelated passage still scores 0.77. e5-small has a measured
floor of 0.8 below which a meaning hit is dropped. e5-large has none yet, so it keeps every hit.

## Not measured

- Search quality against e5-small and EmbeddingGemma on the search-quality fixtures, and so a floor for e5-large.
- Speed on an idle machine, on other processors, and under Bun or WebAssembly.
- Memory while it runs.
