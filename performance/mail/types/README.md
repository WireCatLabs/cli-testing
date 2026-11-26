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

## Search by type and reach

### Why it was run

memo searches mail only through cli-core's search (`memo search mail`). A filter by type that memo ran after the
search would return short pages, so cli-core's query language gained `type:` and `reach:`, which filter inside the
query's SQL ([cli-core#3372](https://github.com/WireCatLabs/cli-core/pull/3372)). Types are still kept lazily, so a
search can meet mail the store has not typed yet. The questions:

1. What does the first `type:` search after the upgrade cost on 100,000 emails, on a writable open (every email typed
   first, 5,000 per write) and on a read-only open (types worked out in memory, nothing kept)?
2. The search has a 2 s time limit. Does the read-only path stay inside it?
3. Do warm searches with `type:` or `reach:` cost more than a plain word search?

The answers decided that the typing runs before the search, outside its time limit, and only when the query names
one of the two fields.

### Setup

- Machine: AMD Ryzen AI 9 HX 370 (24 threads), Linux 7.0, Node 24.19.0. Other agents' test runs kept the load average
  at 22 to 28 during the run.
- Code: cli-core branch `feat/search-mail-type` (store version 77), built with `pnpm build`.
- Data: the same 100,000 synthetic emails as above, from the same generator, saved through `store.mail.saveThreads`.
- Search: `searchStore` with `kind: "mail"`, 20 hits per page, the call `memo search mail` makes.

```sh
node search.mjs <cli-core checkout> 100000
```

### Results

One run.

| Step | Time |
| --- | ---: |
| read-only open of an untyped store: `type:order`, first 20 | 1.83 s |
| read-only open of an untyped store: `hello reach:direct`, first 20 | 1.49 s |
| first search on a writable open: type all 100,000 emails, then `type:order`, first 20 | 18.4 s |
| warm `type:order` | 33 ms |
| warm `type:order OR type:bill` | 35 ms |
| warm `reach:broadcast` | 72 ms |
| warm `hello type:personal` | 105 ms |
| warm `order -type:promotion` | 65 ms |
| warm `hello`, no type field (baseline) | 40 ms |

Plain searches typed nothing: 100,000 emails were still untyped after a plain search and after both read-only
searches, and none after the first writable `type:` search. Every hit carried its type and reach, also on the read-only
open.

The first plain search after seeding took 564 s. That is the store indexing the words of 100,000 new emails on the
first search after they were saved, not the type fields: the same happens with no `type:` in the query.

### What it showed

- The first writable `type:` search pays once for typing every email: 18 s here, 1.7–11.6 s in the runs above at a
  lower load. The time is the commits' sync to disk, as above. Later searches never pay it again.
- A read-only open of an untyped store answers in 1.5–1.8 s, close to the 2 s limit. Under heavier load it may stop
  with "out of time". The answer is to run one search on a writable open, which keeps the types.
- Warm, the type fields cost about as much as a word: 33–105 ms against 40 ms for a plain word search.

### Not measured

- More than one run: the load varied, so the first-search time has a wide range.
- Stores over 100,000 emails. The read-only path grows with the number of untyped emails and passes the 2 s limit
  sooner on a larger store.
- Real mail: the timings depend on how many emails a type matches, and the synthetic mix is not a real inbox.

## The first search after a large save

### Why it was run

The two runs above left two slow first searches (PERF-4 and PERF-5 in the owner's journal):

- **PERF-4.** On a read-only open, the first `type:` search took 1.5–1.8 s against the search's 2 s time limit. Types
  were kept only by a read on a writable open, so a read-only open worked out every untyped email in memory.
- **PERF-5.** The first plain search after seeding took 564 s. The store indexed the words of all 100,000 new emails
  on that search, committing every 200 emails.

The question: what makes both first searches fast without making mail sync much slower? The options weighed were
indexing and typing inside the save's own write, doing it at the end of mail sync, and a time budget per write for the
drain. The answers decided cli-core [#3404](https://github.com/WireCatLabs/cli-core/pull/3404): each save indexes and
types its own mail, and mail sync finishes what an upgrade left.

### Setup

- Machine: AMD Ryzen AI 9 HX 370 (24 threads), 59 GB RAM, NVMe, Linux 7.0, Node 24.19.0. Other agents' runs kept
  the load average at 11 to 13 during both runs below and at 25 to 32 during the `search.mjs` runs.
- Code: cli-core `main` at 7cbf47f6e (before) and branch `perf/mail-first-search` (after), built with `pnpm build`.
- Data: the same synthetic generator as above. [first-search.mjs](first-search.mjs) seeds 100,000 emails through
  `store.mail.saveThreads`, 2,000 per save, then:
  1. the first searches: two on a read-only open, then a plain and a `type:` search on a writable open;
  2. 20 sync-sized saves (50 new threads of 2 emails each: mail sync saves 50 threads per write);
  3. a store as the upgrade to version 76 leaves it (every type cleared), one sync-sized save, the first searches;
  4. the same, with the catch-up step mail sync now runs after it saves;
  5. every email also queued for its words again (as a stemmer change leaves a store), one save, its catch-up.

```sh
node first-search.mjs <cli-core checkout> 100000
node search.mjs <cli-core checkout> 100000
```

### Results

One run each, before and after, on the same machine within an hour.

| Step | Before | After |
| --- | ---: | ---: |
| seed 100,000 emails, 50 saves | 45.3 s | 58.5 s |
| one save of 2,000 emails, median | 850 ms | 1,193 ms |
| one sync-sized save (100 emails), median of 20 | 67 ms | 103 ms |
| left after seeding: untyped, queued for words | 100,000, 100,000 | 0, 0 |
| fresh store, read-only: `type:order` | failed | 74 ms |
| fresh store, read-only: `hello reach:direct` | failed | 147 ms |
| fresh store, first plain search `hello` | 12.1 s | 87 ms |
| fresh store, first `type:order` on a writable open | 2.0 s | 63 ms |
| upgraded store, read-only: `type:order` | failed | 2.3 s |
| upgraded store, first `type:order` on a writable open | 2.0 s | 2.0 s |
| upgraded store, catch-up at the end of the sync | none | 1.9 s |
| upgraded store after the catch-up, read-only: `type:order` | failed | 53 ms |
| words queued again, catch-up at the end of the sync | none | 20.9 s |
| words queued again, first plain search | 20.6 s | 98 ms (after the catch-up) |
| warm `type:order`, warm `hello` | 56–60 ms, 89–99 ms | 53–61 ms, 81–109 ms |

"Failed" is `attempt to write a readonly database`: on `main`, a read-only search whose store still has mail waiting
for its words tries to queue that mail's threads first. The runs above never saw it, because a writable search always
ran first.

The original [search.mjs](search.mjs), at load 25 to 32:

| Step | Before | After |
| --- | ---: | ---: |
| seed 100,000 emails | 66.7 s | 67.3 s |
| first plain search `hello` | 17.3 s | 136 ms |
| read-only, `type:order` | 2.8 s | 71 ms |
| read-only, `hello reach:direct` | 2.8 s | 170 ms |
| first `type:order` on a writable open | 2.2 s | 65 ms |

A CPU profile of 60 sync-sized saves on a store of 20,000 emails put 14 ms per save into the new work: 12 ms indexing
the words and pieces, 2 ms typing. Most of the rest of a save was the commit's sync to disk.

### What it showed

- **The 564 s did not come back.** The same first search took 12.1 s at load 12 and 17.3 s at load 30. The drain
  committed every 200 emails, so 500 times, each with a full sync to disk. The [commit cost](../../store/commit-cost/README.md)
  page measured 140–225 ms per commit when other programs write to the disk, so that run most likely paid for 500
  slow commits. This is an inference: the commits of that run were not counted.
- **Work done in the save's own write costs no commit.** The first searches on a fresh store went from 2–12 s (or a
  failure on a read-only open) to 63–147 ms, the same as warm searches.
- **Saving costs more CPU.** A save of 2,000 emails took 40 % longer and a sync-sized save 36 ms longer in this run,
  of which the profile puts 14 ms in the new work; the rest is load and disk noise between runs. A mail sync's slice
  waits for the mail server far longer than that.
- **An upgraded store still needs one pass.** Typing mail stored before version 76 takes about 2 s, and indexing
  100,000 emails again about 21 s. Mail sync now does it once, at its end; the first search after that answers in
  53–155 ms on a read-only open too. Until that sync runs, a read-only `type:` search still works the types out in
  memory, 2.3–2.5 s here.
- **The time limit did not stop the read-only search.** The 2 s limit was passed (2.3–2.8 s) with no "out of time"
  in both builds. Why was not checked.

### Not measured

- More than one run each. The load moved between runs, so differences under about 30 % are noise.
- What the time budget per write of the drain (up to 250 ms of batches of 200 instead of one batch) changes: on this
  machine the commits were fast during the runs, and the upgraded-store drain took about as long either way.
- Real mail with bodies: the synthetic mail has subjects only, so the word index per email is cheaper than on a real
  inbox (1.5 ms an email with text in [indexing](../indexing/README.md)).
- Discussion lists: every synthetic list has one sender, so the trigger that clears a list's types when its third
  sender appears never fired. On a real inbox a list's first issues are typed at save and typed again later.
- Other writers than `saveThreads` and `saveThread` (deletes, restores, flags, mail rules) still leave their changes
  for the next drain or catch-up.
- Stores over 100,000 emails.
