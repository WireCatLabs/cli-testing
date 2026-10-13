# Mentions: what rules find in one person's messages, and how long it takes

## Why we ran it

cli-messaging now finds phones, e-mail addresses, links and Google documents in stored message text and keeps
each one where it was written ([mentions plan](https://github.com/WireCatLabs/cli-core/blob/main/docs/dev/mentions-plan.md)).
The owner chose rules over libraries: phones are found by "looks like a phone", not checked against a numbering
plan, because `libphonenumber-js` installs 10 MB. The questions: how long a full `mentions rebuild` takes on a
real store, how much it adds to the file, and whether the rules find mostly real values. It decided whether the
rules ship as they are and whether finding mentions on every store write is cheap enough.

## Setup

- AMD Ryzen AI 9 HX 470 (24 threads), Node 24.19.0, `node:sqlite`. The full cli-messaging test suite was running
  at the same time, so the times are an upper bound.
- cli-messaging branch `feat/mentions-phase1` (store version 7), built with `tsc --build`.
- A backup copy of the owner's store (`sqlite3 .backup`), 4,436 messages, at store version 5; the copy is upgraded
  to 7 on open. The real file was opened read-only for the backup and never written.
- `node rebuild.mjs <cli-messaging checkout> <copy.db>` — three rebuilds, the median; totals only.

## Results

| | |
|---|---|
| upgrade 5 → 7 on open | 21 ms |
| full rebuild, 4,436 messages | 655 ms (about 0.15 ms a message) |
| mentions found | 861 |
| space in the file (table and indexes) | 256 kB |

| kind | mentions | different values | mean confidence |
|---|---|---|---|
| link | 763 | 589 | 0.86 |
| document | 59 | 49 | 0.95 |
| e-mail | 31 | 7 | 0.95 |
| phone | 8 | 7 | 0.80 |

201 of the links were written without `http` (a bare `site.ru`); the links name 219 sites.

## What it showed

- **Cheap enough for every write.** 0.15 ms a message: a sync that stores 500 messages spends under 0.1 s on
  mentions.
- **Phones: 8 of 8 were phones** on a look by the owner's agent at each one in place (not recorded here).
- **Links without a scheme caught code on the first run.** Method calls and a type name in pasted program code
  read as sites under `.at`, `.parts` and `.map`. The rule now skips a bare domain followed by `(` or `[`, or whose
  ending has a capital letter; the numbers above are after that change. The other bare sites looked real on the
  same check.

## What was not measured

- Recall: how many phones or links the rules miss. That needs a labelled sample.
- Stores much larger than this one; time is expected to grow in a straight line with the number of messages.
- Transcripts, file texts, notes, documents and mail: phase 1 reads message text only.
