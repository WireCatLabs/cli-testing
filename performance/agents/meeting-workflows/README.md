# Meeting workflow cost

Agents investigating a project search several names, follow result pages and open cited passages.
The earlier five-query timing did not cover that workflow. We ran this benchmark to separate process
savings from output reduction and check whether either loses evidence. It follows aliases,
independent pages and neighboring transcript passages against an independent fixture oracle.
It measures the tools an agent uses, not a language model's reasoning quality.

## Run

Use Node 22.16 or newer and an isolated install of Zoom 0.21.2. The recorded run uses Node 24.
Install without lifecycle scripts, then give the runner a new output directory:

```sh
mkdir -p /tmp/meeting-bench-install
cp performance/agents/meeting-workflows/install-package.json /tmp/meeting-bench-install/package.json
cp performance/agents/meeting-workflows/install-lock.json /tmp/meeting-bench-install/package-lock.json
npm ci --prefix /tmp/meeting-bench-install --ignore-scripts --no-audit --no-fund
node performance/agents/meeting-workflows/run.mjs \
  --install /tmp/meeting-bench-install \
  --output /tmp/meeting-bench-results --rounds 5
```

The runner rejects an existing output directory. Use `--scale small --rounds 1` for a smoke run.
The scripts are outside the published testing package. They invoke the installed binary and seed
invented VTT files through the public import command; they do not import CLI source or store APIs.
The preload guard denies network, browser subprocesses and keyring access. Each call supplies
isolated config, state, cache and store paths without inheriting account or API environment settings.

## Comparison

Four modes separate two choices: one process per read versus a batch, and full JSON versus selected
JSON fields. Each mode finds the full name, abbreviation and Russian alias, plus one absent name.
Every query has its own cursor. Batch IDs are short caller keys such as `p0`; full
meeting references go in request arguments, since slashes are not permitted in request IDs. The runner follows all pages, deduplicates overlapping hits before
passage reads, and checks timestamps, speakers, source metadata and surrounding context.

Fixtures contain 24 meetings with 80 cues each and 120 meetings with 120 cues each. Eight meetings
carry provisional launch and budget decisions whose qualifications appear beside the search hits.
An incidental abbreviation match remains distinct from confirmed project membership. A separate
profile contains matching words and must never appear in the selected profile's answers.

An independent oracle reads the seeded transcripts before any search. Each workflow must retain
17 unique hits and all 51 expected surrounding cues, including 48 cues around the decision topics.
A local VTT import has no stored source permalink: `source.url` must stay null, rather than becoming
a meeting join link. This fixture checks title and date retention, not remote permalink ingestion.

Five timed rounds alternate forward/reverse mode order. Each mode gets a separate copy of the same
closed, warm-index store. Setup, imports, oracle reads, index warming and copying are outside the
workflow timer. Operating-system caches are not flushed. Wall time includes process startup, reads,
rendering, parsing and scripted orchestration. Both modes use the same request limits and guard.

Separate correctness probes mix valid, missing and stale-fingerprint passages, and force an aggregate
read-budget refusal. They check IDs and outer completeness, then retry only the unexecuted request.
These probes are outside the timed normal workflow.

## Results

The runner writes every measured trial, per-call timing/byte counts, package versions and integrity,
harness hashes, fixture hashes and evidence digests to `results.json`. It also checkpoints completed
trials. Summaries use medians and observed ranges; five samples do not establish a latency guarantee.

Stdout and request sizes are UTF-8 byte counts. Request bytes are serialized CLI arguments plus stdin,
excluding the fixed Node/preload prefix. No tokenizer or language model is run, so this benchmark does
not claim exact token savings, real-project relevance, or independent agent decision accuracy.
