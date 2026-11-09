# Raw output, 2026-11-01

`nice -n 10 node bench.mjs --seconds 20` on the machine in the README.

```text
node v24.19.0, sqlite 3.53.3
PRAGMA data_version: 1.28 µs per call (100,000 calls, prepared once)
```

| Mode | Other writers | Events | p50 ms | p95 ms | max ms | Wakeups | Empty wakeups | Found only by 5 s safety poll | Reader CPU ms/min |
|---|---|---|---|---|---|---|---|---|---|
| poll-50 | idle | 177 | 27.6 | 48.0 | 54.4 | 405 | 1 | 0 | 205 |
| poll-250 | idle | 175 | 135.9 | 246.8 | 253.0 | 81 | 0 | 0 | 82 |
| poll-1000 | idle | 180 | 519.5 | 955.0 | 1006.2 | 20 | 0 | 0 | 21 |
| watch | idle | 167 | 120.4 | 191.6 | 204.8 | 270 | 0 | 4 | 86 |
| watch-settle | idle | 172 | 20.4 | 23.0 | 24.4 | 277 | 0 | 0 | 164 |
| poll-50 | sync-like writer | 178 | 27.8 | 47.2 | 55.2 | 405 | 228 | 0 | 183 |
| poll-250 | sync-like writer | 183 | 122.0 | 239.8 | 252.0 | 81 | 0 | 0 | 89 |
| poll-1000 | sync-like writer | 183 | 540.3 | 976.1 | 998.5 | 20 | 0 | 0 | 24 |
| watch | sync-like writer | 196 | 10.9 | 20.1 | 41.5 | 24375 | 913 | 0 | 862 |
| watch-settle | sync-like writer | 182 | 11.3 | 20.2 | 24.0 | 35793 | 975 | 0 | 1099 |
