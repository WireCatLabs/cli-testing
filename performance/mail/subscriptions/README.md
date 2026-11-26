# Subscriptions: grouping broadcast mail by list in the store

## Why it was run

The owner ruled on 2026-11-25 that WireCat Desktop gets a Subscriptions view beside mail. It shows the mail sent to
many readers (reach `broadcast`), grouped by list (`List-Id`, else the sender), with the mail count, the newest mail
and an unsubscribe action, like HEY's Feed. The Bots tab also filters bots by what they send: alerts and codes,
receipts, newsletters, marketing and messenger bots. Desktop could not build either one on cli-core 1.1.0
([wirecat-desktop#482](https://github.com/WireCatLabs/wirecat-desktop/pull/482),
[cli-core#3371](https://github.com/WireCatLabs/cli-core/issues/3371)).

cli-core adds `store.mail.subscriptions` and `people.listBots({ sends })`. Desktop never filters a list in the
browser, so both page in SQL. The questions:

1. On 100,000 emails, is a page of Subscriptions fast enough for a screen without a new index or a stored grouping
   column? That decides whether the change needs a store version.
2. What does the first read cost, when the store has not typed its mail yet, on a writable and on a read-only open?
3. Do the bots filters stay fast?

## Setup

- Machine: AMD Ryzen AI 9 HX 370 (24 threads), Linux 7.0, Node 24.19.0. Other agents' runs kept the load average at
  18 to 48 during the runs.
- Code: cli-core branch `feat/subscriptions-read`, built with `pnpm build`.
- Data, all synthetic: 100,000 emails saved through `store.mail.saveThreads`, 100 per thread, the mix of
  [types/search.mjs](../types/search.mjs) with more senders. 40% newsletters from 1,000 lists (half name a signed
  unsubscribe target), 20% sales from 600 shops (target and one-click), 15% order receipts from the shops' no-reply
  addresses, 5% sign-in alerts, 5% the owner's own mail to 2,000 people, 15% mail from those people. 40 messenger bots.
  60,000 emails are broadcast, in 1,600 groups.
- Each warm step ran 5 times. The tables give the median.

```sh
node bench.mjs <cli-core checkout> 100000 5
```

## Results

Final query, one run (load 18.7 to 21.8):

| Step | Time |
| --- | ---: |
| read-only open of an untyped store: subscriptions, first 50 (types worked out in memory, nothing kept) | 0.91 s |
| writable open, first read: type all 100,000 emails, then subscriptions, first 50 | 20.5 s |
| warm subscriptions, first 50 | 162 ms |
| warm subscriptions, page 10 of 50 | 166 ms |
| warm subscriptions, first 500 | 132 ms |
| warm subscriptions, `types: [promotion]`, first 50 | 62 ms |
| warm subscriptions, last 7 days, first 50 | 45 ms |
| warm subscriptions, a page past the end (the total is counted again) | 350 ms |
| warm `mailSenders reach:[broadcast]`, first 50, for comparison (pages in JavaScript) | 398 ms |
| warm `listBots sends:[receipts]`, first 50 of 600 | 49 ms |
| warm `listBots sends:[marketing]`, first 50 of 600 | 52 ms |
| warm `listBots sends:[messenger]`, 40 bots | 3 ms |
| warm `listBots sends:[alerts, receipts, messenger]`, first 50 of 640 | 48 ms |
| warm `listBots`, no filter, first 50 | 4 ms |

The first `listBots sends` after `people list` sorted 2,240 senders into bots took 22 s. Sorting a sender into a bot
clears the type of its mail, so that read typed most of the mail again. Later reads were warm.

Two earlier versions of the query, on the same data:

| Version | first 50 | first 500 |
| --- | ---: | ---: |
| window functions (`row_number` per group) for the newest mail and the newest target, on an earlier data set with 140 groups | 304 ms | 180 ms |
| bare newest row, target looked up per group, planner on `emails_by_list_id` for "no List-Id" | 489 ms | 3,453 ms |
| bare newest row, target per group through the sender's identities (shipped) | 162 ms | 132 ms |

## What it showed

- No store version is needed. The grouping is one scan of the broadcast mail. SQLite takes the newest row of each
  group as the bare column beside `max(at)`, which is about 90 ms of the page. The unsubscribe target is then looked
  up only for the page's groups, through `emails_by_list_id` or the sender's identities, at 0.03 to 5 ms a group.
- The per-group lookup has a trap. For "this sender's mail with no List-Id", SQLite chose `emails_by_list_id`, and
  most mail has no List-Id. That cost 10 ms a group and 3.5 s for 500 groups. A unary `+` on the List-Id expression
  keeps it on `emails_by_from_identity_id`.
- Window functions for the newest mail cost about 200 ms more than the bare-column form.
- The first read after an upgrade costs what typing costs ([types](../types/README.md)): about 20 s on a writable open,
  under 1 s on a read-only one.
- The bots filters stay under 60 ms warm. They are `EXISTS` subqueries over the bot's identities and the stored types.

## Not measured

- Real mail. The synthetic data has no real List-Id names, mixed-signature lists or senders that change domains.
  In this data no `security@` sender became a bot, so `sends:[alerts]` found none. The time is still the cost of the
  filter.
- More than 100,000 emails, or more than 1,600 groups.
- Writes while the read runs. The read takes no write lock once the types are kept.
- The memo command around the read (`memo mail subscriptions list`). It adds the store open and the JSON output.
