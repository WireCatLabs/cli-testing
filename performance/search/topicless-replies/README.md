# A reply that does not name its topic

Measured 2026-11-06 for FIND-2300, with [cli-core#2557](https://github.com/WireCatLabs/cli-core/pull/2557) (0.593.0).

## Why we ran it

In the third PMED test run, a contractor's short reply put off a piece of work, but never named it. It was a formal
reply to the owner's message that did. `memo search messages` with the topic's words found the owner's message and
not the reply, so both agents missed the answer.

Discovery already reads a reply with its parent ([PROCESS.md, section 4](../PROCESS.md)), and `search all` uses
discovery for a question typed as a sentence. On the owner's store, `memo search all` with the question found the
reply first. `memo search messages` never used discovery, so the same question found nothing. The question: does
running discovery for a question in `memo search messages`, as `search all` does, find such replies?

## Setup

- Machine: AMD Ryzen AI 9 HX 470, Linux, Node 24.19.0.
- Data: one synthetic MAX chat, 220 messages: 10 topics, each a request from the owner that names the topic, a
  reply to it that does not ("Let us leave that until summer"), and 20 filler messages. No real message was opened.
- Queries: per topic, the topic's words (`price list sync`) and a question (`when will the price list sync be
  ready?`), `--limit 10`. A query counts when the topic's reply is among the ten.
- Builds: memo 0.131.44 (released, cli-core 0.590.0) and memo with this change.
- Command: `node bench.mjs <cli-core checkout with dist> <memo.js> [<memo.js> …]` ([bench.mjs](bench.mjs)).

## Results

| memo | words | question | average time per query |
| --- | --- | --- | --- |
| 0.131.44 | 0/10 | 0/10 | 500 ms |
| this change (cli-core 0.593.0) | 0/10 | 10/10 | 540 ms |

Raw lines: [results.jsonl](results.jsonl). The machine was busy; the times move by about 150 ms between runs.

## What it showed

- A question finds every topic-less reply (0/10 → 10/10), at about the same cost per query.
- Plain words still find none of them, by design: strict search keeps every word in the message.
- On the owner's store (read only, totals only): the store search that `memo search messages` now runs for a
  question (cli-core `searchStore` with discovery) returned the contractor's reply first for the question about the
  postponed work in that chat. `memo search messages` 0.131.44
  returned nothing for the question. The built memo itself could not be checked there: the store's word index gave
  an error to every message search, the released memo's too, from 17:10 UTC that day.

## What was not measured

- A reply that is not a formal reply (a message after the question with no reply link). Discovery adds formal
  replies only; the owner's case was a formal reply.
- Search by meaning: `memo search messages` reads no model.
- Plain words stay strict on purpose: every word must be in the message, so a reply without them is not found.
