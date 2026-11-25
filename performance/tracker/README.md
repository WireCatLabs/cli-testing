# Tracker

Measurements of the issue-tracker CLIs (linear-cli) and the store's tracker items, against the tools people use
instead.

- [linear-rivals](linear-rivals/README.md) — linear-cli against Linear MCP, Linearis and schpet/linear-cli on 30
  questions over a synthetic Linear workspace: `memo search all` with vectors finds 27/27 in the top 5 offline,
  Linear's own search 22–25/27, linear-cli's `issues search` alone 7/27 (2026-11-25).
- [sync-writes](sync-writes/README.md) — why a tracker sync of a few rows took seconds: one commit per step, each
  waiting for the disk. One transaction per page took the strict fake's sync from 79 commits to 38 and from 354 to
  214 ms on a busy disk (2026-11-25).

Meaning search over tracker items inside cli-core is measured in
[search/tracker-meaning](../search/tracker-meaning/README.md).
