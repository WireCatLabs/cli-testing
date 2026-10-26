# Project evidence: a frozen baseline on a synthetic store

Measured 2026-10-19 for [cli-memo #324](https://github.com/WireCatLabs/cli-memo/pull/324) (`memo projects evidence`,
MCP `project_evidence`) and [cli-core #1591](https://github.com/WireCatLabs/cli-core/pull/1591)
(`gatherProjectEvidence`), then again after the fixes it led to:
[cli-core #1611](https://github.com/WireCatLabs/cli-core/pull/1611) (0.349.0) and
[cli-memo #328](https://github.com/WireCatLabs/cli-memo/pull/328).

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
- Synthetic store, made by [`../fixture.ts`](../fixture.ts) (shared with [the review measurement](../review/README.md)) through the build's store module. It holds 8 Telegram
  messages in 3 chats, 2 emails, 2 imported documents and 1 of the owner's own notes, and a project
  "Harbour Bureau" with the key `HBB` and the alias `Харбор`. No real message or account is used.
- The right answers are in [`baseline.json`](baseline.json), written before the first run: 13 texts, each labelled
  relevant or irrelevant, with why. The cases are the ones the 2026-10-18 run hit: aliases in two scripts, an alias
  word that also means something else (`HBB` cable), one person working on two projects, the same mail found by
  two searches, a reply that names nothing, a project message from 200 days ago, a document whose time is when it
  was stored, and an own note.
- The request: `memo projects evidence HBB --source telegram:100,email:me@example.com,notes:<folder>
  --context-query "bank tracker" --contact "Rita Example" --json`, then with `--since-time 365d`, then with
  `--context-query HBB` added, then `--source all`, then with `--max-pages 2` and `--cursor` until it finishes. The
  script in this folder now runs the current options (`--no-catch-up` first); the first run used one `memo search`
  in its place.
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

## After the fixes

memo built from [cli-memo #328](https://github.com/WireCatLabs/cli-memo/pull/328) (`feat/evidence-index-alias`), on
`@wirecat/cli-core` 0.349.0 and `@wirecat/cli-base` 0.47.1, same machine, same fixture and labels. The command now
fills the search index before reading (`--no-catch-up` skips it), searches the project key, and shows 2 messages
before and after each message hit as context. The fresh-store run uses `--no-catch-up`; every other run is the
default. The `memo search` step is gone from the script.

| Run | Found | Precision | Precision, project items | Recall, all relevant | Recall, reachable | Missed |
|---|---:|---:|---:|---:|---:|---|
| Fresh store, `--no-catch-up`, 60 days | 6 | 0.67 | 0.75 | 0.50 | 0.67 | reply, mail, document, own note |
| Default, 60 days | 9 | 0.67 | 0.71 | 0.75 | 1.00 | reply, own note |
| Default, 365 days | 10 | 0.70 | 0.75 | 0.78 | 1.00 | reply, own note |

- The default run filled the index first (`index: updated`, 4 mail and 3 document rows) and took 15 reads (5
  searches × 3 sources), 720 bytes of text plus 493 bytes of context.
- The reply that names nothing is not a hit, but it is now in the context of the hit next to it; so is the
  200-day-old message, marked as not a hit.
- The key `HBB` found the last missing project message and the mail by two searches. It also brought in the TV cable
  and the newsletter: precision on project items is 0.71, as the first run predicted.
- With `--max-pages 2` the run continued 7 times with `--cursor` and returned the same 9 references, with no
  duplicates.

## What it showed

The numbered points are from the first run; the section above says which of them the fixes closed (1, 2, 3).

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

- Whether the context around a hit is enough to read it; no reader judged it.
- Meetings and transcripts: the command does not read them yet. On 2026-10-18 they were a main source.
- Messages that are not in the store (server search, history not yet synced), and Drive documents not imported.
- Speed at scale: the store has 13 texts. Reads and bytes are counted; time is not.
- Any real project or account: no owner data was used.
- Interpretation: whether a found text supports a fact, a task or a decision. That is the next stage.

## 2026-10-20 rerun

Same machine (AMD Ryzen AI 9 HX 470, Linux 7.0.0-38), Node v24.19.0, same fixture, labels and script. memo 0.82.0
built from `main` at `a461598` (a detached checkout, `pnpm build`), with `@wirecat/cli-core` 0.371.0. The store is in a
fresh temporary folder. The run exited 0; its output is [`result-2026-10-20.json`](result-2026-10-20.json).

| Run | Found | Precision | Precision, project items | Recall, all relevant | Recall, reachable | Missed |
|---|---:|---:|---:|---:|---:|---|
| Fresh store, `--no-catch-up`, 60 days | 6 | 0.67 | 0.75 | 0.50 | 0.67 | reply, mail, document, own note |
| Default, 60 days | 9 | 0.67 | 0.71 | 0.75 | 1.00 | reply, own note |
| Default, 365 days | 10 | 0.70 | 0.75 | 0.78 | 1.00 | reply, own note |

- The default 60-day run took 15 reads (5 searches × 3 sources), 720 bytes of text plus 493 bytes of context. The
  index step reported `index: updated` (4 mail and 3 document rows).
- With `--max-pages 2` the run continued 7 times with `--cursor` and returned the same 9 references, with no
  duplicates.
- `--source all` read 3 sources and listed the own notes as unread.

What changed since "After the fixes": Core 0.349.0 to 0.371.0 and memo 0.72/0.328 to 0.82.0, which bring paging of
large documents and document paragraphs in `around`. Nothing moved: every number in the table, the reads, the bytes
and the references found are the same as before, and the two missed texts are the same.

That is expected, not evidence the new code works. The two imported documents in the fixture are a few lines long, so
they fit in one page and paging never starts. The context of a message hit holds messages, and no document hit has
paragraphs worth showing. The rerun shows only that the changes did not break or shift the small case.

Not measured in this rerun: a large document (paging), the paragraphs around a document hit, time or speed, any
real project, and whether the context is enough to read a hit. The fixture and labels were not changed to cover them;
a case for them would need a new labelled fixture, kept apart from the frozen baseline.
