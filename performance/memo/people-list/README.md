# memo people list: kinds kept in the store instead of worked out on every call

## Why it was run

The owner asked to make WireCat Desktop "work real fast" ("we have rather simple queries"). Desktop's page speed run
([../../desktop/page-speed](../../desktop/page-speed/README.md)) found that `memo people list` took 3.7 to 4.2 s on a
warm server with the owner's 113,705 people, whatever the limit, kind or order. The People page made 6 such calls:
the list and 5 kind tabs, about 11 s for the counts alone. A CPU profile showed why: cli-core worked out every
person's kind, message count and name order (about 1.8 s in SQLite and 1.5 s in name checks) before it applied the
limit.

The question: if each person's kind and sort keys are kept on `persons` and kept current by triggers (cli-core
`perf/people-list`, store version 62), what does a list cost, and are the answers the same? This decides whether
Desktop's People and Tasks pages can rely on `people list` and the new `people.counts`.

## Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0. Other agents' jobs
  shared the machine (load average 5 to 8), so differences under about 10 ms are noise.
- Code: before, cli-core `origin/main` at `cfdb54d07` (0.626.0); after, branch `perf/people-list` at `03f80d768` ([cli-core #2817](https://github.com/WireCatLabs/cli-core/pull/2817)). Both
  built with `pnpm build`. The benchmark calls the store directly (`store.people.list`, `store.people.counts`), so
  memo's process start (about 0.65 s cold, 30 to 55 ms on a warm server) is not in these numbers.
- Data, all synthetic. [`seed.mjs`](seed.mjs) builds on [`../../people/ties/bench.mjs`](../../people/ties/bench.mjs)
  at the owner's size: 114,700 identities and 114,721 persons (113,701 after 1,000 merges), 9,800 chats, 2,000,000
  messages (more than half from 2,000 busy people), 64,000 emails from 6,000 mail senders (a third into a bulk mailbox, some
  from no-reply and role addresses), meetings, an address book, CRM records, 200 tasks and 20 people added by hand.
  Names include companies, notification senders and unreadable ones, so every kind is present.
- Each number is the median of 7 runs after one warm-up. "first" is the warm-up. The after column ran at a load
  average of about 7. After the upgrade the first call also
  works out every person once.

```sh
node seed.mjs <cli-core checkout with dist> /tmp/people.db
cp /tmp/people.db /tmp/before.db; cp /tmp/people.db /tmp/after.db
node bench.mjs <before checkout>/dist /tmp/before.db /tmp/answers-before.json
node bench.mjs <after checkout>/dist /tmp/after.db /tmp/answers-after.json
cmp /tmp/answers-before.json /tmp/answers-after.json
node after-sync.mjs <after checkout>/dist /tmp/after.db
node write-cost.mjs <a store at version 61>; node write-cost.mjs <the same at version 62>
cp /tmp/people.db /tmp/review.db
node review.mjs <before checkout>/dist /tmp/review.db; node review.mjs <after checkout>/dist /tmp/review.db
```

## Results

Full output: [`results.txt`](results.txt).

| Call | Before | After |
| --- | ---: | ---: |
| `kind:person`, by messages, limit 1 | 660 ms | 40 ms |
| `kind:person`, by messages, limit 50 | 704 ms | 42 ms |
| `kind:person`, by messages, limit 5000 | 1,032 ms | 134 ms |
| `kind:all`, by messages, limit 5000 | 1,433 ms | 162 ms |
| `kind:all`, by name, limit 50 | 762 ms | 58 ms |
| `kind:person`, by newest contact, limit 50 | 2,439 ms | 51 ms |
| `kind:person`, by tasks, limit 50 | 785 ms | 52 ms |
| one kind tab (organization, automated, stranger, unsorted), limit 1 | 945 to 1,192 ms | 44 to 68 ms |
| a name search, `kind:all` | 101 ms | 64 ms |
| `people.counts`, every kind | (5 lists, about 5 s) | 5 ms |
| limit 50 when 500 / 2,000 / 5,000 people are left to work out | | 113 / 211 / 322 ms |
| limit 50 after a sync of 10,000 messages from 2,000 senders (`after-sync.mjs`) | | 139 to 147 ms |
| first list after the upgrade (works out everyone) | | 2,782 ms |
| `people.linkProposals`, 500 of 25,000 proposals (`memo people review`, [`review.mjs`](review.mjs)) | 190 ms | 12 ms |

- **Answers:** every page of 6 kinds × 4 orders × 3 offsets (0, 50, 4,950), a name search and the add-person name
  match are byte-identical before and after (`cmp` of the two answer files).
- **Write cost:** 50,000 message inserts in one transaction, three runs each. From 2,000 senders (a sync's usual
  shape): 1.7 to 2.3 s before, 1.9 to 2.1 s after. From 110,000 different senders (each insert then clears a new
  person): 1.6 to 3.3 s before, 2.3 to 3.1 s after. The machine was loaded and the ranges overlap; the triggers add
  at most about a third to a message insert, and little when few people write.

## What it showed

- A list now costs what its page costs: about 35 to 70 ms for any kind and order on 113,000 people, and the limit
  decides the rest (130 to 160 ms for 5,000 rows). The kind tabs are one `people.counts` call of 5 ms instead of five
  lists of about a second each here, and about 3.7 s each on the owner's store.
- Most of what is left in a small page is the page's ties (about 20 ms): their tie sets are read whole before they are
  narrowed to the page.
- The cost moves to the first list after a write. Each person a write touched is worked out again: about 0.15 s after
  a sync of 10,000 messages from 2,000 senders, 0.3 s for 5,000 people. Up to 5,000 are worked out under the write
  lock; more are worked out outside it and kept only if no other process wrote meanwhile. The first list after the
  upgrade works out everyone once, as slow as a list was.
- A sync that writes again what the store holds clears no kind: the triggers compare old and new values, and chat
  member lists are now updated row by row instead of deleted and written again (a cli-core test checks this). A big
  group's or channel's size moving by one clears no member's kind either; only a change across the small group limit
  does.
- `memo people review` read, parsed and resolved every link proposal before it took the page. It now pages in SQL
  when it lists everyone's proposals; a list for one person still reads them all.
- If the owner's store is 6 to 8 times slower than this synthetic one, as the page speed run found for the old list,
  a page there would take about 0.2 to 0.3 s on a warm server. That is inferred, not measured.

## Not measured

- The owner's real store. The improvement there is inferred from the synthetic one.
- memo's command (`memo people list`, `memo people counts`) through a process or a warm server, and Desktop's page.
- A list while another process writes all the time and more than 5,000 people are left to work out: the list then
  answers from memory after three tries, as slowly as before.
- A read-only open with people left to work out, which also answers from memory.
- The cost of the triggers on writes other than message inserts (mail, chat members, links, tasks).
- Names whose order differs between JavaScript and SQLite: the stored order compares UTF-8 bytes, the old one UTF-16
  code units. They disagree only when a character above U+FFFF (an emoji) meets one from U+E000 to U+FFFF at the same
  place after folding; the synthetic names have neither.
