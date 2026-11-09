# Batched local embedding in memo (9 November 2026)

## Why

The [model comparison](../model-comparison/README.md) embedded LifeBench with EmbeddingGemma in 3,061 s unsorted
and in 688 s with the records sorted by length, because fastembed runs 16 to 32 texts at a time and pads each batch
to its longest text. The question was whether memo's indexing gains the same way.

It does not have that waste to remove. cli-core's local embedder (`src/embeddings/embed.ts`, `openEmbedder`) runs
one text per `session.run`, so nothing is padded and sorting alone changes nothing. The real question became the
one the cli-core backlog asks as CORE-22: would real batches (padding with an attention mask, then sorting by
length) be worth building? The bar set before measuring: at least 1.5 times faster, and every batched vector within
cosine 0.9999 of the one-at-a-time vector.

## Setup

- Linux x64, 24 cores, 30 GB RAM; 8 threads (memo's `min(8, cores)`); cli-core's native ONNX Runtime 1.30.0; Bun.
- Models as memo downloads them: e5-small (`model_quantized.onnx`, 8-bit) and EmbeddingGemma 300M (`model_q4.onnx`).
- Synthetic texts only, from a fixed seed in `bench.ts`: half short chat lines (20 to 200 characters), 30% notes
  (200 to 1,000), 20% emails (1,000 to 6,000), English and Russian words mixed.
- `bench.ts` loads the model through cli-core's own `loadModel` and embeds the texts either one per run (`--batch 0`,
  memo's way) or sorted by token count and run in batches, right-padded with the tokenizer's pad token and masked.
  e5's mean skips the padded positions; Gemma's pooling is inside its ONNX graph.

```sh
bun bench.ts --cli-core <cli-core checkout> --model embeddinggemma --batch 16 --texts 300 --out g16.f32
bun bench.ts --compare g0.f32 g16.f32 --dims 768
```

Peak RAM is `/usr/bin/time -f %M` of each run. `sweep.sh` runs the full set on 2,000 texts.

## Results (300 texts)

| Model | One text a run | Batched, sorted | Speedup | Peak RAM, one → batched | Lowest cosine | Below 0.9999 |
| --- | --- | --- | --- | --- | --- | --- |
| e5-small | 5.6 s | 4.8 s (batch 32) | 1.17× | 1.0 → 2.0 GB | 0.9963 | 300 of 300 |
| EmbeddingGemma | 70.8 s | 46.4 s (batch 16) | 1.53× | 1.0 → 1.75 GB | 0.99963 | 5 of 300 |

From the 2,000-text sweep only one run finished: e5-small, one text a run, 29.2 s, 1.4 GB peak.

## What it showed

- **Both models fail the bar**: batching changes the vectors beyond cosine 0.9999, and e5-small gains only 1.17×.
  Not built; the decision is recorded in cli-core's backlog note CORE-22.
- **The vectors move with the batch.** I think the quantized model files cause it (8-bit activations for e5, 4-bit
  weights for Gemma, whose arithmetic depends on the whole batch); not verified.
- **The pilot flatters batching.** It sorted all 300 texts at once. memo hands its model 8 texts per call (notes and
  conversations alike), so shipping it also means fetching larger groups, and the gain would be lower than 1.53×.

## Not measured

- The 2,000-text sweep (`sweep.sh`): stopped by the machine running short of memory while other benchmarks ran,
  after its first run; not repeated, since the pilot already fails the bar.
- Sorting within memo's real fetch of 8, or of 128; batch sizes other than 16 and 32 per model.
- Whether search results change: only vector distance was compared.
- More sessions over all cores, the backlog's other CORE-22 option.
