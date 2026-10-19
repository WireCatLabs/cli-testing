# Raw output of bench.mjs

Printed by `node bench.mjs <cli-core> 2000,10000 20 0.1`. After the change, `rekeyed` fires once per pass for all its
re-keys, so the per-re-key columns of the second table time passes, not re-keys; the README's "longest pass" is its
"longest gap" column.

## Before (cli-core `59505797`)

| chats | messages | re-keys (merges) | recipient list | total | rename median / p99 | merge median / p99 | time in merges | slowest re-key | neighbour writes: median / worst wait | phone-form left | other account kept |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2,000 | 40,000 | 1,000 (100) | none | 1681 ms | 0.86 ms / 1.99 ms | 6.47 ms / 30 ms | 743 ms | 47 ms | 1733 ms / 1733 ms (2 writes, 0 gave up) | 0 | 100 of 100 |
| 2,000 | 40,000 | 1,000 (100) | 200 ids | 2420 ms | 1.33 ms / 5.22 ms | 8.25 ms / 26 ms | 936 ms | 45 ms | 11 ms / 731 ms (21 writes, 0 gave up) | 0 | 100 of 100 |
| 10,000 | 200,000 | 5,000 (500) | none | 11813 ms | 1.48 ms / 3.79 ms | 6.91 ms / 17 ms | 3965 ms | 69 ms | 530 ms / 3433 ms (13 writes, 0 gave up) | 0 | 100 of 100 |
| 10,000 | 200,000 | 5,000 (500) | 200 ids | 13813 ms | 1.70 ms / 5.14 ms | 8.04 ms / 30 ms | 4557 ms | 77 ms | 80 ms / 2533 ms (33 writes, 0 gave up) | 0 | 100 of 100 |

## After (`perf/rekey-batch` at `36360b8b`, WireCatLabs/cli-core#1646)

| chats | messages | re-keys (merges) | recipient list | total | rename median / p99 | merge median / p99 | time in merges | longest gap between saved re-keys | neighbour writes: median / worst wait | phone-form left | other account kept |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2,000 | 40,000 | 1,000 (100) | none | 1101 ms | 0.00 ms / 0.02 ms | 0.00 ms / 97 ms | 705 ms | 97 ms | 36 ms / 56 ms (13 writes, 0 gave up) | 0 | 100 of 100 |
| 2,000 | 40,000 | 1,000 (100) | 200 ids | 1237 ms | 0.04 ms / 0.20 ms | 0.10 ms / 94 ms | 713 ms | 94 ms | 37 ms / 119 ms (14 writes, 0 gave up) | 0 | 100 of 100 |
| 10,000 | 200,000 | 5,000 (500) | none | 9587 ms | 0.00 ms / 77 ms | 0.00 ms / 91 ms | 3757 ms | 129 ms | 35 ms / 81 ms (119 writes, 0 gave up) | 0 | 100 of 100 |
| 10,000 | 200,000 | 5,000 (500) | 200 ids | 9916 ms | 0.03 ms / 78 ms | 0.09 ms / 97 ms | 3844 ms | 120 ms | 35 ms / 81 ms (118 writes, 0 gave up) | 0 | 100 of 100 |
