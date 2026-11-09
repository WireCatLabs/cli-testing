# Link proposal recall: an invented project, then a copy of the real store

## Why

In the third PMED run (`project-state`), `memo relationships scan` recovered 4 of the project's 15 removed links
after two rounds (27 %), against a target of 80 %. It never proposed a Telegram chat. The question: why does the scan
stop at the first messenger, and does spreading within one run reach the rest without proposing wrong links? The
answer fed [cli-core#2639](https://github.com/WireCatLabs/cli-core/pull/2639).

## Setup

- The project is invented and shaped like the owner's. Its client groups are in MAX. The contractor and the 1C person
  have dialogs in Telegram, and three people are linked across both messengers by identity. Gold: 8 chats and 7
  people. One gold link, a reminder bot's dialog, has no signal at all.
- Decoys: the owner's team chat, a 40-person market group the client people are in, the owner's dialogs with client
  people, a namesake of the 1C person in Telegram, and a partner who is in another project.
- Each round scans without writing. The owner then confirms the proposals that are in the gold set, the way the
  owner's run emulated it.
- Two ways to run it, with the same numbers:
  - [`recall.test.ts`](https://github.com/WireCatLabs/cli-core/blob/a2f4ecd8b1bb269d69d32dd1747593160719f9ad/src/services/link-scorers/recall.test.ts)
    in cli-core (merged with #2639), which builds the store in memory and calls the scan directly. The baseline was
    the same test against the scorers of cli-core `b26074120`.
  - [`fixture.mjs`](fixture.mjs) writes the same invented store to a file through cli-core from npm, and
    [`recall.mjs`](recall.mjs) runs the installed `memo relationships scan` on it round by round. This is the same
    script as the real-store check below.

```sh
# in cli-core, after pnpm install
git checkout a2f4ecd8b && pnpm vitest run src/services/link-scorers/recall.test.ts --maxWorkers=1

# in this folder, with any memo installed; --core must not be newer than the memo's own cli-core
node fixture.mjs /var/tmp/link-recall/fixture.db --core 0.606.0
node recall.mjs copy /var/tmp/link-recall/fixture.db /var/tmp/link-recall/run/store.db
node recall.mjs /var/tmp/link-recall/run/store.db --project LKM --sources max:1,telegram:2 --rounds 2

# before #2639: memo 0.131.43 (cli-core 0.589.0) in its own folder
npm install --prefix /var/tmp/link-recall/memo-old @wirecat/cli-memo@0.131.43
node fixture.mjs /var/tmp/link-recall/fixture-old.db --core 0.589.0
node recall.mjs copy /var/tmp/link-recall/fixture-old.db /var/tmp/link-recall/run-old/store.db
node recall.mjs /var/tmp/link-recall/run-old/store.db --project LKM --sources max:1,telegram:2 --rounds 2 \
  --memo /var/tmp/link-recall/memo-old/node_modules/.bin/memo
```

Rerun 2026-11-08 with `recall.mjs`: memo 0.131.43 gave recall 7 % then 27 %, precision 100 %; memo 0.131.54 gave
93 % and 93 %, precision 74 %, 5 false, the reminder bot missed. Both match the table.

## Results

| | Before (b26074120) | After (#2639) |
| --- | --- | --- |
| Recall after round 1 | 7 % | 93 % |
| Recall after round 2 | 27 % | 93 % (100 % of findable) |
| Precision | 100 % | 74 % |
| False proposals | 0 | 5 |
| Proposed by name only | 0 | 0 |
| Telegram links reached | 0 of 3 | 2 of 3 |

## Scan time

The plan's limit is 5 s for one scan of 2 000 chats. The fixture is
[`scan-time.test.ts`](https://github.com/WireCatLabs/cli-core/blob/a2f4ecd8b1bb269d69d32dd1747593160719f9ad/src/services/link-scorers/scan-time.test.ts)
in cli-core: 2 041 chats (1 000 MAX groups, a third of them with 6 people and the rest with 40; 600 Telegram groups of
8; 440 dialogs), 400 people, 40 of them with accounts in both messengers, and 86 000 messages. The command is
`LINK_SCAN_TIME=1 pnpm vitest run src/services/link-scorers/scan-time.test.ts --maxWorkers=1`, one worker, on the
owner's laptop with 8 GB free.

| | One scan |
| --- | --- |
| origin/main, nothing confirmed (it stops at the named group) | 19–34 ms (3 runs) |
| origin/main, the named group and its 8 people confirmed | 52–100 ms (3 runs) |
| #2639, nothing confirmed (it spreads 4 times) | 0.7–2.1 s, median 1.2 s (6 runs) |

The scan stays under the limit, but it is now 10 to 20 times slower, because each pass reads the seed chats'
messages again. No cache was added.

## What it showed

- The scan spread only from confirmed links, so it took one owner round per step. Telegram dialogs are three or four
  steps from the group that names the project, so two rounds never reached them.
- People who wrote 1 to 4 messages in a small group were never proposed, so the chats behind them were never reached.
- With spreading, precision fell to 74 %, inside the plan's limits (at least 60 %, at most 5 false proposals). The
  false proposals are the owner's dialogs with client people, the owner's team chat and one of its members, and the
  market group.

## On a copy of the owner's store (2026-11-08)

### Why

The fixture said 93 %. The owner asked to check it where run 3 measured 27 %: on a copy of the real store, the
same project, the same 15 removed links, with only totals leaving the copy.

### Setup

- memo 0.131.52 (cli-core 0.605.0), Node 24.19.0, Linux 7.0. The store copy was 5.9 GB; `recall.mjs copy` needs that much free disk.
- The method `recall.mjs` now scripts, done by hand that day: the project's 15 confirmed member links (8 chats: 5 in
  MAX, 3 in Telegram; 7 people) saved in a table of the copy and deleted, then up to three scans of the two
  messenger accounts, each scored against the 15, with the gold proposals put back as confirmed. The run on the day
  wrote the proposals (`--yes`); `recall.mjs` scans without writing, which lists the same proposals.
- Every run had its config, data and state folders inside the copy's folder and no D-Bus. No sync, no network. The
  copy was deleted afterwards.
- Chat titles, names and ids are in a private report in cli-private (`reports/2026-11-08-pmed-stepc-real-store.md`).

```sh
node recall.mjs copy ~/.local/share/WireCat/wirecat.db /var/tmp/stepc/store.db
node recall.mjs /var/tmp/stepc/store.db --project <key> --sources <account>,<account> --rounds 3
```

`recall.mjs` refuses the live store path, refuses a copy it already used, and prints totals only. The proposed and
missed references go to `<copy>.recall.json` beside the copy, which stays on the machine. `--extra-gold <file>` (one
reference per line) recomputes the totals with links the owner later ruled in.

### Results

| | Run 3 (memo 0.131.43) | memo 0.131.52, as measured | Same, after the owner's ruling |
| --- | --- | --- | --- |
| Gold links | 15 | 15 | 20 |
| Recall after round 1 / 2 / 3 | 7 % / 27 % / 47 % | 53 % / 53 % / 53 % | 65 % |
| Precision | 100 % after 2, 78 % after 3 | 47 % (8 of 17) | 76 % (13 of 17) |
| False proposals | 2 | 9 | 4 |
| Proposed by name only | 0 | 0 | 0 |
| Messengers of found links | MAX only | MAX only | MAX only |

The ruling: five of the nine false proposals were frequent senders of the client's large sales group. The owner said
they belong to the project (sales and client questions need them), though he rarely talks to them, so they count as
gold. The other four false ones are three dialogs with group members and one more group sender.

Scan time (memo's `duration_ms`): 0.7 s, 17.8 s, 10.9 s for rounds 1 to 3; later runs 0.3 to 2.6 s.

### What it showed

- The spread within one run works on real data: round 1 found everything it would ever find (53 %), more than run
  3 found in three rounds (47 %). It is still short of the 80 % target.
- The 7 missed links are all on the Telegram side or behind a dialog: 3 Telegram dialogs, 1 MAX dialog, and 3 people
  with only a Telegram identity. None of them writes in a project group, and no gold person had identities in both
  messengers, so no path led there. After the owner joined one person's Telegram and MAX identities, a dry run on the
  live store proposed a Telegram dialog for the first time (not scored).
- A large group's senders are proposed like the owner's working circle. The scan should name the group in such a
  proposal's reason so the owner can confirm them as a batch.
- Two scans took 17.8 s and 10.9 s right after the confirmed links were put back with SQL, against 0.3 to 2.6 s for
  every other run. The cause is not known. `recall.mjs` records every round's time, so a rerun shows whether it
  repeats. The cause was found later: see [Why two rounds were slow](#why-two-rounds-were-slow-perf-80).

## Why two rounds were slow (PERF-80)

### Why

Rounds 2 and 3 on the copy of the owner's store took 17.8 s and 10.9 s, round 1 took 0.7 s. The question: what in
the scan makes it slow, and can it be made slow and fast at will? The answer decided whether cli-core needed a fix.

### Setup

- [`spread-time.mjs`](spread-time.mjs) builds a synthetic store (2 600 chats: 1 500 MAX groups of 6 or 40 people, a
  150-person sales group with 40 000 messages, 600 MAX dialogs, 1 000 Telegram groups, 200 Telegram dialogs; 560 000
  messages, 412 MB; 17 confirmed member links of project LKM). Each run copies it and, on the copy, scans (dry run)
  with the links in, takes them out with SQL, scans, and puts them back with SQL, as `recall.mjs` does. It counts the
  store calls the scan makes and hashes the proposals.
- Node 24.19.0, Linux 7.0, the owner's laptop, one run at a time, 11 GB free. cli-core 0.612.0 against #2714 (packed
  from the branch).

```sh
node spread-time.mjs build /var/tmp/claude/perf80/stores/spread.db --core 0.612.0
node spread-time.mjs /var/tmp/claude/perf80/stores/spread.db --core 0.612.0 --rounds 2
node spread-time.mjs /var/tmp/claude/perf80/stores/spread.db --core <version with #2714> --rounds 2
```

### Results

One dry-run scan, two rounds each:

| | cli-core 0.612.0 | #2714 |
| --- | --- | --- |
| Confirmed links in | 4.9 s, 5.8 s | 0.85 s, 0.63 s |
| Confirmed links taken out | 1.9 s, 1.6 s | 0.33 s, 0.29 s |
| Person lookups, links in / out | 50 730 / 14 808 | 161 / 102 |
| Message page reads (up to 2 000 messages each), links in / out | 1 522 / 358 | 452 / 177 |
| A member's chats read, links in / out | 584 / 132 | 92 / 34 |

The proposals were the same in every row of a column pair (same hash). Putting the links back makes the scan slow
again, and taking them out makes it fast, every time.

### What it showed

- The scan spreads up to 4 times. Each pass ran the spreading scorers again over every chat and person found so
  far, not only the new ones: it read each chat's messages again, looked up each sender's person again (twice: in
  chat-senders and in the scan's identity check), and read each member's chats again.
- With confirmed links in, the first pass already starts from them, so the passes cover more chats (452 against 177)
  and each one costs more. That is the shape of the real run: round 1 had its links taken out, rounds 2 and 3 had
  them back. The 17.8 s against 10.9 s difference is probably a cold disk cache on the 5.9 GB copy; that was not
  measured.
- [#2714](https://github.com/WireCatLabs/cli-core/pull/2714) gives a scan a memory of what it read: 6 to 8 times
  faster here, the same proposals.
- Ruled out: the queue of work that a link written by SQL leaves for the next store write (18 entries here, all
  indexed queries; a writing scan took as long as a dry one), and slow single queries: the scan's reads are indexed
  except the relation list, which scans the links table but did not show among the costly calls.

### Not measured

- The owner's store itself: no copy was opened for this. Why later real runs took only 0.3 to 2.6 s is not
  known; they ran on other states of the store.
- The store at the real size (5.9 GB) and a cold disk cache.

## Not measured

- In the fixture: a contact reachable only by the project name in messages stays unfound. Inflected Russian forms of
  the name are not matched.
- On the real store: re-proposal of rejected links (rejecting needs the owner), other projects, and the cause of the
  two slow scans (found on a synthetic store: [PERF-80](#why-two-rounds-were-slow-perf-80)). `recall.mjs` itself ran only on the fixture; the real-store numbers above were scored by hand.
