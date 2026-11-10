# People ties from message senders: what they cost the people list

## Why it was run

The owner's top Telegram and WhatsApp contacts showed up as `stranger` in WireCat's people list. Those messengers
keep no member list, so a one-to-one chat or a small group gave nobody a tie to the owner (see [ties](../ties/README.md)
for what a tie is). cli-core 0.630.0 also counts whoever wrote in a one-to-one chat or a group of at most 10 people as
that chat's people. That means reading the messages, not only the member list.

The question: what does reading the senders cost `people list`, for every person and for one page? The answer decided
how cli-core asks for the ties. The first version read every message for every call, even for one page.

## Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0 (its own SQLite). Other
  sessions were running: the load average was 4.9 to 8.9.
- Code, three versions of cli-core:
  - 0.629.0 from npm: ties from the member list only;
  - commit `6b677fe36` (the first version of the change), built with `pnpm build`: senders read in one pass over all
    messages, for every call;
  - 0.630.0 from npm: the same pass for everyone, and for a page a lookup per person through the index on the
    sender (`messages_by_sender_identity_id`).
- Path: cli-core's own `shownReasons` and `store.people.list` on a new temporary store. No network, no account, no
  CLI run, a throwaway `HOME` and `DBUS_SESSION_BUS_ADDRESS=disabled:`.
- Data, all synthetic: 40,000 Telegram people and the owner; 3,000 chats, of which 2,000 are one-to-one, 500 groups of
  5 and 500 groups of 500; 400,000 messages spread over the chats and people, half of them the owner's own.
- Each number is the median of 7 runs after one warm-up. The table shows three runs of the script, each on a new store.

```sh
mkdir core && cd core && npm install --ignore-scripts @wirecat/cli-core@0.630.0
node performance/people/ties-senders/bench.mjs <that folder, or a cli-core checkout built with pnpm build>
```

[`bench.mjs`](bench.mjs) seeds the store and prints one JSON line.

## Results

| cli-core | People with a tie | Every person's ties, ms | Ties of a page of 50, ms | `people list` page, ms |
|---|---|---|---|---|
| 0.629.0 (member list only) | 1 of 40,001 | 6, 6, 6 | 0.3, 0.3, 0.3 | 3, 3, 3 |
| `6b677fe36` (one pass for every call) | 40,001 | 129, 127, 130 | 94, 93, 92 | 99, 100, 102 |
| 0.630.0 (a lookup per person for a page) | 40,001 | 194, 132, 132 | 0.7, 0.7, 0.7 | 8, 8, 7 |

The first `people list` call on a new store takes 0.6 to 0.9 s in every version: it works out and stores each person's
kind once.

## What it showed

- **Reading the senders is cheap for a page, if it is asked per person.** One pass over 400,000 messages takes about
  130 ms. The first version paid that on every page, so a page went from 3 ms to about 100 ms. Asking only for the
  page's people through the sender index takes 0.7 ms, and a page of the list about 8 ms.
- **For every person, one pass is faster than a lookup per person.** A lookup per person for all 40,000 people took
  about 470 ms in a trial run, against 130 ms for the pass. So 0.630.0 uses the pass when it needs everyone and the
  lookup for a page.
- In 0.629.0 nobody but the owner had a tie: the synthetic chats have no member list, as Telegram and WhatsApp chats
  have none in the owner's store. That was the bug.

## What was not measured

- The owner's real store. On it, cli-core 0.630.0 ties 2,842 people instead of 113,705 `person` before; that count is
  the only number taken from it.
- A cold disk cache: every run read a store already in memory.
- More messages: the cost of the pass for everyone grows with the messages in one-to-one chats and small groups.
- The cost of a Node process start, which a CLI call adds to every number here.
