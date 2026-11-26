# What one store commit costs

## Why it was run

While measuring [sync-growth](../sync-growth/README.md) (tg-cli
[#917](https://github.com/WireCatLabs/tg-cli/issues/917)), each store commit on the owner's disk seemed to cost about
200 ms whatever the chat size. A history sync commits once per page of 100 messages, so 200 ms would be most of a
page's time. The question: is that the cost of cli-core's settings (WAL with the default `synchronous`, which is
FULL), or of a busy machine? The answer decides whether cli-core should consider `synchronous=NORMAL`.

## Setup

- Machine: AMD Ryzen AI 9 HX 370, 59 GB RAM, NVMe, ext4, Linux 7.0, Node 24.19.0 (`node:sqlite`, SQLite 3.53.3).
- Other agent sessions ran on the machine throughout: load average 6 to 16 during the runs, other processes writing
  to the same disk. The machine was never idle.
- [`bench.mjs`](bench.mjs) opens a new database in WAL mode, as cli-core's driver does, and makes 200 commits of
  100 rows of 400 bytes each (`BEGIN IMMEDIATE`, inserts, `COMMIT`), once with `synchronous=FULL`, once with `NORMAL`,
  then both again. It prints the median, 90th percentile and maximum time per commit.

```sh
BENCH_DIR=/home/me/.cache/commit-cost COMMITS=200 node bench.mjs
```

## Results

Median time per commit, ms, 200 commits each, six runs of FULL and six of NORMAL over three invocations:

| Run | FULL median | FULL p90 | NORMAL median | NORMAL p90 |
|---|---|---|---|---|
| 1 | 224.6 | 868.3 | 0.16 | 0.20 |
| 2 | 3.4 | 10.6 | 0.17 | 0.21 |
| 3 | 220.1 | 847.0 | 0.25 | 0.30 |
| 4 | 5.0 | 10.2 | 0.10 | 0.16 |
| 5 | 3.1 | 7.9 | 0.11 | 0.21 |
| 6 | 139.5 | 655.2 | 0.23 | 0.27 |

A first try at load average 37 gave FULL medians of 190 and 370 ms, NORMAL 0.2 and 0.4 ms. NORMAL's maximum was
0.26 to 0.89 s in every run: the WAL checkpoint, the one place NORMAL still syncs.

## What it showed

- **With FULL a commit costs either 3 to 5 ms or 140 to 225 ms.** Nothing else changed between runs, so the
  other writers on the disk most likely decide which one. On ext4 an fsync waits for the filesystem journal,
  which also holds other programs' pending writes. This is an inference from the two clusters, not measured
  per process.
- **With NORMAL a commit costs 0.1 to 0.25 ms**, 20 to 1,000 times less, and does not depend on the other
  writers. Per the [SQLite documentation](https://www.sqlite.org/pragma.html#pragma_synchronous), WAL with NORMAL
  "is safe from corruption" and "always consistent" but "does lose durability": a commit made just before a power
  loss or an OS crash may roll back. An application crash loses nothing. FULL syncs the WAL on every commit, NORMAL
  only at checkpoints ([WAL performance](https://www.sqlite.org/wal.html#performance_considerations)).
- **For a sync,** one commit per page means 3 to 5 ms against about 40 ms of work per page on a quiet disk
  (about 10 %), and up to 225 ms per page, several times the work, while another program writes heavily.

## Not measured

- An idle machine and other disks (SATA SSD, HDD, macOS APFS, Windows NTFS).
- cli-core's real transaction shape: several statements and side tables per commit, `drainStems` and the journal
  check before `COMMIT`.
- Which data in the store could not be fetched again after a lost commit. That is the question for choosing
  NORMAL.
