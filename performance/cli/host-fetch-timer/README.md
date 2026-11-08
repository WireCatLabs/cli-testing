# hostFetch's timeout timer and a test suite's memory

Measured 2026-11-08 for [cli-base #534](https://github.com/WireCatLabs/cli-base/pull/534), with
[`measure.sh`](measure.sh) beside this page.

## Why we ran it

cli-base 0.85.0 added `hostFetch`, a `fetch` that reaches only the hosts a CLI declares. The owner ruled that
WireCat's own CLIs use it first. tg-cli's Bot API transport was moved onto it, one `hostFetch` per call, so that each
call has its own timeout.

tg's transport had stopped using `AbortSignal.timeout` on 2026-11-05: its timer keeps the async context of the call
alive until the deadline, and `bot-api.test.ts` ran out of heap on macOS. `hostFetch` 0.85.0 uses
`AbortSignal.timeout` for its own timeout. The question: does routing tg through it bring that memory back, and does
clearing the timer once the body is read fix it? The answer decided whether tg could adopt `hostFetch` 0.85.0 as is.

## Setup

- AMD Ryzen AI 9 HX 470 (24 threads), Node 24.19.0, Linux.
- tg-cli on its `feat/host-fetch` branch (cli-base 0.85.0 installed, cli-core 0.609.0). Its `src/http.ts` is the one
  place its HTTP goes through `hostFetch`.
- cli-base at #534's head, built with `tsc --build`.
- `DBUS_SESSION_BUS_ADDRESS=disabled:`, so no keyring is reached; the suites use fakes, no network.

```sh
performance/cli/host-fetch-timer/measure.sh /path/to/tg-cli /path/to/cli-base 2
```

The script swaps tg's `src/http.ts` for each case and restores it afterwards. It runs
`vitest run src/bot-api.test.ts src/bot/transport.test.ts --maxWorkers=1` (205 tests) and reads the peak resident
memory from `/usr/bin/time -v`.

## Results

Peak resident memory, two runs per case:

| tg's HTTP | run 1 | run 2 |
|---|---|---|
| without hostFetch | 0.72 GB | 1.63 GB |
| through hostFetch, cli-base 0.85.0 | 3.18 GB | 3.23 GB |
| through hostFetch, cli-base #534 | 0.74 GB | 1.82 GB |

An earlier session on the same day gave the same picture: 0.76 and 1.1 GB without, 3.0 and 3.4 GB through 0.85.0,
0.76 and 0.77 GB with a timer cleared when the headers arrive.

## What it showed

- `hostFetch` 0.85.0 roughly triples the peak memory of these suites. The cause is the timer: clearing it, with
  nothing else changed, brings the peak back to the unguarded range.
- #534 clears the timer when the request fails or the body has been read to the end, so the timeout still bounds
  the body. With it, tg can route every Bot API call through `hostFetch`.
- Runs vary by about 1 GB in the unguarded and fixed cases. The 0.85.0 case stays at 3.2 GB.

## Not measured

- macOS, where the out-of-heap failure happened. The CI runners have less memory than this machine.
- A long-running `tg bot serve`: there calls are sparse, and each timer would hold memory for at most 30 s.
- gcal-cli, whose suites inject their own fetch and do not go through `hostFetch`.
