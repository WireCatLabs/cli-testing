# People ties: work out who is real on every read, or store it?

## Why it was run

WireCat Desktop's People page showed about 5,000 people as accordion rows, most of them strangers seen only as
authors in big groups. The owner ruled that a person is **real** when they have a tie to him: a one-to-one chat, mail
he wrote to them, a meeting, a CRM record, an address-book contact, or a shared group of at most 10 members. Everyone
else is hidden by default in every people listing, and shown with `--all`.

The question: can cli-core's `people.list` work the ties out on every read, on a store the size of the owner's
(about 51,000 identities), or does it need a ties table kept up to date after each sync? The plan's rule: read on
every call if the first page with its hidden count comes back under 200 ms, store otherwise. The answer decided
whether store migration 61 adds a ties table or only the address-book marker.

## Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0 (its own SQLite 3.53.3).
- Code: cli-core branch `feat/people-ties` at `e91563fd5` (on `main` 01e10f61d), built with `pnpm build`.
- Path: cli-core's own `store.people.list`, `similar` and `scanMatches` on a new temporary store. No network, no
  account, no CLI run, a throwaway `HOME` and `DBUS_SESSION_BUS_ADDRESS=disabled:`.
- Data, all synthetic, written straight into the tables:
  - 51,000 Telegram identities, each its own person, every 97th named `!`; 1,000 of them merged in pairs; 20 people
    added by hand; 200 tasks, each assigned to one person.
  - 5,000 chats: 3,000 one-to-one, 300 groups of 3 to 14 members, 100 groups of unknown size, 1,600 big groups and
    channels (50 to 5,000 members, 30 to 300 of them on the member list): 268,908 member rows.
  - 32,000 emails with 2 KB bodies: 30,000 incoming from 3,000 senders, 2,000 written by the owner to two people each.
  - 400 meetings of 4 participants, 1,500 address-book contacts, 300 CRM person records.
- Each number is the median of 7 runs after one warm-up. The "stored" column builds the same ties into a table and
  reads a page from it, as a ties table refreshed after each sync would.

```sh
cd <cli-core checkout> && pnpm build
node performance/people/ties/bench.mjs <cli-core checkout> [store file to reuse]
```

[`bench.mjs`](bench.mjs) seeds the store unless the file exists, then prints one JSON. The numbers below are three
runs on one store (the first one seeded it).

## Results

Of 51,021 people, 10,412 have a tie and 39,609 are hidden (78 %).

| Read | Median, ms (3 runs) |
|---|---|
| First page of 50 with total and hidden count (`people list`) | 95, 96, 97 |
| Page 20 | 96, 97, 99 |
| Sorted by name | 97, 98, 97 |
| `--all`: every person, sorted by task count | 229, 238, 228 |
| Search by name (`Garcia 12`) | 55, 53, 55 |
| Every person's ties alone (one pass over all tie tables) | 44, 43, 41 |
| `similar` for `ivan petrov` | 63, 73, 68 |
| `similar` for `iv` | 82, 90 (8 in the first run, see below) |
| Full matcher pass (`scanMatches({ full: true })`), with the new name signal | 100, 106, 97 |

The stored way, for comparison: refreshing a ties table took 47–51 ms, and a first page read from it 11–12 ms.

These three runs were on a quiet machine. Three more, while other sessions kept the load average near 9, gave a
first page of 121–237 ms, ties alone 58–62 ms, and the stored way 65–74 ms to refresh and 13–15 ms a page: every
number grew, the stored way's too.

## What it showed

- **Reading on every call is fast enough.** A first page with its hidden count takes about 95 ms, half the 200 ms
  bar. Of that, about 43 ms is working out every person's ties; the rest is counting, sorting and the page's rows.
  cli-core keeps no ties table: migration 61 only adds the address-book marker (`account_identities.address_book`)
  and its index. A table would save about 85 ms a read, but would need a refresh after every sync and could go stale.
- The first version took 144 ms: it worked out the ties three times per call and every row's contact columns before
  sorting. Working out the ties once, and the contact columns for the page only, made it 95 ms.
- `--all` takes about 230 ms, since it sorts all 50,000 people. The ties do not cost it more.
- The matcher's full pass went from about 6 ms to about 100 ms with the name signal: it reads every person's name to
  group them. The pass after a sync reads only names of people whose identities changed.
- `similar iv` took 8 ms in the first run only because the seeded identities had no folded names yet: the store fills
  them on its next open. 82–90 ms is the real number.

## What was not measured

- The owner's real store. How many of his groups have an unknown size (counted as large, so hidden) is unknown.
- A cold disk cache: every run read a store already in memory.
- A busy machine beyond the three runs above.
- The cost of a Node process start, which a CLI call adds to every number here.
- Bun.
