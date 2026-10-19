# Re-keying every phone-form chat on the first serve

## Why it was run

WhatsApp moved people from phone-number ids to LID ids. Since WireCatLabs/cli-core#1615 and #1637, `serve` hands
the adapter every stored chat id as `feed` starts (`storedChats`), and wa answers with a re-key for every chat
still stored under a phone-form id. A review of that work (S4) noted that cli-core saved each re-key as its own
store write, so the first `wa serve` after an upgrade does one transaction per chat.

The question: is that slow? It takes too long if it runs more than about 2 s, holds up `serve`'s start, or keeps
the store's write lock long enough to stall other commands. The answer decided whether cli-core batches the
re-keys.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0.
- Code: cli-core `main` at `59505797` ("before"), and the same commit with WireCatLabs/cli-core#1646's change on
  top ("after"), each built with `pnpm build`. The branch was then rebased as `36360b8b`; the rebase brought in
  meeting-evidence code only, nothing on the timed path. A later commit on the branch changes only what happens
  when a whole pass fails, which these runs never hit.
- Data: synthetic only, in a temporary directory. [`bench.mjs`](bench.mjs) opens an empty store through the
  build's `openStore` and writes N one-to-one chats for one account: half under phone-form ids, half under LIDs. Each
  chat gets 20 messages and two sync cursors (`history_start:` and `fetched:`), as a chat an archive run has walked
  keeps. 300 tasks and 300 unresolved evidence links point at phone-form chats. A second account holds 100 chats
  under the same phone-form ids.
- Merges: 10% of the phone-form chats already have a LID twin with 3 messages, one of them also held by the phone
  chat. That share is an assumption; nothing measured how many chats a real store holds twice.
- The path: the build's own `stored` wrapper with a fake adapter. `storedChats` receives the stored ids, and `feed`
  then pushes one batch whose `rekeys` move every phone-form chat to its LID. The total runs until every save has
  finished. Once with no recipient list, and once with a 200-entry list that `rekeyed` updates, as `serve` does.
- Lock: [`neighbour.mjs`](neighbour.mjs) runs in another process on the same file, as another command would, and
  writes one sync cursor every 50 ms while the re-keys run. Its worst wait is how long the re-keys kept it from
  the write lock. The store's `busy_timeout` is 5 s, so a wait past 5 s would fail that command.

```sh
node bench.mjs <cli-core checkout with dist> 2000,10000 20 0.1
```

## Results

Before: one transaction per re-key.

| chats | messages | re-keys (merges) | recipient list | total | rename median / p99 | merge median / p99 | neighbour writes | neighbour worst wait |
|---|---|---|---|---|---|---|---|---|
| 2,000 | 40,000 | 1,000 (100) | none | 1,681 ms | 0.86 / 1.99 ms | 6.47 / 30 ms | 2 | 1,733 ms |
| 2,000 | 40,000 | 1,000 (100) | 200 ids | 2,420 ms | 1.33 / 5.22 ms | 8.25 / 26 ms | 21 | 731 ms |
| 10,000 | 200,000 | 5,000 (500) | none | 11,813 ms | 1.48 / 3.79 ms | 6.91 / 17 ms | 13 | 3,433 ms |
| 10,000 | 200,000 | 5,000 (500) | 200 ids | 13,813 ms | 1.70 / 5.14 ms | 8.04 / 30 ms | 33 | 2,533 ms |

After: one transaction per pass. A pass stops after 50 ms of re-keys, and a 25 ms pause follows it. The longest
pass includes the end-of-transaction work that recomputes search stems and involvements. The 2,000-chat rows ran
while the test suite and the linter were running on the same machine, so their totals may be a little high.

| chats | re-keys (merges) | recipient list | total | longest pass | neighbour writes | neighbour worst wait |
|---|---|---|---|---|---|---|
| 2,000 | 1,000 (100) | none | 1,101 ms | 97 ms | 13 | 56 ms |
| 2,000 | 1,000 (100) | 200 ids | 1,237 ms | 94 ms | 14 | 119 ms |
| 10,000 | 5,000 (500) | none | 9,587 ms | 129 ms | 119 | 81 ms |
| 10,000 | 5,000 (500) | 200 ids | 9,916 ms | 120 ms | 118 | 81 ms |

In every run, no phone-form chat was left on the first account, and the second account kept all 100 of its chats
under their phone-form ids. The raw tables the script prints are in [`results.md`](results.md).

## What it showed

- The total is not the problem. It runs after `feed` has started, so it does not hold up `serve`'s start. At
  10,000 chats it takes about 12 s before and 10 s after.
- The lock was the problem. Back-to-back transactions left almost no gap, so another process's busy handler kept
  missing the free lock. During the 10,000-chat run, the neighbour got 13 writes through in 12 s and waited up to
  3.4 s for one. With a larger store or more merges, that wait would pass the 5 s `busy_timeout`, and the other
  command would fail with "database is locked". After the change, its worst wait was 81 ms over about 119 writes.
- Batching saves only about 20% of the total. One transaction per pass removes the commit and the derived-work
  recomputation for each re-key. Each re-key still does its own work: merges take about 7 ms, and renames take
  about 1.5 ms at 10,000 chats. A rename scans the account's sync cursors (`LIKE '%:' || id`), and the tasks and
  links by `substr` prefix. None of these scans can use an index, so a rename gets slower as the store grows.
- The recipient list adds a file lock and a rewrite for each re-key: 17–44% of the total before the change, 3–12%
  after. Its time no longer adds to a chain of back-to-back transactions; why the share fell was not measured.

## Not measured

- A real store. The share of chats held twice, and the number of cursors, tasks and links, are guesses.
- Bun.
- Making each rename cheaper, for example by renaming every pair's cursors and locators in one statement per pass.
  That would cut the total. It was not needed to fix the lock, and it would rewrite logic that an exact,
  pair-by-pair rename depends on (for example, a chain where one pair renames a→b and the next renames b→c).
- Another process holding the lock while the re-keys wait. `serve`'s side then waits up to `busy_timeout` per
  pass, as it did per re-key before.
