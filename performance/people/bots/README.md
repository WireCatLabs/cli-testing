# People bots: what moving programs off people costs the people list and the upgrade

## Why it was run

The owner ruled that a bot (a no-reply or alert address, a messenger's bot, a service's mail) is its own entity, never
a person: its identities leave the person they were linked to, and it is never listed with people (contact-kinds plan
in cli-core [#3323](https://github.com/WireCatLabs/cli-core/pull/3323)). cli-core store version 75 does it
([#3356](https://github.com/WireCatLabs/cli-core/pull/3356)). Two moments do heavy work under the store's write lock,
which other writers wait for at most 5 s:

1. the first people list on a store whose programs were never sorted: the rules move each program's identities to a
   new bot;
2. the upgrade from version 74, which moves every existing bot's identities off its person row.

The question: on a store with 20,000 program senders, does either come near the 5 s wait, and do the warm lists stay
fast?

## Setup

- Machine: AMD Ryzen AI 9 HX 370 (24 threads), Linux 7.0, Node 24.19.0. Other agents' runs kept the load average at
  12 to 18, so the numbers vary a lot between runs and are higher than on an idle machine.
- Code: cli-core branch `feat/bot-entity` (store version 75), built with `pnpm build`.
- Data, all synthetic: 20,000 senders from `noreply-<n>@shop<n % 500>.ru` and 20,000 from `person<n>@firm<n % 300>.ru`,
  saved through `store.people.savePeople` in batches of 2,000, no messages. For the upgrade, the same store is turned
  back into version 74 (version 75's objects dropped) with one `sender_bots` row per program, anchored on its person.
- Each run below is one run of the script; the table gives the range of 4 runs.

```sh
node bench.mjs <cli-core checkout> 20000
```

## Results

| Step | Range over 4 runs |
| --- | ---: |
| first people list: 20,000 programs moved to bots, 40,000 kinds worked out | 2.4–6.0 s |
| of which under the write lock (moves, organizations from domains, kinds) | about 1.0–1.2 s |
| warm people list, first 50 | 17–40 ms |
| warm people list `kind:all`, first 50 | 23–57 ms |
| people counts | 1–3 ms |
| bots list, first 50 | 14–54 ms |
| bots list, a search | 19–48 ms |
| one bot with its moves | 1–3 ms |
| opening a version 74 store with 20,000 bots: the upgrade to 75 | 0.3–3.2 s |
| first people list after the upgrade | 0.6–2.4 s |

The part under the lock was read with timers inside cli-core's `keep` on two runs; the script does not print it.

## What it showed

- The work under the write lock stays at about 1 s, well inside another writer's 5 s wait. Most of the first list's
  time is working out 40,000 kinds outside the lock, as before version 75.
- The upgrade moves 20,000 identities in a fraction of a second to about 3 s, depending on the load. It runs once.
- Warm pages of people and bots stay under 60 ms.
- Giving a rule's bot back once the owner writes to it is checked on every kept list: 25–256 ms with 20,000 bots.

## Not measured

- Stores with messages and mail from the bots: the bots list's counts and last contact read the
  `messages_by_sender_identity_id` and `emails_by_from_identity_id` indexes for a page only.
- An idle machine, and the owner's real store.
