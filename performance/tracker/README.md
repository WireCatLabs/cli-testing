# Tracker

Measurements of the issue-tracker CLIs (linear-cli) and the store's tracker items, against the tools people use
instead.

- [linear-rivals](linear-rivals/README.md) — linear-cli against Linear MCP, Linearis and schpet/linear-cli on 30
  questions over a synthetic Linear workspace: `memo search all` with vectors finds 27/27 in the top 5 offline,
  Linear's own search 22–25/27, linear-cli's `issues search` alone 7/27 (2026-11-25).

Meaning search over tracker items inside cli-core is measured in
[search/tracker-meaning](../search/tracker-meaning/README.md).
