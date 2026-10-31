# Raw tables printed by bench.mjs

Totals: 5.54 GB file, 275,951 emails (110,837 with a body), 242,508 mail threads, 216,986 chat messages, 851,335 mentions, 18,413 known people with 18,442 names and aliases.
### One save, split (ms): re-save of a stored email, 100 saves

| part | median | p95 | max |
| --- | --- | --- | --- |
| data | 0.63 | 1.96 | 9.61 |
| stems | 0.03 | 0.05 | 0.19 |
| mentions | 0.02 | 0.04 | 0.27 |
| involvements | 0.01 | 0.01 | 0.21 |
| commit | 0.74 | 3.41 | 4.93 |
| total | 1.59 | 5.03 | 11.3 |
| normal save (write(), all drains) | 1.35 | 3.97 | 19.4 |

### One save, split (ms): new email, 30 saves

| part | median | p95 | max |
| --- | --- | --- | --- |
| data | 1.93 | 9.06 | 11.8 |
| stems | 0.03 | 0.09 | 0.11 |
| mentions | 299 | 433 | 671 |
| involvements | 2.26 | 10.3 | 11.7 |
| commit | 10.7 | 52.3 | 58.7 |
| total | 312 | 472 | 675 |
| normal save (write(), all drains) | 402 | 743 | 951 |

### Pieces of the mention drain (ms), run alone

| part | median | p95 | max |
| --- | --- | --- | --- |
| knownPeople() | 69.6 | 83.2 | 83.2 |
| nameIndex() | 209 | 273 | 273 |

### Writer against a waiter

| workload | writer | waiter's wait | emails | total | transactions | hold median / p95 / max (ms) | gap median / p95 (ms) | waiter tries | waiter worst wait (ms) | waiter failures |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| resave | per email | busy_timeout 5 s | 2000 | 17756 ms | 2000 | 7.98 / 15.9 / 41.9 | 0.01 / 0.01 | 11 | 4337 | 0 |
| resave | slices of 50, 100 ms pause | busy_timeout 5 s | 2000 | 18547 ms | 40 | 119 / 1793 / 2625 | 100 / 103 | 81 | 1430 | 0 |
| resave | per email | 1 ms retry | 2000 | 17662 ms | 2000 | 7.79 / 16.6 / 33.7 | 0.01 / 0.01 | 105 | 708 | 0 |
| resave | slices of 50, 100 ms pause | 1 ms retry | 2000 | 7026 ms | 40 | 78.6 / 142 / 192 | 100 / 104 | 84 | 145 | 0 |
| new | per email | busy_timeout 5 s | 300 | 76025 ms | 300 | 192 / 490 / 1376 | 0.00 / 0.00 | 25 | 4143 | 13 |
| new | slices of 50, 100 ms pause | busy_timeout 5 s | 300 | 2098 ms | 6 | 268 / 322 / 322 | 100 / 100 | 14 | 329 | 0 |
| new | per email | 1 ms retry | 300 | 61152 ms | 300 | 202 / 288 / 345 | 0.01 / 0.01 | 69 | 3663 | 4 |
| new | slices of 50, 100 ms pause | 1 ms retry | 300 | 2088 ms | 6 | 265 / 297 / 297 | 100 / 100 | 15 | 295 | 0 |

# With cli-core #2250 (save-threads.mjs, fresh copy)

| waiter's wait | emails | total | transactions | mention drains | name index rebuilds | hold median / max (ms) | waiter tries | waiter worst wait (ms) | waiter failures |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| busy_timeout 5 s | 300 | 1694 ms | 6 | 6 | 6 | 199 / 289 | 15 | 329 | 0 |
| 1 ms retry | 300 | 1479 ms | 6 | 6 | 6 | 159 / 192 | 16 | 184 | 0 |
