# CRM

Checks and measurements of the CRM data the WireCat CLIs share: cli-core's CRM sync, which b24 and the other CRM
CLIs run, what bitrix24-cli syncs, and what memo answers from it.

- [relationships](relationships/README.md): the CRM relationships plan's acceptance scenario (Acme and Northstar),
  through b24's real binary on a strict fake portal and memo's real binary and stdio MCP. Who works where, who
  reports to whom, deal parts with their standing, money, group locks and the docs' examples. Pre-release run on
  unreleased builds: 12 of 13 pass. Check 1 waits for cli-core's `mergePerson` fix (2026-11-08).
- [sync-scaling](sync-scaling/README.md) — does saving deals grow linearly on a large portal? Two relationship
  lookups read every link of a deal's owner; a fix halved a 20,000-deal first sync and made per-deal cost flat
  (2026-11-08). Binding the involvement drain's id ([cli-core#2682](https://github.com/WireCatLabs/cli-core/issues/2682))
  then cut a 20,000 sync from 30 s to 19 s and its peak memory from 3.7 GB to 0.6 GB.
