# Events

Measurements for the events and push design: how processes that share the store learn about changes.

- [change-detection](change-detection/README.md) — polling `PRAGMA data_version` against watching the `-wal` file,
  idle and during a sync-like write load: a 250 ms poll sees every commit at 1.3 µs per check; a file event alone
  misses the newest commit and costs 10–12 times the CPU during a sync (2026-11-01).
