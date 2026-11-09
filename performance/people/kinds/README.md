# People kinds: what a kind, a message count and the newest contact cost the people list

## Why it was run

After the people list learned ties (see [ties](../ties/README.md)), the owner looked at the People page again and
asked for the useful people apart from the noise: newsletters and notifications at the end, companies in their own
filter, nameless and unknown accounts in a separate block, the contact on each row, and an order by how much each
person writes (UX-133, 2026-11-09). cli-core's `people.list` now gives each person one kind (`person`,
`organization`, `automated`, `unsorted`), the messages and mail they sent, and their newest contact, all read on every
call (cli-core #2803).

The question: what does that cost on a store the size of the owner's, and is a stored table or a new index needed?

## Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0. Other agents' test
  runs kept the load average at 11 to 13 during the run, so the numbers are higher than on an idle machine.
- Code: cli-core branch `feat/people-kinds` (#2803), built with `pnpm build`.
- Data, all synthetic: the store [`../ties/bench.mjs`](../ties/bench.mjs) seeds (51,000 identities, 5,000 chats,
  32,000 emails, meetings, address book, CRM records, tasks), plus 1,500,000 messages: a third from random people, the
  rest from 2,000 busy ones, every seventh with no sender.
- Each number is the median of 7 runs after one warm-up.

```sh
node ../ties/bench.mjs <cli-core checkout> /tmp/kinds.db
node bench.mjs <cli-core checkout> /tmp/kinds.db
```

## Results

| Call | Median |
| --- | ---: |
| `kind:person`, sorted by interactions, first 50 | 602 ms |
| `kind:all`, by name, first 50 | 515 ms |
| `kind:person`, by newest contact, first 50 | 1,866 ms |
| `kind:unsorted`, limit 1 (one filter tab's count) | 584 ms |
| a name search, `kind:all` | 81 ms |
| `similar`, 8 people | 12 ms |

Before kinds, a first page with its hidden count took about 95 ms ([ties](../ties/README.md)).

## What it showed

- Reading kinds, message counts and ties for every person costs about half a second per list on a loaded machine.
  The message counts read only the `messages_by_sender_identity_id` index; most of the time goes to reading every
  identity and person and classifying them in JavaScript.
- Sorting by the newest contact reads every message's time and takes about 1.9 s. With an index on
  `messages(sender_identity_id, sent_at)` the same read took about 0.1 s in a quick test; that needs a store migration,
  and is left for when the owner wants that order fast.
- A search or the add-person lookup reads only the people it found, so it stays fast.

## Not measured

- The owner's real store: its message count and sender spread are unknown.
- An idle machine.
- Desktop's four calls for the filter tabs' counts through `commands --serve` together.
