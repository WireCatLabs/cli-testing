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

Measured with Zoom 0.21.2, Core 0.299.0 and Base 0.40.0 on Linux/Node 24.19.0. The
[recorded results](results.json) retain all 40 trials, 620 timed CLI invocations, evidence digests,
per-call traces, fixture hashes, package integrity and host details. Small is 1,920 selected-profile
cues; medium is 14,400. Each has the same 17-hit task, plus one excluded foreign-profile meeting.

| Fixture | Mode | CLI processes | Median seconds (range) | Median stdout bytes |
| --- | --- | --- | --- | --- |
| small | single-full | 27 | 13.91 (12.60–20.20) | 45,975 |
| small | batch-full | 4 | 1.95 (1.77–2.43) | 48,855 |
| small | single-compact | 27 | 15.70 (12.14–20.32) | 30,107 |
| small | batch-compact | 4 | 2.79 (1.90–2.96) | 32,987 |
| medium | single-full | 27 | 17.11 (11.85–18.69) | 46,155 |
| medium | batch-full | 4 | 2.27 (1.75–3.07) | 49,035 |
| medium | single-compact | 27 | 14.58 (11.94–17.84) | 30,223 |
| medium | batch-compact | 4 | 1.85 (1.77–2.25) | 33,107 |

All modes retained every expected hit and all 51 context cues, including the 48 around decision
topics. Per-fixture evidence digests matched across every mode and repetition. The incidental
abbreviation hit stayed available for review; no foreign-account hit appeared. Missing/stale
passages remained correlated errors beside a successful passage. Budget refusal produced `not_run`;
retrying only that request retained both intended passages and reported completeness truthfully.

Batching reduced 27 processes to 4. For full JSON its median improvement was 7.1× on small and
7.5× on medium in this run. Batch framing added about 2.9 KB; batching alone did not shrink output.
Field selection reduced stdout by about 34.5% for separate reads and 32.5% within batches.
Using batches with field selection was about 28% smaller than full JSON from separate reads.
Projection did not consistently reduce elapsed time; its demonstrated benefit here is fewer bytes.

Use batches for known independent queries, then batch the deduplicated cited passages. Keep each
query's cursor and each answer's coverage. Choose practical per-request byte ceilings: these passage
requests reserve 64 KiB each, so all 17 fit the aggregate budget. The three-hit search page deliberately
exercises continuation; a larger page can reduce processes further and was not timed here.

### Limits

The fixture and scorer were written by the same agent. This checks scripted retrieval and evidence
preservation, not blind relevance assessment, discovery of unknown aliases or correct interpretation
of a real project's decisions. CLI process count is not a count of model/API turns.
These are warm-index measurements on a shared developer machine. The observed timing ranges are
wide; they do not isolate startup, storage and rendering costs or establish general speed guarantees.


Stdout and request sizes are UTF-8 byte counts. Request bytes are serialized CLI arguments plus stdin,
excluding the fixed Node/preload prefix. No tokenizer or language model is run, so this benchmark does
not claim exact token savings, real-project relevance, or independent agent decision accuracy.

## Passage formats

A separate [format probe](formats.mjs) measures the passage stage only: the same 17 requests and
51 cues, three samples per format. These calls are excluded from the 40 timed workflows above.
The [recorded format results](passage-formats.json) include every byte sample and source hashes.

| Fixture | Full JSON bytes | Selected JSON bytes | Text bytes | Markdown bytes |
| --- | --- | --- | --- | --- |
| small | 35,547 | 22,207 | 11,599 | 11,939 |
| medium | 35,649 | 22,291 | 11,683 | 12,023 |

Text was about 67% smaller than full JSON and 48% smaller than selected JSON for these passages.
Every text/Markdown sample contained all expected cue references, timestamps, speakers and text,
with one coverage summary per request and unknown archive coverage preserved.

Use JSON for machine pagination, structured error handling and fingerprint preconditions. Text or
Markdown is smaller when the next step is reading and citing passages. This check does not claim
that plain text exposes every field of the JSON envelope or measures an agent's interpretation.

After a workflow run, reproduce the format probe against its retained seed stores:

```sh
node performance/agents/meeting-workflows/formats.mjs \
  --install /tmp/meeting-bench-install \
  --results /tmp/meeting-bench-results/results.json \
  --run-root /tmp/meeting-bench-results \
  --output /tmp/meeting-bench-formats.json
```
