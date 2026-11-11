# b24 sync on a live portal: how long, how many requests

## Why it was run

Every earlier CRM sync number came from cli-core's fake CRM, which answers at once and has no rate limit
([sync-scaling](../sync-scaling/README.md)). Before a public b24 launch the owner asked how a first sync behaves on a
real Bitrix24 portal on the Professional plan, where the portal allows 2 requests a second with a burst of 50
([Bitrix24 limits](https://github.com/bitrix24/b24restdocs/blob/main/limits.md)). The owner chose a read-only run on
the company's own portal over seeding 10,000 made-up deals into it. The question: how long does a first sync and a
daily sync take, how many requests do they spend, and is the rate limit a problem.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM, NVMe, Linux 7.0, Node 24.19.0.
- b24 0.13.0 from npm (cli-core 0.635.0). Signed in with an administrator's incoming webhook.
- Portal: a real Bitrix24 cloud portal on the Professional plan. Only totals are published here.
- Every user chosen to copy (50 users, `crm.bitrix24:<portal>.unassigned`), so the sync copies the whole sales data.
- A new store in a scratch folder (`B24_CONFIG_DIR`, `B24_STATE_DIR`, `MESSAGING_STORE` moved), so the owner's own
  store was not touched. Nothing was written to the portal.
- Each run: `/usr/bin/time -v b24 work sync --json`, one after the other.

## Results

| Run | Wall time | Requests | Rows saved | Peak memory | Ends |
| --- | --- | --- | --- | --- | --- |
| First sync, part 1 | 7 min 35 s | 765 | 186,134 | 430 MB | stopped at its request budget |
| First sync, part 2 | 4 min 4 s | 498 | 44,027 | 480 MB | complete |
| Next sync (changes only) | 2 min 40 s | 334 | 32,824 | 390 MB | complete |

- Stored after the first sync: 51,392 deals, 9,312 leads, 108,000 contacts, 1,990 companies, 6 pipelines.
- First sync in all: 11 min 39 s and 1,263 requests, about 1.8 requests a second. No rate-limit error was returned.
- The store file: 161 MB.
- 74 issues reported, all about the portal's data: 43 contacts share an e-mail with other contacts, 30 point to a
  record that does not exist, 1 other.
- One `search all` through the CLI on the filled store: 0.4 s, Node start included.

## What it showed

- **The first sync is bound by the rate limit, not by the computer.** It used 17% of one CPU and ran at about 1.8
  requests a second against a limit of 2. A bigger portal takes longer in proportion: about 180 rows a request.
- **A first sync of this size needs two runs.** The first run stops at its request budget and says to run `sync`
  again; the second finishes.
- **The daily sync costs too much.** With almost nothing changed (0 deals, 1 lead), it read 32,355 contacts and 468
  companies again and took 2 min 40 s. Every round of changes ends by reading every client of the chosen users'
  deals by id ([bitrix24-cli `src/crm/source.ts`](https://github.com/WireCatLabs/bitrix24-cli/blob/main/src/crm/source.ts),
  "Every round ends with the named clients"), so that a deal given to the user brings its client. On a portal of this
  size that is 300 requests a run. Reading only the clients of deals and leads that changed in the round would make a
  quiet daily sync a few requests.

## Not measured

- A portal on the Enterprise plan (5 requests a second).
- Activities, tasks and timeline comments: b24 0.13.0 does not sync them.
- Search quality on this data: the queries would name real clients. See [search-quality](../search-quality/README.md)
  for the synthetic benchmark.
- Two b24 processes at once on one portal.
