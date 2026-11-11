# CRM

Checks and measurements of the CRM data the WireCat CLIs share: cli-core's CRM sync, which b24 and the other CRM
CLIs run, what bitrix24-cli syncs, and what memo answers from it.

- [relationships](relationships/README.md): the CRM relationships plan's acceptance scenario (Acme and Northstar),
  through b24's real binary on a strict fake portal and memo's real binary and stdio MCP. Who works where, who
  reports to whom, deal parts with their standing, money, group locks and the docs' examples. On the published
  b24 0.9.0 and memo 0.131.72: 12 of 13 pass. Check 11 waits for cli-memo #777 (2026-11-09).
- [sync-scaling](sync-scaling/README.md) — does saving deals grow linearly on a large portal? Two relationship
  lookups read every link of a deal's owner; a fix halved a 20,000-deal first sync and made per-deal cost flat
  (2026-11-08). Binding the involvement drain's id ([cli-core#2682](https://github.com/WireCatLabs/cli-core/issues/2682))
  then cut a 20,000 sync from 30 s to 19 s and its peak memory from 3.7 GB to 0.6 GB.
- [contact-removal](contact-removal/README.md) — how long removing a whole portal's contacts outside a narrowed
  scope takes, in one pass on a copy of a real store: 114,165 contacts in 20 s, with store version 64's fixed
  deal-link triggers (version 63's took 24 ms a link, about 20 minutes for the same pass) (2026-11-10).
- [search-quality](search-quality/README.md): does `b24 search all` find the right deal? 88 labelled queries on
  2,018 synthetic deals and leads, through b24's own code on a fake portal. Recall@10 0.41 on cli-core 0.640.0 and
  0.76 with [cli-core#2866](https://github.com/WireCatLabs/cli-core/pull/2866) (word forms, company, contacts,
  typos). False hits on queries with no answer: 22 before, none with a four-letter minimum for word beginnings
  (2026-11-11).
- [live-sync](live-sync/README.md) — b24 0.13.0's sync on a real Professional-plan portal, read-only: a first sync of
  51,392 deals, 9,312 leads and 108,000 contacts took two runs, 11 min 39 s and 1,263 requests at about 1.8 a second;
  a daily sync with almost no changes still took 2 min 40 s, re-reading every client (2026-11-11).
