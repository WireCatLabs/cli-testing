# Calendar sync and read fixes: before and after

Measured 2026-10-31 with the scripts beside this page. Raw numbers are in [`results/`](results/).

## Why we ran it

The [gcal 0.1.1 baseline](../gcal-baseline/README.md) found three costs in cli-core's calendar code that gcal runs on:
one commit for each repeating event during a sync (PERF-64), one `events.instances` request for each repeating event in
every daily full round (PERF-65), and an `events list` query that cannot seek its time index, beside a `people list`
that reads each event on its own (PERF-67). The fixes are in cli-core pull requests
[#2200](https://github.com/WireCatLabs/cli-core/pull/2200) (reads) and
[#2201](https://github.com/WireCatLabs/cli-core/pull/2201) (sync). The question: do they cut the commits, the
requests and the read time, and does the store end the same?

## Setup

- **Machine.** AMD Ryzen AI 9 HX 470 (24 threads), Linux 7.0.0-38-generic, Node 24.19.0. Other jobs shared the
  machine (1-minute load average about 3).
- **Code.** cli-core built with `pnpm build` at three commits: before, `fix/calendar-review-bugs` (ad9a492e, the
  review fixes of #2198, merged since); after for the sync, `perf/calendar-sync` (c393aa37, rebased as 9932d272); after for the reads,
  `perf/calendar-reads` (12aa1014, rebased as 07b93844). None of them has the prepared-statement cache (PERF-62), so every number carries
  its cost alike.
- **Engine, not gcal.** [`sync-bench.mjs`](sync-bench.mjs) runs cli-core's `syncCalendars` over its SQLite store and
  `fakeCalendarSource`, with a fixed clock, so it can run the next day's and next week's full rounds that a real clock
  cannot. Data in the shape of the baseline's: 20,000 events over 4 calendars, 4% of them weekly series (819 series,
  25,752 slots in the window), 0–7 guests each. Every entry has an etag, as Google's do.
- **Isolation.** A store file in a scratch folder, `MESSAGING_STORE` pointing at it, `DBUS_SESSION_BUS_ADDRESS` unset.
  No network, no sign-in, no real data.
- **Commands.**

  ```sh
  node sync-bench.mjs <cli-core checkout> <store.db> 20000      # once per build, each with a new store
  node reads-bench.mjs <cli-core checkout> <store.db>           # both builds over the same store, twice
  ```

## Results

### Sync ([`results/sync-before.json`](results/sync-before.json), [`results/sync-after.json`](results/sync-after.json))

| step | write transactions | `instances` requests | time |
| --- | ---: | ---: | ---: |
| first sync (full) | 1,663 → **123** | 819 → 819 | 15.9 s → 14.0 s |
| same day, no changes | 9 → 9 | 0 → 0 | 12 ms → 8 ms |
| next day: daily full round | 1,663 → **25** | 819 → **0** | 15.1 s → **6.7 s** |
| 8 days on: full round, every series | 1,663 → **124** | 819 → 819 | 16.1 s → 14.1 s |

A write transaction is one call of `saveEntries`, `removeEntries`, `saveSlots`, `setCursor`, `markUnseen`,
`restoreUnseen` or `saveCalendars`. After the 8-day round both stores hold the same rows: 46,689 live entries, none
cancelled or deleted, 45,870 events.

### Reads ([`results/reads.txt`](results/reads.txt)), median of 15, ms

| read | before | after |
| --- | ---: | ---: |
| `events list` today | 12.5–12.9 | **2.0–2.1** |
| `events list` week | 12.4–12.9 | **2.0** |
| `people list` week | 82.5–84.9 | **15.0–15.5** |

Both builds return the same rows (100 events, 246 people).

## What it showed

- Batching up to 50 series (250 slots) per transaction removes 93% of the commits of a full round. On this machine a
  commit is cheap, so the first sync gains only 12%; the baseline measured 2.7 ms per commit with the statement cache
  in place, where the same cut saves about 4 s at 20,000 events.
- The daily full round no longer asks unchanged series for their slots: 0 requests instead of 819, half the time. With
  the real network the saving is the 819 round trips too. Every series is asked again once the window's end has moved
  7 days, so a series that does not change lacks at most 7 days of slots three months ahead; the 8-day row shows that
  round.
- Plain bounds on `starts_at` make `events list` seek `events_by_time` (6 times faster here); one participants query
  makes `people list` 5.5 times faster.

## What was not measured

- gcal itself: start time, the network, and Google's own answers. The engine bench leaves those out on purpose.
- A 50,000-event store, and the lock wait another process sees during a sync (each batch is capped to keep it short).
- The statement cache (PERF-62) together with these fixes.
