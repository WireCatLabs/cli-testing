# How search models work, what they cost, and what we should test

Our best tested ranking model improves search quality on the synthetic benchmark, but the current
implementation takes several seconds to examine 300 messages. We should first make that same
model run more efficiently, then compare smaller or differently structured models. A newer model
is a candidate to test; its release date does not tell us whether it is faster or better here.

This document explains the choices from the beginning. [The benchmark](message-search/README.md)
contains the recorded evidence; [the technical research](combined-search-model-research.md)
contains the wider shortlist. Only e5-small and the current multilingual MiniLM reranker have been
used in our ranking experiments. We have not downloaded the proposed alternatives or called Jev.

## 1. A concrete search example

Imagine that you ask: **“What retention period did Aurora agree to?”** The archive contains:

| Message | Meaning for your question |
|---|---|
| “Aurora retention: agreed on 30 days.” | The actual answer |
| “Mira owns the Aurora retention rollout.” | Useful supporting information |
| “Aurora retention: should we choose 7 or 30 days?” | An unanswered proposal |
| “Aurora retention discussion moved to Friday.” | Same topic, no answer |
| Hundreds of similar reminders and drafts | Mostly noise |

A word index can quickly find messages containing “Aurora” and “retention”. It does not reliably
understand the difference between an agreed decision, a proposal and a reminder. In our synthetic
archive, many newer distractors contain the same words as the older answer.

We therefore split the work into two stages:

```mermaid
flowchart LR
  A[Your query] --> B[Retrieve possible messages]
  B --> C[Up to 300 candidates]
  C --> D[Model scores relevance]
  D --> E[Sort and return top 10]
```

A **candidate** is a message admitted to the shortlist. It is not a promise that the message is
useful. **Scoring** means computing a number for a query-message combination. **Reranking** means
sorting the shortlist by those new scores. Neither operation discovers messages outside that list.

In the question experiment we supplied topic words manually to retrieve the shortlist, then gave
the complete question to the model. Direct retrieval using the full question currently finds no
candidates in that diagnostic. Its good ranking results therefore do not establish a working
end-to-end natural-language search.

## 2. What a model actually is

A model is a program with learned numeric weights. Training produced those weights elsewhere;
we download them and use them to calculate outputs. That calculation is **inference**. We are
not training a model on the owner's messages during these experiments.

The model's **tokenizer** converts text into numbered pieces called tokens. A token may be a word,
part of a word or punctuation. The runtime executes the model's operations on those numbers.
The result can be a vector, a relevance score or a classification such as “answer” or “support”.

Our reranker produces a number. It does not write an answer word by word. Consequently, removing
text generation is not by itself a speed improvement over what we already do.

There are three separate components to install or load:

| Component | What it does |
|---|---|
| Weights | The learned numbers that determine model behaviour |
| Tokenizer and configuration | Turn text into model inputs; describe the model and outputs |
| Runtime | Executes the calculations, using CPU, GPU or another backend |

Changing the runtime can change speed without changing the model's learned weights. Changing the
weights can change ranking quality even if the runtime stays the same.

## 3. The main ways to calculate relevance

### Separate vectors: a bi-encoder

A **bi-encoder** reads the message on its own and converts it into a vector: a fixed-length list
of numbers representing its meaning. It does the same for the query. We compare the two vectors,
usually with cosine similarity, to estimate how closely their meanings match.

Message vectors can be calculated when messages are indexed and reused for later queries. At
search time, the model needs to encode the new query; comparing its vector with existing vectors
is relatively cheap. This makes bi-encoders useful for finding candidates across a large archive.

The limitation is that each side was encoded independently. General topic similarity may put a
retention reminder close to a retention decision, even though only one answers the question.
Our tested multilingual **e5-small** cosine reranking made the dev keyword rankings worse. That
rejects this particular final-ranking experiment. We have not tested whether its vectors improve
candidate retrieval, so that separate use remains an open question.

### Read the pair together: a cross-encoder

A **cross-encoder** receives both pieces of text in one input:

```text
Query:   What retention period did Aurora agree to?
Message: Aurora retention: agreed on 30 days.
Output:  a relevance score
```

Because the model reads them together, it can compare details of the question and message directly.
This is the method that improved our results. The tested model is
[mmarco-mMiniLMv2-L12-H384-v1](https://huggingface.co/cross-encoder/mmarco-mMiniLMv2-L12-H384-v1).
Its long name identifies a multilingual MiniLM model trained for ranking. We use a pinned,
quantized ONNX export; its input limit is 512 tokens for the query and message together.

The cost is repeated computation. With 300 candidates, our current adapter calls the model 300
times, once for each query-message pair. When the query changes, even a previously seen message
must be scored again. A score for an identical pair can be cached, but the message alone has no
reusable independent representation in this adapter.

The output is a **raw logit**: a number used to order candidates. A score of 2 does not mean
2 percent, 20 percent or “definitely relevant”. Different models have different score scales.
The question diagnostic's threshold of 2 was selected on dev data for that model and dataset;
it is not a universal confidence threshold.

These two architectures are standard in
[retrieve-and-rerank systems](https://sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html).

### Read several candidates together: listwise ranking

A **listwise** model receives a query and several messages together. It can share some calculation
across that group and compare messages within the same input. This could reduce the repetition
of 300 separate pair calls.

It still has to process all the supplied text. A long list may exceed its input limit, require
several batches or consume substantial RAM. Ranking can also depend on which other messages are
in the list and their order, so we must test those effects.

[Jina reranker v3.5](https://huggingface.co/jinaai/jina-reranker-v3.5) is a modern example to research.
It is much larger than our current weight file, and its published GPU speed comparisons do not
predict our CPU speed. Its weights use a noncommercial license, which matters when selecting a
model for a product. We have not run it.

### Precompute richer message representations: late interaction

**Late interaction**, such as ColBERT, keeps a vector for multiple tokens in each message rather
than one vector for the entire message. At search time it compares the query's token vectors
with those stored message vectors. This preserves finer matching while moving message encoding
out of the interactive query path.

The tradeoff is a larger search index and more work when messages are added or changed. Permissions,
filters, index freshness and reindexing also need implementation. This is a search architecture
change, rather than swapping one small reranker file. Our failed e5 cosine experiment did not test
this approach. See the [Answer.AI ColBERT example](https://huggingface.co/answerdotai/answerai-colbert-small-v1).

## 4. Where Jev and the “System One” models fit

The [Jev introduction](https://typesafe.ai/blog/introducing-system-one-models-and-jev) describes
models for quick, structured decisions over shared information. Instead of generating a long
paragraph, a model can choose an option or return another defined output type. Its
[official documentation](https://docs.typesafe.ai/models) describes a hosted API, shared state and
parallel questions. We did not find public local weights or a published local RAM footprint there.

For our task, the interesting question is whether a model could read a few finalists and return:

```text
Message A: direct answer
Message B: useful support
Message C: proposal, not a settled decision
No supplied message contains the requested fact: yes / no
```

That is different from merely assigning relative relevance scores. A forced choice among messages
can select a bad message when every option is bad. An explicit “none” option, and tests for missing
facts and contradictions, are essential to evaluate whether this decision helps.

Two open projects worth distinguishing:

- **[Laya](https://github.com/NandhaKishorM/laya)** offers typed decisions and a multilingual
  checkpoint. It is a possible experiment for classifying a few finalists. Its approximately
  644 MB weights and published GPU timing do not establish fast CPU search here.
- **[Kev](https://github.com/jaredpalmer/kev)** uses shared-state decisions. The smallest
  [Kev-0.8B model](https://huggingface.co/jaredpalmer/kev-0.8b) is described as English-only and
  requires a base model as well as its adapter. The small adapter download is not the whole model.

“Open” does not mean equally small, equally multilingual or equally easy to run in our TypeScript
CPU environment. These are candidates for separate experiments, not demonstrated replacements.
Valid output types also do not guarantee correct judgments.

## 5. Why the current scoring takes 3–4 seconds

The benchmark adapter uses the existing ONNX **WebAssembly** runtime on CPU with eight threads.
It tokenizes and scores one pair at a time. In our resource probe, loading took about 1.27 seconds
and scoring 300 short pairs took about 3.25 seconds, or roughly 10.8 ms per pair on average.
The broader ranking runs observed approximately 10–12 ms per pair.

```text
300 pairs × about 11 milliseconds = about 3.3 seconds of scoring
```

That is model inference, separate from retrieving the SQLite candidates. Loading is a further
cost in a new process. Keeping a model loaded can remove repeated loading, but a new query still
requires fresh pair scores. Returning only three messages after scoring all 300 does not save
inference time.

The following changes deserve measurement:

| Change | Why it might help | What must be checked |
|---|---|---|
| Native CPU runtime | Different execution engine and kernels | Same rankings, runtime support, memory and latency |
| Batched pairs | Process several pairs together rather than making one call each | Export supports batches; padding, memory and actual throughput |
| Keep the model loaded | Avoid paying load cost per request | Idle memory, concurrent requests and lifecycle |
| Cheap first ranker, strong model on fewer finalists | Fewer expensive pair evaluations | Relevant answers survive the cheap stage |
| Smaller model | Less calculation per pair | English and Russian quality, not size alone |
| Listwise model | Share work across several candidates | Input limits, order effects, list merging and RAM |
| Late-interaction index | Precompute message-side neural work | Index size, build/update cost and retrieval quality |

We cannot promise a speedup from any row without running it. Batching is not the same as simply
starting many independent calls concurrently; that can increase contention and memory use.
Vendor GPU milliseconds are not measurements on this Linux CPU.

## 6. What model size means: parameters, disk and RAM

**Parameters** are learned numbers. “0.6B” means about 600 million parameters; “322M” means about
322 million. These are counts, not file sizes. The number of bytes per weight depends on precision:

| Weight format | Approximate bytes per weight | 600 million weights, before overhead |
|---|---|---|
| FP32 | 4 | 2.4 GB |
| FP16 or BF16 | 2 | 1.2 GB |
| INT8 | 1 | 600 MB |
| 4-bit quantization | About 0.5, plus metadata | About 300 MB, plus overhead |

Quantization stores numbers with less precision. It can reduce downloads and sometimes improve
speed, but quality and runtime support must be checked. Not every checkpoint has every format.
An ONNX file is an execution format, not a guarantee that its weights are quantized.

**Disk size** is the downloaded files. **RAM** is memory occupied while running. RAM also includes
text/tokenizer objects, runtime state, workers, intermediate calculations and other application
objects. A 136 MB download can therefore use much more than 136 MB of RAM.

For the model we actually ran:

| Measurement | Recorded value |
|---|---|
| Quantized ONNX weight file | 118.6 MB |
| Weights plus tokenizer/config files | 135.7 MB total, about 129.4 MiB |
| Whole Node process before loading | About 70 MB resident RAM |
| Whole process after loading | About 1.06 GB resident RAM |
| Peak resident RAM in the 300-pair probe | About 1.33 GB, or 1.24 GiB |
| Load time in that probe | About 1.27 seconds |
| Scoring time for 300 short pairs | About 3.25 seconds |

These are observations from [resources.json](message-search/resources.json), not a model-only RAM
breakdown or a maximum for longer inputs, batches or multiple simultaneous searches. We have not
measured RAM for the alternatives. Decimal MB/GB and binary MiB/GiB are different units.

Here is a practical shortlist, with **selected weight files**, excluding other assets unless stated:

| Model | Download footprint | Why we might test it |
|---|---|---|
| Current multilingual MiniLM | 135.7 MB including tokenizer/config | Known quality baseline; optimize runtime first |
| TinyBERT-L2 | About 4.5 MB INT8 weights | Very small English speed control; not a Russian replacement |
| MiniLM-L6 | About 23.2 MB INT8 weights | Another English CPU speed/quality control |
| GTE multilingual reranker | About 612 MB FP16 weights | Russian-capable, permissive multilingual ranking comparator |
| Qwen3 reranker 0.6B | About 1.19 GB BF16 weights | Multilingual quality comparator; larger CPU cost is possible |
| Jina v3.5 | About 1.19 GB BF16; about 397 MB Q4 weights plus projector | Listwise architecture experiment; noncommercial weight license |
| Laya multilingual | About 644 MB weights | Structured decisions over finalists |
| Kev 0.8B | About 1.75 GB base plus about 43 MB adapter and a head | Shared-state reference; smallest model is English-only |

The [research table](combined-search-model-research.md#ranking-model-shortlist) links publisher
checkpoints and licenses. These are different models and file formats, so the size column alone
cannot fairly rank their performance. RAM and download totals for untested alternatives remain
unknown until we choose and inspect their complete runtime assets.

## 7. Downloading, loading, indexing and searching are different costs

1. **Download once:** fetch the chosen, pinned weights and tokenizer into an explicit cache.
2. **Verify:** check their SHA-256 hashes against the manifest.
3. **Load per process/session:** initialise tokenizer and runtime and load the weights into memory.
4. **Prepare an index when needed:** lexical indexes, or message vectors for vector-based retrieval.
5. **Search repeatedly:** retrieve candidates and calculate query-dependent scores.

Cross-encoder scores depend on the query, so indexing messages cannot precompute all future pair
scores. Bi-encoder and late-interaction message representations can be precomputed, with separate
storage and update costs.

Our preparation script downloads only four files pinned by
[reranker.json](message-search/reranker.json). It verifies existing files and reuses them, writes
new downloads as partial files first, and checks hashes before accepting them. It does not clone
all the alternative precision files in the publisher's repository. Benchmark inference is offline.

From the cli-testing root, using an explicitly selected, built cli-messaging checkout:

```sh
export SEARCH_MESSAGING_ROOT=/absolute/path/to/cli-messaging-checkout
python3 performance/search/message-search/prepare-reranker.py /tmp/message-search-reranker-1427fd6
MESSAGE_RERANKER_DIR=/tmp/message-search-reranker-1427fd6 \
  python3 performance/search/run.py --messaging-root "$SEARCH_MESSAGING_ROOT" resources > /tmp/search-resources-new.json
```

The complete current download is 135.7 MB. Transfer time is approximately
`file bytes × 8 / connection bits per second`:

| Sustained download rate | Transfer time for 135.7 MB |
|---|---|
| 10 Mbit/s | About 109 seconds |
| 20 Mbit/s | About 54 seconds |
| 100 Mbit/s | About 11 seconds |

Add connection setup, server delays and verification. These are estimates; we did not time the
original download. A 1.2 GB weight file takes about eight minutes at 20 Mbit/s before overhead.
Download time does not recur for every search when verified cached files are reused.

## 8. How we should use the 300 candidates differently

On dev, the current 300-message pool contains an average **90 percent of the labelled relevant
messages**. This does not mean 270 of those messages are relevant. Most candidates are distractors;
there are usually only two labelled relevant messages for a query.

The current first 50 candidates contain only 43.75 percent of the labelled evidence. Therefore,
cutting the pool to 50 before improving the first ranking stage loses answers. A stronger model
cannot restore messages that were removed. Paraphrases have no relevant lexical candidates even
at 300, so they need a candidate-generation improvement rather than only a new reranker.

A useful experiment sequence is:

1. **Hold retrieval and weights fixed; optimise execution.** Compare native and batched inference
   with the existing scores/rankings. Measure cold load, warm scoring, full-query latency and RAM.
2. **Try a cheap-to-strong cascade.** Retrieve 300, rank cheaply, then apply the stronger model to
   perhaps 20 or 50 finalists. Measure answer/evidence recall at the shortlist before measuring
   the final top ten. Include an English speed control and a Russian-capable comparator.
3. **Try a finalist decision model.** On the best few messages, classify answer/support/none.
   Test whether this improves actual-answer ranking and rejects missing facts without adding too
   much latency. Laya multilingual is a candidate for this role, not a proven solution.
4. **Improve candidate retrieval for paraphrases.** Test semantic candidate generation separately.
   Consider late interaction if repeated pair inference remains too expensive.

For each run, record the model revision and hashes, precision, runtime/version, CPU/GPU, thread
count, input lengths, candidate count, cold/warm latency and peak RAM. Keep query labels unchanged.
Use fresh held-out topics for ranking changes; the old results have already informed our choices.

## 9. What “better” should mean in these experiments

The joint model improved held-out evidence Recall@10 from 26.25 percent with strict search to
43.75 percent, and improved graded nDCG@10 from 0.219 to 0.405. It still missed the fixed recall,
MRR and latency gates. The public search has therefore not been switched to this model.

43.75 percent is the average fraction of labelled evidence found, not the percentage of queries
with an answer. In the saved held-out rankings, any useful result occurs in the top ten for
50 percent of queries; the actual answer occurs there for 42.5 percent, and ranks first for
30 percent. Supporting context and an actual answer are deliberately different labels.

The next report should include actual-answer Success@1/3/10, graded nDCG, evidence recall,
shortlist recall, no-answer behaviour, per-language/category results, cold/warm latency and RAM.
The [evaluation guide](combined-search-evaluation.md) explains the standard metric names and their
denominators. More metrics will help diagnose the pipeline; they do not substitute for a larger,
fresh and independently checked test set.
