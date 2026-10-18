# Project evidence: a frozen baseline on a synthetic store

Measured 2026-10-19 for [cli-memo #324](https://github.com/WireCatLabs/cli-memo/pull/324) (`memo projects evidence`,
MCP `project_evidence`) and [cli-core #1591](https://github.com/WireCatLabs/cli-core/pull/1591)
(`gatherProjectEvidence`).

## Why we ran it

On 2026-10-18 the owner had an agent gather everything about one real project by hand: Telegram searches by three
aliases, pages of selected chats, two Zoom transcripts and a set of Drive documents. Finding a first set of material
was easy. A reliable picture took most of the work: reading around hits, telling a person's other projects apart,
noticing a newer message that overturned an older one.

The new command does the bounded part of that work: one call searches the project's name, aliases, extra words and
people in the selected stored sources. This test asks what it finds and what it misses on a small store whose right
answers are fixed in advance, before any judgement of output on real data. The two decisions it feeds are whether
the command should also search the project's key, and whether it should bring the search indexes up to date before
reading.

## Setup

- AMD Ryzen AI 9 HX 470, Linux 7.0, Node v24.19.0. memo 0.72.0 built from `main` at `65822ca`, with
  `@wirecat/cli-core` 0.345.0. The store is in a fresh temporary folder.
- Synthetic store, made by [`evidence.ts`](evidence.ts) through the build's store module. It holds 8 Telegram
  messages in 3 chats, 2 emails, 2 imported documents and 1 of the owner's own notes, and a project
  "Harbour Bureau" with the key `HBB` and the alias `Харбор`. No real message or account is used.
- The right answers are in [`baseline.json`](baseline.json), written before the first run: 13 texts, each labelled
  relevant or irrelevant, with why. The cases are the ones the 2026-10-18 run hit: aliases in two scripts, an alias
  word that also means something else (`HBB` cable), one person working on two projects, the same mail found by
  two searches, a reply that names nothing, a project message from 200 days ago, a document whose time is when it
  was stored, and an own note.
- The request: `memo projects evidence HBB --source telegram:100,email:me@example.com,notes:<folder>
  --context-query "bank tracker" --contact "Rita Example" --json`, then with `--since-time 365d`, then with
  `--context-query HBB` added, then `--source all`, then with `--max-pages 2` and `--cursor` until it finishes.
- Run from this folder: `node evidence.ts <cli-memo checkout with dist/ and node_modules/>`. The run's output is
  [`result.json`](result.json).

The fixture was corrected twice after the first run, before these results: a mail reference escapes `@` as `%40`,
and Rita's message first held both words of "bank tracker", so it was rightly found by that search too.

## Results

"Reachable" leaves out the two relevant texts no search can find: the reply that names nothing, and the own note,
which has no context reader yet.

| Run | Found | Precision | Precision, project items | Recall, all relevant | Recall, reachable | Missed |
|---|---:|---:|---:|---:|---:|---|
| Fresh store, 60 days | 4 | 0.75 | 1.00 | 0.38 | 0.50 | `HBB` message, reply, mail, document, own note |
| After one `memo search`, 60 days | 6 | 0.83 | 1.00 | 0.63 | 0.83 | `HBB` message, reply, own note |
| After one `memo search`, 365 days | 7 | 0.86 | 1.00 | 0.67 | 0.86 | `HBB` message, reply, own note |
| With `HBB` as one more search | 9 | 0.67 | 0.71 | 0.75 | 1.00 | reply, own note |

- The 60-day run took 12 store reads (4 searches × 3 sources) and 471 bytes of text.
- Both of Rita's messages were marked `person-only`: found only through her name, not counted as the project.
- With `--max-pages 2` the run stopped and continued 5 times with `--cursor`. It returned the same 6 references as
  one run, with no duplicates.
- `--source all` read 3 sources and listed the own notes as `unread_sources`.
- The imported document came back with `time_kind: stored-update`: its time is when it was stored, not when its
  content happened.

## What it showed

1. **On a store just synced, new mail and imported documents are missed without a word.** Their units report
   `index-pending`, and the command reads only what the word index already holds. A `memo search` fills the mail
   index as a side effect, and after it recall rises from 0.50 to 0.83 of the reachable texts. The text output does
   not say that anything was pending.
2. **The project's key is not searched.** "HBB pilot with the bank starts on Monday" was missed in every run but the
   last. Adding the key finds it, and finds the mail by two searches. It also brings in both texts where `HBB` means
   something else, so precision on project items falls from 1.00 to 0.71.
3. **What names nothing stays out of reach.** The reply "Ok, I will check it tomorrow" in the project's chat is
   relevant only through its neighbours. No literal search finds it; it needs context around a hit.
4. **One search means all its words, anywhere in the text.** "the tracker for the bank" matches "bank tracker". It
   is not a phrase.
5. **A person's name finds their other projects.** The garden message came back, marked `person-only`, as the plan
   requires.

## What was not measured

- Meetings and transcripts: the command does not read them yet. On 2026-10-18 they were a main source.
- Messages that are not in the store (server search, history not yet synced), and Drive documents not imported.
- Speed at scale: the store has 13 texts. Reads and bytes are counted; time is not.
- Any real project or account: no owner data was used.
- Interpretation: whether a found text supports a fact, a task or a decision. That is the next stage.
