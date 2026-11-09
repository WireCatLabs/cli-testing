# Several requests at once through one command server

Measured 2026-11-10 on cli-core, with [`measure.mjs`](measure.mjs) beside this page. The raw output is in
[`results.txt`](results.txt).

## Why we ran it

WireCat Desktop answers its pages through `memo commands --serve`. Before this change, one server answered one request
at a time. Desktop keeps a pool of 2 servers. The Memory page sends 7 reads together, so 5 of them start a fresh `memo`
process each, which takes about 0.4 to 0.9 s and about 165 MB. The owner asked why one server could not take
parallel calls and leave the locking to SQLite.

The questions:

1. How long do 7 reads take through one server when they run one at a time, and when they run at once?
2. How does that compare with a process for each read, which is what Desktop pays for the reads that miss the pool?

The answers fed [cli-core #2812](https://github.com/WireCatLabs/cli-core/pull/2812): up to 8 requests at once in one
server, and the change Desktop needs to send them.

## Setup

- **Machine.** AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux, Node 24.19.0. Other agents ran tests at the
  same time: the load average was about 8.5 (written in `results.txt`). Nothing was pinned to CPUs.
- **Code.** cli-core on the branch of #2812 (`3319e0ddc`), the test CLI `src/testing/command-server-cli.ts` built with
  esbuild by the script. It is a tg-like CLI on cli-core's `run()`.
- **State.** A throwaway folder for `HOME`, the config, state and cache folders and `MESSAGING_STORE`, with
  `DBUS_SESSION_BUS_ADDRESS=disabled:`. The store holds 30 saved searches and nothing else. No real store, account or
  message was opened.
- **Commands.** `work searches list --json` (settings, the store, a list of 30 rows) and `work config show --json`
  (settings only). Each round is timed from the first request sent to the last answer read. The server gets one
  request first, so its modules are loaded, as for a page's call after the server started.

```sh
# from a cli-core checkout with #2812 (the script is also at bench/command-server/measure.mjs there)
node bench/command-server/measure.mjs 7 5                          # 7 reads, 5 rounds, searches list
node bench/command-server/measure.mjs 7 5 work config show --json  # the same for config show
node bench/command-server/measure.mjs 16 3                         # 16 reads, past the cap of 8
```

## Results

Medians, in ms. The ranges are the three runs made that day (two before `results.txt`, one in it).

| 7 reads | `searches list` | `config show` |
|---|---|---|
| one server, one at a time | 95–157 | 91–164 |
| one server, all at once | 76–148 | 70–97 |
| a process each, all at once | 671–1040 | 676–830 |
| a process each, one at a time | 2985–5271 | 3271–3992 |

16 reads of `searches list`: 338–407 ms one at a time through one server, 241–274 ms all at once, 1482 ms with a
process each, all at once.

## What it showed

- **Most of the gain is not starting a process.** 7 reads through one server take about 0.1 s in any order. 7
  processes started together take 0.7 to 1 s.
- **Running them at once saves another 6 to 54 %.** The work is mostly synchronous JavaScript and SQLite on one
  thread, so requests overlap only where a run waits: on files, settings and imports.
- So Desktop can get most of the gain by sending a page's reads to one server instead of starting processes. The
  answers come back by `id`, in the order they end.

## What was not measured

- A real memo store, and the Memory page's actual 7 commands. The store here is tiny.
- Memory use of one server with 8 requests in flight.
- A server while another process holds the store's write lock. The driver is synchronous, so such a wait stops the
  whole server for up to the busy timeout (5 s), not only the request that waits.
- Other machines, and runs pinned to fewer CPUs as CI is.
