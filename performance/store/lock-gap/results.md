| pause after commit | write waits with | median ms | p90 ms | worst ms | over 1 s | failed (5 s) |
|---|---|---|---|---|---|---|
| 0 ms | retry | 3823 | failed | failed | 15/20 | 8/20 |
| 0 ms | sqlite | failed | failed | failed | 20/20 | 20/20 |
| 0.3 ms | retry | 46 | 151 | 187 | 0/20 | 0/20 |
| 0.3 ms | sqlite | 9 | failed | failed | 6/20 | 5/20 |
| 2 ms | retry | 20 | 25 | 25 | 0/20 | 0/20 |
| 2 ms | sqlite | 134 | 335 | 335 | 0/20 | 0/20 |
