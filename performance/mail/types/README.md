# Mail types: what typing every email costs the store

## Why it was run

The owner ruled that every email gets a type of its own, apart from its sender: a shop's receipts are `order`, its
sales `promotion`, and a tab such as Subscriptions is a filter over those types, not a table (contact-kinds plan in
cli-core [#3323](https://github.com/WireCatLabs/cli-core/pull/3323), section "Mail categories"). cli-core store
version 76 keeps each email's type and reach on the `emails` row, cleared by triggers when what decides them changes,
and works them out lazily ([#3358](https://github.com/WireCatLabs/cli-core/pull/3358)).

An existing store has no types after the upgrade. The first read that filters by type works out every email, a batch
per write, under the store's write lock, which other writers wait for at most 5 s. The questions:

1. On a store of 100,000 emails, how long does that first read take, and how long does one batch hold the lock?
2. Do warm filtered reads and the per-sender summary stay fast?
3. What does a read-only open of a store never typed cost, which works types out in memory?

The answers decided the batch size (5,000) and whether the work can stay lazy instead of a migration step.

## Setup

- Machine: AMD Ryzen AI 9 HX 370 (24 threads), Linux 7.0, Node 24.19.0. Other agents' runs kept the load average at
  14 to 20 and wrote to the same disk, so commits (the store syncs each one to disk) varied a lot between runs.
- Code: cli-core branch `feat/mail-types` (store version 76), built with `pnpm build`.
- Data, all synthetic: 100,000 emails saved through `store.mail.saveThreads`, 100 per thread. 40% newsletters (List-Id
  and List-Unsubscribe, 200 lists), 20% sales (one-click unsubscribe), 15% order receipts, 5% sign-in alerts, 5% the
  owner's own mail to 2,000 people, 15% mail from those people. No bodies.

```sh
node bench.mjs <cli-core checkout> 100000
```

## Results

Two runs with batches of 5,000 (the shipped size), one earlier run with batches of 2,000 for comparison.

| Step | 5,000 per batch, 2 runs | 2,000 per batch |
| --- | ---: | ---: |
| query-only open of an untyped store: `emails types:[order]`, first 50 | 0.73–0.89 s | 0.47 s |
| query-only open of an untyped store: `mailSenders reach:broadcast` | 0.91–1.81 s | 0.83 s |
| first read: type all 100,000 emails, then `emails types:[order]`, first 50 | 1.7–11.6 s | 21.5 s |
| one batch under the write lock | 91–628 ms | 472 ms (2,000 emails) |
| warm `emails types:[order]`, first 50 | 10–14 ms | 13 ms |
| warm `emails types:[newsletter] reaches:[broadcast]`, first 50 | 14–21 ms | 20 ms |
| warm `emails`, no filter, first 50 | 11–19 ms | 20 ms |
| `mailSenders reach:broadcast` (140 of 1,090 senders) | 193–273 ms | 284 ms |
| `mailSenders`, every sender | 188–195 ms | 196 ms |
| the owner's first mail to a shop: save with triggers, 335 typed emails cleared | 66–595 ms | 117 ms |
| a rules change: all 100,000 typed again | 5.3–9.7 s | 10.8 s |

Working out the types themselves is cheap: 2,000 emails took 15–24 ms in a profile. Almost all of a batch's time is
the commit's sync to disk, which ranged from 18 to 680 ms per commit under the other agents' load.

## What it showed

- One batch holds the write lock well under 1 s, far inside another writer's 5 s wait, even under load.
- The first read after the upgrade takes seconds on 100,000 emails. It runs once, and only when a read filters by type
  or asks for the sender summary; plain reads and syncs never wait for it.
- Fewer, larger batches finish sooner: the disk sync per commit, not the classification, is the cost.
- Warm filtered pages stay under 25 ms through the `emails_by_mail_type` index. The sender summary reads every
  incoming email and counts in JavaScript: about 0.2–0.3 s at 100,000.
- A first version read each newsletter's senders again in every batch (3.9 s for the query-only read); keeping the
  counts for the whole pass made it 8 times faster.

## Not measured

- Real mail: subjects, address words and schema.org markup were not checked for accuracy here. The classifier's
  accuracy on real mail is the next measurement, with totals only.
- Stores over 100,000 emails. The sender summary grows with the store; past about 500,000 emails it may need its
  counts kept in SQL.
- Bodies and attachments: the synthetic mail had none, so attachment parts were never read.
- What version 76's 14 new triggers add to a mail sync: there is no version 75 baseline run on the same data.
