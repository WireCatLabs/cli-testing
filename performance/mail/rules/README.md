# Mail sorting rules: what a rule costs the store

## Why it was run

The owner wants to correct how mail is sorted, and to name the scope of each correction: this mail, this list, this
address or this domain, for past mail too or only for new mail (contact-kinds plan in cli-core
[#3323](https://github.com/WireCatLabs/cli-core/pull/3323), section "Mail categories"; owner's rulings 2026-11-25).
cli-core store version 77 keeps these rules in one table and checks them, in a fixed order, before the header
classifier of version 76 ([types](../types/README.md)). A rule change clears the stored types it affects, and the next
read that filters by type works them out again.

Two questions:

1. What does the rule check add to the first typed read, which types every email?
2. How long does a domain rule take to apply to past mail: on a company domain, on a free-mail domain (`gmail.com`,
   allowed only after a dry run), and when it moves a domain's senders to bots?

The answers decided whether rules can stay in the lazy type pass, or need types worked out in SQL.

## Setup

- Machine: AMD Ryzen AI 9 HX 370 (24 threads), Linux 7.0, Node 24.19.0. Other agents' runs kept the load average at
  6 to 17 and wrote to the same disk. Every commit syncs to disk, so times that include a write varied a lot.
- Code: cli-core branch `feat/mail-rules` (store version 77), built with `pnpm build`.
- Data, all synthetic: 100,000 emails from 20,000 sender addresses, saved through `store.mail.saveThreads`, 100 per
  thread. 30% of the senders are on `gmail.com` (6,000 addresses, 30,000 emails), 500 on one shop domain, the rest
  spread over 2,000 company domains. 30% of the mail has a List-Id, 10% an order subject. No bodies.
- The 50 rules: 20 address, 20 domain, 5 List-Id and 5 subject rules, each setting a type.

```sh
node bench.mjs <cli-core checkout> 100000 20000
```

## Results

Runs 2 to 4 below. Run 1 put the company domains under `example.com`, which the Public Suffix List folds into one
registrable domain, so each "company" rule covered 14,000 addresses; its numbers are left out. Run 2's in-memory pass
with no rule ran first and cold; runs 3 and 4 take the best of three after a warm-up. Runs 2 and 3 moved a rule's
senders in the same write as the rule; run 4 is the shipped code, which moves them 100 per write.

| Step | Run 2 | Run 3 | Run 4 |
| --- | ---: | ---: | ---: |
| type all 100,000 in memory, no rule | 1,383 ms (cold) | 560 ms | 484 ms |
| type all 100,000 in memory, 50 rules | 842 ms | 915 ms | 579 ms |
| first typed read, no rule: 100,000 typed and kept | 7.4 s | 9.2 s | 3.4 s |
| first typed read, 50 rules: 100,000 typed and kept | 7.5 s | 18.1 s | 8.2 s |
| 50 rules added, one by one | 15.5 s | 17.4 s | 7.8 s |
| company domain rule (7 addresses, 35 emails): add | 335 ms | 726 ms | 516 ms |
| next typed read | 223 ms | 356 ms | 315 ms |
| `gmail.com` rule: dry run (6,000 addresses, 30,000 emails) | 188 ms | 143 ms | 220 ms |
| `gmail.com` rule: add with its confirm, 29,800 types cleared | 1.2 s | 1.0 s | 1.3 s |
| next typed read: 29,800 typed again | 2.1 s | 1.5 s | 2.8 s |
| undo of the `gmail.com` rule | 1.2 s | 1.6 s | 0.9 s |
| next typed read | 2.1 s | 2.3 s | 2.2 s |
| sender rule: 500 senders of one domain moved to bots | 6.1 s (one write) | 4.0 s (one write) | 5.6 s (5 writes) |
| next typed read | 672 ms | 530 ms | 317 ms |
| removal of that rule: 500 senders moved back (0 bots left) | 577 ms | 368 ms | 868 ms |

## What it showed

- The rule check costs 0.1 to 0.35 s per 100,000 emails in memory with 50 rules (484 → 579 ms and 560 → 915 ms,
  best of 3). A first typed read takes 3 to 18 s either way: the disk sync of each batch's commit, not the rules, is
  the cost, and the spread is the load of the other runs.
- Each rule added takes 0.15 to 0.35 s on 100,000 emails: the preview and the clear each read the emails in its scope,
  and a List-Id or subject rule reads every email.
- Applying a domain rule to past mail is cheap for a company domain (under 1 s to add, then a fraction of a second to
  type again). On a free-mail domain with 30,000 emails it is about 1 s to add and 1.5 to 2.8 s on the next typed read.
  Undo costs the same as the add.
- Moving senders is the slow part: each sender goes through `moveToBot`, about 8 to 12 ms each. In one write, 500
  senders held the write lock for 4 to 6 s, past the 5 s another writer waits. So the code moves 100 per write, 5.6 s
  in total. A sender rule on a free-mail domain with 6,000 senders would take about a minute in total by the same rate
  (an estimate, not measured).
- **Correction (round 2, below):** 100 per write alone did not protect another writer. A second writer measured
  beside the add still waited the full 5 s and gave up, because the writes ran back to back.

## Round 2: undo and removal after the owner-mark fix

### Why

Three gaps in store version 77, fixed in cli-core branch `fix/mail-rules-owner`: the owner's rules must win across
levels; a removed or undone sender rule put its senders back with the owner as author, so the program never sorted
them again; and removal and undo moved senders back in one write. The owner asked for 100 senders per write, as the
add does, so the lock stays under about 1 s and other writers do not give up after 5 s. The question: what does the
undo of a 500-sender rule cost now, and does another writer get the lock meanwhile?

### Setup

- Same machine and data as above. Load average 8.6 to 15.8; other agents' runs wrote to the same disk.
- A second writer, [lock-probe.mjs](lock-probe.mjs), runs in a worker thread beside steps 5 to 7. It writes through
  cli-core's own `write` every 5 ms, as another WireCat command would. That `write` retries the lock every
  millisecond for up to 5 s. The probe reports its longest wait and how often it gave up.
- Three builds: `main` at `acb6646` (#3366), the fix with 100 per write and no pause between writes, and the fix with
  a 2 ms pause between writes (the shipped one).
- A first version of the probe took the lock with a raw `BEGIN IMMEDIATE` and SQLite's own busy handler, which polls
  every 100 ms. WireCat's writers do not work that way, so those three runs are left out.

```sh
node bench.mjs <cli-core checkout> 100000 20000
```

### Results

| Step | `main` (#3366) | fix, no pause | fix, 2 ms pause |
| --- | ---: | ---: | ---: |
| load average at start | 15.8 | 10.5 | 8.6 |
| sender rule: 500 senders moved to bots, 100 per write | 9.5 s | 13.9 s | 6.6 s |
| second writer: longest wait, gave up | 5.0 s, 1 | 5.0 s, 2 | 2.0 s, 0 |
| undo of that rule: 500 senders back | 0.5 s (1 write) | 5.8 s (6 writes) | 3.7 s (6 writes) |
| second writer: longest wait, gave up | 0.2 s, 0 | 4.1 s, 0 | 1.9 s, 0 |
| senders left with the owner's mark after the undo | 500 | 0 | 0 |
| removal of the rule added again: 500 senders back | 0.8 s (1 write) | 1.6 s (6 writes) | 7.0 s (6 writes) |
| second writer: longest wait, gave up | 0.8 s, 0 | 1.3 s, 0 | 2.0 s, 0 |
| senders left with the owner's mark after the removal | 500 | 0 | 0 |

Where one write's time goes, timed once on 20,000 emails and 2,000 senders (load 5.8), for the writes of 100 senders
of an undo and a removal: the work 13 to 23 ms, the store's queued work (stems, mentions) 53 to 68 ms, the `COMMIT`
108 to 3,306 ms.

### What it showed

- **The owner's mark is gone.** On `main`, every one of the 500 senders an undo or a removal put back kept the
  owner's mark, so the program would never sort them again. With the fix, none do.
- **Writes back to back starve another writer, however short each is.** The add's 100 per write still made the
  second writer give up after 5 s, on `main` too. cli-core's `write` pauses after a commit only when it had to wait
  itself, so a loop of writes never left a gap. With a 2 ms pause between writes (what `writeBatch` already does),
  no run gave up.
- **The commit, not the number of senders, sets the lock time.** Putting a sender back takes about 0.2 ms; the
  commit took 0.1 to 3.3 s on this busy disk. So 100 per write did not bring a write under 1 s here, and an undo in 6
  writes took 3.7 to 5.8 s where `main` took 0.5 s in one. In one write, `main`'s undo held the lock 0.2 to 0.8 s.
- Timings that include a commit varied by a factor of 5 between runs (removal 1.6 s and 7.0 s with the same code
  path), with the load of other runs.

## Not measured

- Real mail: how often the owner's rules disagree with the classifier on real data.
- A free-mail domain rule that moves its 6,000 senders.
- Mail sync with sender rules live: sync settles the senders of each saved batch, and its cost per batch was not timed.
- Stores over 100,000 emails, and more than 50 rules.
- Round 2: an idle disk, where the commit is short and the chunk size would matter more.
