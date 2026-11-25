# People: what making newsletter-only senders bots costs the people list

## Why it was run

On 2026-11-25 the owner ruled that a sender who only sends a newsletter is a bot, even when a human writes it (an
author on a newsletter platform). Before, such a sender stayed a person with reach `broadcast`. cli-core branch `feat/newsletter-bots`
builds it. The first people list after the upgrade moves every such sender to a bot. Each later list also checks
whether a 1-to-1 mail or the owner's reply should give a newsletter bot back. Both run under the store's write lock,
and other writers wait for it for at most 5 s.

The questions:

1. How long does the first people list take on 20,000 newsletter senders?
2. What does the give-back check cost on each later list?

## Setup

- Machine: AMD Ryzen AI 9 HX 370 (24 threads), Linux 7.0, Node 24.19.0. Other agents' runs kept the load average at
  15 to 52 during the runs, so the numbers vary a lot and are higher than on an idle machine.
- Code: cli-core branch `feat/newsletter-bots` (store version 77, no migration), built with `pnpm build`.
- Data, all synthetic:
  - 20,000 newsletter senders `author<n>@letters<n % 400>.ru`, each with 2 mails that carry a List-Id and
    List-Unsubscribe.
  - 20,000 humans `person<n>@firm<n % 300>.ru`, each with 2 plain mails to the owner.
  - The senders are saved through `store.people.savePeople`. The 80,000 mails are written straight into the store's
    tables.
- With `lists` = 0, the newsletter senders' mail has no list headers, so nobody moves. That run measures the rule's
  pass alone.
- The kept list nulls one person's stored kind and lists again, so `keep` and the give-back check run once.
- The give-back check alone is `ruleBotsBack` in a transaction that is rolled back, three times per run.

```sh
node bench.mjs <cli-core checkout> 20000 1   # newsletter senders become bots
node bench.mjs <cli-core checkout> 20000 0   # same mail, no list headers
```

## Results

| Step | 20,000 newsletter bots | No bots (lists = 0) |
| --- | ---: | ---: |
| first people list, 40,000 kinds worked out (5 runs / 5 runs) | 3.2–13.3 s, one run 91 s at load 48 | 2.1–10.6 s |
| warm people list, first 50 | 20–34 ms | 27–29 ms |
| bots list, first 50 | 18–39 ms | 1 ms |
| kept list after one stale kind | 0.6–3.7 s | 0.14–13.5 s |
| give-back check alone (`ruleBotsBack`), 6 timings | 31–51 ms | 0 ms |

## What it showed

- The give-back check, the one new step under the write lock on every kept list, costs 31–51 ms with 20,000
  newsletter bots. That is far inside another writer's 5 s wait.
- The first list with 20,000 moves takes about as long as on the [bots](../bots/README.md) page (2.4–6.0 s for 20,000
  program senders) once the load is moderate. The moves use the same code as there, where the write lock was held for
  about 1 s.
- The kept list varies more with the machine's load than with the bots: a run with no bots took 13.5 s at load 18.
  These numbers say nothing about the change itself.
- Warm pages stay under 40 ms.

## Not measured

- The time under the write lock during the first list. These runs did not time it. The bots page measured about
  1 s for the same moves.
- An idle machine. Every run here shared the machine with other agents' builds and tests.
- Stores whose newsletter senders also have messenger identities or ties: the rule skips them before any mail is read.
