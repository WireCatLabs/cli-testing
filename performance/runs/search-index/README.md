# `runs search` with a per-day index

## Why it was run

`runs search` is how a person or an agent finds the run behind a failure: by error code, operation, status or
time. Until now it opened every `run.json` and every `events.jsonl` kept in the last 30 days. A search that
matched nothing read every byte. The CLI standards plan (stream C, logs) asked for an index of run summaries
and for the time before and after to be recorded.

The question: does a per-day `index.jsonl` beside the runs, plus each run's list of operations and codes, make
the common filters fast without a database? It decided whether the index stays a plain file or becomes a
SQLite table.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0.
- Code: cli-messaging `origin/main` at `4823bad5` ("before") and the `feat/runs-index` branch ("after"),
  each built with `pnpm build`.
- Data: synthetic only. [`generate.mjs`](generate.mjs) writes 30 days × 200 runs = 6,000 runs through the
  build's own `startRun`, each with 5–60 request/response pairs, 3 % failed responses and 10 % failed runs.
  About 150 MB on disk. A fixed seed makes both folders the same runs.
- Timing: [`bench.mjs`](bench.mjs) calls the build's `listRuns`, `findRun` and `searchRuns` in one process,
  11 rounds each, median reported. The page cache is warm after the first round.

```sh
node generate.mjs <cli-messaging>/dist <empty folder> 200
node bench.mjs <cli-messaging>/dist <that folder> <label>
```

`bench.mjs` needs `@wirecat/cli-base` resolvable from where it runs (a `node_modules` link to the build's).

## Results

| case | before | after |
|---|---|---|
| `runs list` (20) | 31.3 ms | 0.7 ms |
| `runs show <id>` | 0.2 ms | 0.1 ms |
| `search --status failed --error-code timeout` | 47.6 ms | 28.6 ms |
| `search --error-code rate_limited` | 72.8 ms | 23.9 ms |
| `search --operation messages.send` | 48.5 ms | 20.1 ms |
| `search --since-time 1d --status failed` | 46.6 ms | 3.9 ms |
| `search --error-code no_such_code` (nothing matches) | 1761.7 ms | 15.7 ms |
| `search no-such-text` (free text, nothing matches) | 2313.7 ms | 1347.6 ms |

The "after" code on the "before" folder (no index files, as for runs kept by an older version) falls back to
reading each day run by run: a missed `--error-code` took 937 ms and the other cases stayed close to "before".

## What it showed

- The worst case that mattered, a code nobody hit, went from almost two seconds to 16 ms: the index rules out
  runs whose recorded `codes` do not include it, so no `events.jsonl` is opened.
- `--since-time` now skips whole days by directory name, and `runs list` stops after the days it needs.
- A free-text query still reads every event of every candidate run. It is faster only because the index
  replaces the `run.json` reads. Making it fast needs an index of event text, which was not built.
- A plain JSON-lines file was enough. No SQLite: it is pruned with its day directory, needs no driver under Bun
  or Node, and a missing or broken file falls back to the old scan.

## Not measured

- A cold page cache (first search after a reboot).
- Run folders far beyond 30 days or 200 runs a day, and very large single `events.jsonl` files from a long
  `serve`.
- Concurrent writers appending to the same day's index.
- The time `startRun` and `finish` spend appending the index line.
