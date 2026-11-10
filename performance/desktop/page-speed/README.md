# How fast each WireCat Desktop page gets its data

Measured 2026-11-10 with the scripts in [`scripts/`](scripts/). Totals are in [`results.txt`](results.txt).

## Why we ran it

The owner used WireCat Desktop on his own store and found it slow and buggy: pages waited seconds for memo. He asked
whether Desktop can be made really fast, and what has to be done for that. The questions:

1. Which memo commands does each page run, and how long does each take on a real store: as a fresh process, and
   through a warm `memo commands --serve` server?
2. What does a page's set of reads cost when fired together, the way Desktop's pool of 2 servers runs them?
3. Is the interface itself slow once it has the data?

The answers feed the speed plan for Desktop, memo and cli-core (kept in the private working folder).

## Setup

- **Machine.** AMD Ryzen AI 9 HX 470, 30 GB RAM, Linux, Node 24.19.0, Google Chrome 154. Other agents worked at the same
  time: load average about 6, swap full, 2 to 4 GB free. Nothing was pinned.
- **Code.** memo 0.131.75 (cli-core 0.624.0) installed globally; WireCat Desktop at `32681529`.
- **Data.** The owner's real store, read only: list and show commands with `--no-record`, answers piped into a counter
  of rows and bytes. No content was printed or kept. The store holds about 114,000 people, 500 or more agent findings
  batches, 6 deal pipelines and a few hundred deals.
- **Commands.**
  - `node scripts/make-commands.mjs /tmp/commands.json` writes the reads each page sends on open (it looks up the
    busiest deal pipeline, so the file stays on the machine).
  - `node scripts/measure-commands.mjs /tmp/commands.json 3`: each command 3 times as a fresh process, then 3 times
    through one server; medians.
  - `node scripts/measure-fanout.mjs /tmp/commands.json "Memory:" 3`: the page's reads at once, as fresh processes,
    through pools of 1, 2 and N servers (a busy server sends the call to a fresh process, as Desktop does), and through
    one server one after another.
  - `node scripts/measure-first.mjs '<argv list as JSON>'`: the first and second request on a freshly started server.
  - Interface: `pnpm exec vite build && pnpm exec vite preview --port 1487 --strictPort` in Desktop, then
    `DESKTOP=<desktop checkout> node scripts/click-speed.mjs --runs 3 [--cpu 4]`. Mock data (`?memory=many`,
    `?clients=many`, `?tasks=many`, `?people=many`, `?showcase`). "Frame" is the Event Timing duration of the click
    (input to next paint, what INP scores); "long tasks" is main thread work over 50 ms in the 2 s after it.

## Results

### Each command (ms, median of 3)

| Page | Command | fresh process | warm server | rows | KB |
| --- | --- | ---: | ---: | ---: | ---: |
| Memory | memories, facts, agents, roles lists | 631 to 672 | 66 to 88 | 2 to 16 | 1 to 6 |
| Memory | actions list --limit 500 --brief | 718 | 177 | 500 | 359 |
| Memory | relationships list confirmed:false | 686 | 128 | 100 | 77 |
| Memory | relationships list include:ended | 905 | 278 | 100 | 71 |
| Clients | pipelines list kind:deal | 663 | 91 | 6 | 12 |
| Clients | pipelines show | 799 | 212 | 1 | 2 |
| Clients | deals list status:open --limit 500 | 964 | 324 | 500 | 1018 |
| Clients | deals list status:won / lost --limit 20 | 650 to 706 | 76 to 97 | 1 to 20 | 2 to 31 |
| People | people list kind:K --limit 1 (4 kinds) | 4509 to 5074 | 3661 to 3726 | 1 | 1 |
| People | people review --limit 500 | 771 | 327 | 500 | 189 |
| People | people list kind:person --sort interactions --limit 5000 | 5060 | 4248 | 5000 | 1398 |
| Tasks | tasks list, tasks counts, projects list | 660 to 670 | 65 to 101 | 0 to 96 | 0 to 78 |
| Tasks | people list --limit 5000 | 5033 | 3931 | 5000 | 1398 |
| Digests | digest list | 708 | 33 | 0 | 0 |
| Logs | runs list --limit 500 | 732 | 108 | 500 | 453 |
| Settings | groups list | 675 | 63 | 1 | 4 |
| Search | search notes --limit 50 | 1391 to 2342 | 822 to 836 | 50 | 25 |

- `people list` costs 3.7 to 5.9 s through a server whatever the limit (1, 50 or 5000), the kind and the sort.
  `--json=ref,name` left the answer at 1398 KB.
- Smaller limits save bytes, not much memo time: `actions list` 177 ms for 500 rows, 104 ms for 50; `deals list`
  324 ms for 500, 282 ms for 100.
- A server is ready 62 to 155 ms after it starts. Its first request takes 184 to 323 ms, the next 30 to 55 ms. A bare
  `memo --version` takes 20 ms.
- A CPU profile of one fresh `people list --limit 1` (5.3 s sampled): 1.8 s in SQLite, about 1.5 s in memo's
  name checks (which names are automated, which are companies) and the query of each person's ties, 0.4 s garbage
  collection. The work runs over every person before the limit applies.

### A page's reads at once (ms, median of 3)

| Page | calls | all fresh | pool of 2, rest fresh (Desktop today) | 1 server, queued | a warm server for each |
| --- | ---: | ---: | ---: | ---: | ---: |
| Memory | 7 | 1107 | 1081 | 1039 | 404 |
| Clients | 5 | 1418 | 1439 | 1022 | 561 |

The Clients row fires all 5 at once; Desktop runs `pipelines list` first and the other 4 after it.

### The interface (ms, median of 3)

| Click | frame | long tasks | frame, CPU x4 | long tasks, CPU x4 | DOM nodes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Tools to Memory | 64 | 132 | 120 | 387 | 2374 |
| Tools to Tasks | 40 | 0 | 120 | 105 | 8656 |
| Tools to People | 72 | 0 | 64 | 55 | 1102 |
| Tools to Analytics, Logs, Agents, Search, Digests, Storage, Settings | 48 to 64 | 0 to 61 | | | 400 to 1958 |
| Memory: open a row, approve, filter | 24 to 48 | 0 | 64 | 0 | 2371 |
| Clients: sort, open a deal, board view | 32 to 40 | 0 | 128 to 136 | 114 to 119 | 3326 |
| Tasks: sort | 48 | 0 | | | 8656 |
| Tasks: open a task | 72 | 54 | 288 | 252 | 8969 |
| Tasks: board view | 96 | 89 | 312 | 295 | 8666 |
| People: sort, open a person, another kind | 24 to 32 | 0 | | | 1080 to 1244 |

## What it showed

1. **The time goes to memo, not to the interface.** In a production build, most clicks paint within 24 to 72 ms. The
   pages wait 1 to 11 s for their data.
2. **`people list` is the worst single cost:** 3.7 to 4.2 s on a store of about 114,000 people, for any limit. People
   runs it 6 times on open (a list and 5 kind counts, 2 at a time), Tasks once to name assignees. The synthetic
   [people kinds](../../people/kinds/README.md) run found 0.5 to 0.6 s; a real store is 6 to 8 times slower.
3. **A warm server answers in 30 to 330 ms what a fresh process answers in 650 to 960 ms.** With a pool of 2 and the
   rest sent to fresh processes, the Memory page gains nothing over all fresh (1081 against 1107 ms): the page waits
   for the slowest call, and that is a fresh process.
4. **One warm server per call would bring Memory to about 0.4 s**, but that is 7 processes of about 165 MB each.
   One server that runs several requests at once ([concurrent](../../command-server/concurrent/README.md)) is a single
   JavaScript thread; that page found 6 to 54 % off the queued time, so about 0.5 to 1.0 s for Memory (inferred).
5. **A page under 150 ms on its first load is out of reach from memo alone:** the slowest warm reads are 278 ms
   (Memory), 324 ms (Clients), 830 ms (Search), 3.7 s (People). Under 150 ms needs the page to draw its last answer
   while it reads again, plus faster queries in cli-core.

## What was not measured

- The commands of the other CLIs (tg, max, wa, b24, zm, drive) that Logs, Agents, Analytics, Tools and Storage run.
- The Rust side of Desktop: JSON parsing, Tauri's bridge and the interface's schema checks on answers of 1 MB.
- The real app. Tauri on Linux draws with WebKitGTK, not Chrome, so the interface numbers are a lower bound; CPU x4
  stands in for a slower engine. The mocks are smaller than the real store in places (Memory 300 rows against about
  620; People holds pages of 50 against 5,000 rows).
- Desktop's dev build, which the owner was running.
- People's reads fired together, and Desktop's own `page_loads` replay (`cargo test --lib -- --ignored page_loads`):
  too heavy for the free memory that day.
- Navigation to Clients in the browser build: the `clients=many` mock opens its stage map dialog, which covers the
  sidebar.
