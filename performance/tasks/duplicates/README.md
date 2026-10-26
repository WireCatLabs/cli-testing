# Duplicate tasks from chat messages

## Why it was run

The owner wants an agent to record a task for everything in his chats that needs him, with no second task for the
same thing. He also does not want a limit such as one task per chat or per person: a busy chat holds many real tasks.
cli-core's tasks plan (WireCatLabs/cli-core#1216, `docs/dev/tasks-plan.md`, "Duplicates — the comparison chain")
answers this with a check that runs when a task is created. The check has three steps. Three "certain" rules attach a
message to a task without scoring. A union of cheap lookups finds candidates. A Fellegi–Sunter score then compares
fields. The weights were set by hand. The plan says they must be tuned on a synthetic set before they decide
anything.

The questions:

1. Do the plan's starting weights separate real duplicates from look-alikes?
2. Which weights and bands should cli-core ship?
3. Can a "same" band have zero wrong merges, and what recall is left at that point?

This run is step 1 of the plan's build order. Its answers go into the scoring module in step 4.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM, Linux 7.0, Node 24.19.0, SQLite 3.53.3 (the one in `node:sqlite`),
  time zone Europe/Madrid (recorded in the results as `environment.timeZone`).
- Data: [`tasks.jsonl`](tasks.jsonl). It holds 251 synthetic tasks in Russian and English, from 9 invented people
  (Иван Пример, Alice Example, …) and one unknown sender, in 4 group chats and 9 private chats, over 50 days. The
  data comes from [`generate.mjs`](generate.mjs), and the run checks that the committed file matches the generator's
  output. Each task has a title, a description (the message), a person, a chat, a category from the plan's default
  list, an amount and currency, a due date, `created_at`, `closed_at`, a source message id and `reply_to`. Each task
  also carries the ground truth: `group` (tasks in one group are one task), `scenario` and `subtype`.

  | Kind | Tasks | What it holds |
  |---|---|---|
  | `dup` (`a.*`) | 112 | One task written two or three times: word forms, typos, `15 000` / `15000` / `15к` / `1,500`, synonyms (`оплатить счёт` / `переведи за счёт`), the other language, reminders days later, a reminder after more than 14 days. |
  | `lookalike` (`b.*`) | 50 | Not one task: the same person with another job, the same words with another amount, the same category with another date (monthly rent, with the earlier task closed), the same title with another amount. |
  | `busy` (`c.busy`) | 58 | Separate real tasks in busy group and private chats. They share words, people and categories. |
  | `cross` (`c.cross`) | 12 | One request that arrives in a group chat and in a private chat. |
  | `reply` (`d.*`) | 19 | Replies that repeat the task, a reply that adds a new request, another person's "+1" in a group, a reply to a closed task. |

  The set has 80 duplicate pairs, counted as each task paired with every earlier task of its group.
- Chain: [`evaluate.mjs`](evaluate.mjs) follows the plan's chain:
  - **Stems.** The Snowball 3.1.1 stemmers and `normalize()` come from the published `@wirecat/cli-core@0.303.0`
    tarball. The script downloads it with `npm pack`, checks its sha512 and keeps it in `.cache/`. The stemmer
    factory `createStemmer` (`src/search/stem.ts`) is not a public export, so the script copies its token logic:
    the same token pattern and script test, Snowball on the lower-cased word, `normalize()` after it. A Latin word
    gets both default stemmers (English and Spanish).
  - **Two steps the plan names but cli-core does not have yet.** The script adds them on top: digit groups joined
    (`15 000` → `15000`, only before exactly three digits, so `20.10` stays a date) and stop words removed
    (Russian and English).
  - **Signature.** Amount, currency and due date come from patterns in the text, as a rule would find them, read by
    cli-core's own `amountOf` and `dueDayOf` (`dist/search/task-signature.js`). They never come from the labelled
    fields. A date phrase must be a whole word, and a month a whole month name or its
    English abbreviation; due days are calendar dates in the machine's time zone.
  - **Candidates.** A real FTS5 table with `bm25()` gives the top 20 matches on any stem. The same person gives up
    to 10 newest tasks, the same category gives up to 10 newest tasks, and the reply chain adds its tasks. A
    candidate is open, or was closed in the last 14 days. There is no "same chat" lookup.
  - **Scoring.** The plan's field levels and weights, then its bands.
  - **Order.** Tasks arrive in `created_at` order and are compared only with earlier tasks. A task that a certain
    rule attaches is not stored as a separate task: its message is linked to the target task, as in the plan.
- Tuning: m and u for each level are counted over the candidate pairs. A small constant (0.5) is added to each
  count, so a count of zero does not give an infinite weight. Each weight is `log2(m/u)`, rounded to an integer.
  The bands are picked by two rules. The "same" threshold is the lowest score with no wrong merge on the tuning
  data. The "maybe" threshold is the highest score that still keeps 90% of the duplicates found as candidates.
  Scenarios are split into halves A and B with a seeded hash, so a duplicate group never sits in both halves.
  Weights are estimated on A and tested on B, then estimated on B and tested on A. The proposed weights are
  estimated on all pairs.
- The run checks the chain twice: with the plan's certain rules (`results-plan.json`), and with no certain rules
  (`results-none.json`). In the second run, a reply counts only through its +6 weight.

```sh
performance/tasks/duplicates/run.sh
```

## Results

A pair is one new task and one earlier candidate. "true/false" counts pairs that are, or are not, the same task.
Precision is true ÷ all pairs in the band. Recall is true ÷ all duplicate pairs of the tasks that were scored,
including pairs that never became candidates. With no certain rules, that is all 80 pairs. With the plan's rules, a
task a certain rule attached is not scored, so it is counted in the certain-rules table instead. In this set, no
duplicate was ever missed as a candidate.

### Certain rules (plan § 2)

| Rule | Right | Wrong | The wrong ones |
|---|---|---|---|
| Reply to a message linked to an open task | 5 | 4 | A reply that adds a new request ("thanks! also, can you book a table…", "и хлеба купи", "и ещё — лампочку"), and another person's "+1, I need staging access too" |
| The same normalized title for the same person | 0 | 2 | `Оплатить счёт` for the internet, then for water. `Pay Carol's design invoice` for 250 EUR, then a new 400 EUR invoice |

The plan's third certain rule, the same rule on the same message, was not tested: each message in the set has
one task.

### Bands, with the plan's certain rules

| Weights and bands | Half | same ≥ | maybe ≥ | same true/false | maybe true/false | P same | R same | P same+maybe | R same+maybe |
|---|---|---|---|---|---|---|---|---|---|
| start, plan bands | A | 8 | 3 | 18/5 | 22/60 | 78% | 45% | 38% | 100% |
| start, plan bands | B | 8 | 3 | 17/4 | 17/46 | 81% | 50% | 40% | 100% |
| start, bands picked on A | B | 13 | 4 | 0/0 | 33/33 | — | 0% | 50% | 97% |
| estimated on A | B (held out) | 9 | 3 | 18/9 | 15/29 | 67% | 53% | 46% | 97% |
| estimated on B | A (held out) | 18 | 5 | 2/0 | 30/31 | 100% | 5% | 51% | 80% |

### Bands, with no certain rules

| Weights and bands | Half | same ≥ | maybe ≥ | same true/false | maybe true/false | P same | R same | P same+maybe | R same+maybe |
|---|---|---|---|---|---|---|---|---|---|
| start, plan bands | A | 8 | 3 | 24/7 | 22/68 | 77% | 52% | 38% | 100% |
| start, plan bands | B | 8 | 3 | 17/4 | 17/52 | 81% | 50% | 38% | 100% |
| start, bands picked on A | B | 14 | 4 | 0/0 | 33/35 | — | 0% | 49% | 97% |
| estimated on A | B (held out) | 18 | 3 | 11/3 | 22/35 | 79% | 32% | 46% | 97% |
| estimated on B | A (held out) | 18 | 5 | 2/0 | 36/36 | 100% | 4% | 51% | 83% |
| estimated on all (in-sample) | all | 19 | 5 | 3/0 | 69/45 | 100% | 4% | 62% | 90% |

### What the agent sees, for each new task (no certain rules, all 251 tasks)

The table counts each new task once, by its best-scoring candidate. 71 tasks have an earlier duplicate. 180 do
not.

| Weights | Duplicate: top in "same" | top in "maybe" | scored "different" | top is the wrong task | New task: flagged "same" | refused as "maybe" |
|---|---|---|---|---|---|---|
| start, plan bands | 38 | 31 | 0 | 2 | 11 | 56 (31%) |
| estimated on all, same ≥ 16, maybe ≥ 5 | 3 | 61 | 6 | 1 | 0 | 31 (17%) |
| recommended, same ≥ 16, maybe ≥ 5 | 3 | 61 | 6 | 1 | 0 | 38 (21%) |

Any "same" threshold from 16 to 19 gives the same result on this set.

### Threshold sweep (no certain rules, all pairs, a pair counts when its score ≥ the threshold)

| ≥ | start true/false | P | R | new tasks flagged | recommended true/false | P | R | new tasks flagged |
|---|---|---|---|---|---|---|---|---|
| 3 | 80/131 | 38% | 100% | 67/180 | 75/102 | 42% | 94% | 56/180 |
| 5 | 69/67 | 51% | 86% | 39/180 | 72/53 | 58% | 90% | 38/180 |
| 6 | 67/41 | 62% | 84% | 29/180 | 70/28 | 71% | 88% | 20/180 |
| 8 | 41/11 | 79% | 51% | 11/180 | 64/22 | 74% | 80% | 16/180 |
| 10 | 24/5 | 83% | 30% | 5/180 | 34/6 | 85% | 43% | 6/180 |
| 12 | 5/2 | 71% | 6% | 2/180 | 33/4 | 89% | 41% | 4/180 |
| 14 | 0/0 | — | 0% | 0/180 | 21/4 | 84% | 26% | 4/180 |
| 16 | 0/0 | — | 0% | 0/180 | 3/0 | 100% | 4% | 0/180 |

The estimated weights, before the plan's values were put back, are in `results-none.json` (`sweep.proposed`).

### Weights (run with no certain rules)

"Recommended" is the estimate on all pairs, except for the levels no duplicate in the set showed (a count of 0 in
the last column). Those keep the plan's start weight, because their estimate comes only from the zero count and the
added constant.

| Level | Plan's start | Estimated on A | Estimated on B | Estimated on all | Recommended | Duplicates / other candidate pairs (all) |
|---|---|---|---|---|---|---|
| Text ≥ 0.6 / 0.3–0.6 / < 0.3 | +4 / +2 / −2 | +5 / +5 / −2 | +5 / +5 / −3 | +5 / +5 / −2 | **+5 / +5 / −2** | 11/18 · 54/102 · 15/4493 |
| Person same / different / unknown | +3 / −3 / 0 | +1 / −6 / −2 | +1 / −5 / −1 | +1 / −6 / −3 | **+1 / −3 / 0** | 80/2149 · 0/2293 · 0/171 |
| Amount equal / different / missing | +3 / −4 / 0 | +10 / −4 / 0 | +6 / −4 / 0 | +6 / −5 / 0 | **+6 / −4 / 0** | 20/13 · 0/849 · 60/3751 |
| Category same / different | +1 / −1 | +1 / −5 | +1 / −5 | +1 / −6 | **+1 / −1** | 80/2667 · 0/1946 |
| Due ≤ 2 days / more / missing | +1 / −1 / 0 | +4 / −1 / −1 | +3 / −2 / 0 | +4 / −1 / 0 | **+4 / −1 / 0** | 26/126 · 4/707 · 50/3780 |
| Reply chain yes / no | +6 / 0 | +6 / 0 | +4 / 0 | +6 / 0 | **+6 / 0** | 6/5 · 74/4608 |
| Time ≤ 3 / 4–14 / > 14 days | +1 / 0 / −1 | +2 / −3 / −3 | +2 / −2 / −2 | +2 / −2 / −3 | **+2 / −2 / −3** | 69/888 · 8/2456 · 3/1269 |

Signature extraction against the labels, on all 251 tasks: amount and currency 65 right, 0 wrong, 4 missed (a
number with no currency next to it, such as `верни 3000 за бензин`, which the plan's pattern does not count);
due date 96 right, 0 wrong, 0 missed. The patterns and the messages were written together, so this shows only that
the patterns work on these phrasings, not on real chats.

The first run matched date words by prefix and counted days in UTC: `средства` read as Wednesday, `завтрак` as
tomorrow, `decide 3` as December 3 and `maybe 2` as May 2. JavaScript's `\b` knows only ASCII letters, so a
Cyrillic word had no edge. cli-core's port of this scorer
([WireCatLabs/cli-core#1235](https://github.com/WireCatLabs/cli-core/pull/1235)) fixed both, and this script took
the same fixes. On this set nothing moved: every count, weight and band above is the same in Europe/Madrid, in UTC
and in America/New_York. In Asia/Tokyo 5 due dates come out a day later than their labels, because tasks created
late in the UTC evening fall on the next local day; the labels were written as dates in a European zone. The
runtime in the committed results comes from that rerun, at a load average near 50: the median is the same, the
maximum per task is 37 ms.

Candidates per new task: median 20, 95th percentile 32, maximum 36. 77 of the 80 duplicate pairs were found by
words, person and category together. None was found by one lookup alone, except 1 found by words only and 2 by
person and words. Runtime, in memory: about 0.7 ms per task (median), 1.5 ms at the 95th percentile, 13 ms
maximum, and 0.2 s for all 251 tasks.

## What it showed

- **The plan's two certain rules make wrong merges, and a wrong merge here is silent.** The reply rule was right 5
  times and wrong 4 times. In a chat, a reply often asks for something new, or comes from another person. The
  same-title rule was wrong both times it fired: an agent's short title (`Оплатить счёт`) is not a task's
  identity. Without the two rules, the start weights put the 5 real follow-up replies in "same". With the
  estimated weights, they go to "maybe", and the agent decides. The replies that add a new task go to "maybe" or
  "different".
- **The starting weights find every duplicate, but they flag many new tasks.** With the plan's bands, every
  duplicate scored "same" or "maybe". "Same" was right 77–81% of the time on both halves. But 31% of new tasks
  were refused as "maybe", and 6% were flagged "same". Each of those costs the agent a second call.
- **No weights on these fields give a "same" band that is both safe and useful.** Zero wrong merges in "same"
  needs a threshold of 14 with the start weights, and then "same" is empty. With the estimated weights it needs
  16–19, and then "same" catches 3 of 80 duplicates (4%). On the held-out half, weights tuned on A still made 3
  wrong merges in "same" (79% precision, 32% recall). Weights tuned on B made none, but caught 4%. The wrong
  merges are look-alikes that no field can tell apart: the same parent, the same amount and category, two days
  apart, and a different object (`экскурсия в театр` / `в зоопарк`, `подарок папе` / `маме`, the hotel / the
  flights). Only the meaning of one word differs. "Same" can rank candidates for the agent. It cannot merge on
  its own, as the plan already says.
- **"Maybe" is where this chain is useful.** With the recommended weights and maybe ≥ 5, 90% of duplicate pairs
  are "same" or "maybe", at 58% precision, and 21% of new tasks are refused (start weights: 31%).
- **Tuning moves the weights the same way in both halves:**
  - Text 0.3–0.6 is worth as much as ≥ 0.6. Reminders are short, so their overlap with the first message is
    rarely high.
  - "Same person" drops to +1. The candidates come mostly from the same-person lookup, so most other candidates
    share the person too. m/u is measured over candidates, not over random pairs.
  - A different category and a time of 4–14 days both become strong signals against a match.
  - "Equal amount" is the least stable weight: +10 on A, +6 on B. It is also the field behind most of the
    held-out wrong merges.
- **cli-core needs two additions in step 3 before this chain works as planned.** `normalize()` (cli-core 0.277.0)
  does not join digit groups. Search has no stop-word list.

### Proposed for cli-core's scoring module

1. Drop the "same title for the same person" certain rule. Make "reply to a linked message" a scored field (+6), not
   an attach without scoring.
2. Weights: the "Recommended" column. Its levels with no duplicate keep the plan's values. The set was written so
   that every duplicate shares its person and category, so a stronger penalty there would rest on how the set was
   written, not on evidence.
3. Bands, measured with these weights on all pairs: **maybe ≥ 5** (90% recall, 58% precision, 21% of new tasks
   refused). **Same ≥ 16** is the lowest threshold with zero wrong merges here, with 4% recall. If "same" stays a
   label that orders the list and never merges, same ≥ 10 gives 85% precision and 43% recall (6 wrong pairs).
4. Re-estimate from the owner's labelled answers (merge, reject, `--attach`, `--new`; plan § 7) before "same" may
   merge anything.

## Not measured

- **How the set was written, which matters more than how it was split.** One author wrote the data and the
  scorer. In this set, every duplicate shares its person and category, and every look-alike was built to be hard
  in a known way. Real chats will differ. The held-out half guards against fitting one half, not against fitting
  the author. The dataset was written before any score was seen. It changed twice afterwards, to fix an amount
  label and a due-date label that the scoring does not read.
- The owner's real store. A run there reports totals here and per-pair rows in cli-private.
- An LLM or the agent as the judge of "maybe" pairs, and local embeddings for the text field (the plan's next step
  if text proves too weak). Cross-language duplicates show that weakness: 2 of the 5 `a.lang` pairs scored
  "different".
- The same rule firing twice on one message (plan § 2.2), reopening a closed task, and how a merge in the store
  changes later candidates.
- Speed on a large store: the FTS5 table here holds at most 251 rows.

## Follow-up: reading the messages linked to a task (2026-10-16)

### Why it was run

The plan says the check runs on every new task and on every new message linked to a task. Until cli-core
[#1345](https://github.com/WireCatLabs/cli-core/pull/1345), the comparison read only a task's title and description,
so a linked message changed no score and a check at link time would do nothing. That change makes the comparison
read a task's source message and its 5 newest linked messages, and runs the check again after a link. The weights
and bands stay as shipped. The questions: does reading linked messages make precision or recall worse, and what does
reading the source message do for a rule's task, whose title is a placeholder and which compared on no words before?

### Setup

[`linked.mjs`](linked.mjs) replays the set through the shipped chain: cli-core's weights and bands (likely ≥ 10,
maybe ≥ 5), no certain rules, the same candidate lookups and the same text and signature steps
([`chain.mjs`](chain.mjs), now shared with `evaluate.mjs`; `evaluate.mjs`'s results are unchanged). An agent answers
every refusal right: when a task's maybe-or-likely candidates hold a real duplicate, it links the message to the
best one, as `tasks add --into` does, and no task opens. Otherwise the task opens. "Before" compares a task's own
text only. "After" also compares it with each linked message, one at a time: the task's text plus that message,
the best pair counted whole. After each link, the replay runs the check again for the linked task, and counts the
pairs it would send to review that were not flagged before ("before" runs it too, as a control). The two "rule
tasks" runs give every task an empty title and description, as a rule's task has, with no agent: "before" compares
on no words, "after" adds the source message as a view. The text index stays empty for them, as in cli-core, so they
are found by person, category and reply only. Same machine and versions as above.

```sh
node performance/tasks/duplicates/linked.mjs
```

### Results

Pairs are new task × candidate, as above; recall counts the duplicates still stored when the task arrives.

| Run | ≥ 5 true/false | P | R | ≥ 10 true/false | P | R | duplicates flagged | linked by the agent | new tasks refused | pairs sent to review after a link |
|---|---|---|---|---|---|---|---|---|---|---|
| No agent (port check) | 72/53 | 58% | 90% | 34/6 | 85% | 43% | 65/71 | 0 | 38/180 | — |
| Agent, own text only (before) | 65/45 | 59% | 92% | 30/6 | 83% | 42% | 65/71 | 65 | 36/180 | 0 new, 13 listed before |
| Agent, linked messages read (after) | 65/45 | 59% | 92% | 30/6 | 83% | 42% | 65/71 | 65 | 36/180 | 0 new, 13 listed before |
| Rule tasks, no words (before) | 6/3 | 67% | 8% | 0/0 | — | 0% | 5/71 | — | 3/180 | — |
| Rule tasks, source message read (after) | 59/27 | 69% | 74% | 27/3 | 90% | 34% | 55/71 | — | 18/180 | — |

The port check matches the "recommended" sweep above (72/53 at ≥ 5, 34/6 at ≥ 10, 38 of 180 new tasks flagged).
Raw numbers: [`results-linked.json`](results-linked.json).

### What it showed

- **For tasks with their own text, nothing got worse, and on this set nothing got better.** Every pair scored the
  same before and after. The check after a link found 13 pairs at maybe or above, and all of them had already been
  flagged when the task opened.
- **For a rule's task, reading the source message is most of the check.** Before, such a task compared on no words:
  9 pairs reached maybe, 8% of duplicates. With its message, maybe or likely finds 74% of duplicates at 69%
  precision, and likely 34% at 90%. The cost: 18 of 180 new tasks (10%) now have a maybe-or-likely candidate, so a
  rule sends them to review (3 before).
- **The set cannot show the gain.** Each task here carries its whole message as its description, and the second and
  third messages of one job repeat what the first said. A linked message adds no word, amount or date the task's
  own text lacks. The gain is for a task whose title says less than a later message, such as an agent's
  "Call the plumber" followed by "the boiler repair is 15 000 rub". cli-core's store tests cover that case.

### Not measured

- A set where later messages add facts the first lacked: an amount, a date, the other language. Writing one
  would change this set and every result above.
- Rule-made tasks next to agent-made ones in one store: the rule runs give every task an empty title.


## Follow-up: Spanish due dates (2026-10-16)

### Why it was run

The owner's chats are also in Spanish. The due date is one field of the duplicate check (+4 when two tasks are due
within 2 days, −1 when further apart), but the patterns read dates in English and Russian only. A Spanish task
(`¿me lo envías el jueves?`, `para mañana`) had no due date, so a reminder lost its +4 and two jobs a week apart
lost their −1. The questions: does reading Spanish dates the way English and Russian ones are read find more
duplicates, and does it make wrong matches on the English and Russian set? The answer went into the cli-core change
that adds the Spanish forms
([WireCatLabs/cli-core#1352](https://github.com/WireCatLabs/cli-core/pull/1352)).

### Setup

- Machine, versions and time zone as above.
- Patterns: [`chain.mjs`](chain.mjs) now reads, as cli-core does: `hoy`, `mañana` (not `por la mañana`,
  `esta mañana`), `pasado mañana`, a weekday (not `los viernes`, which is every Friday), `fin de mes`,
  `15 de noviembre` (a Spanish month only after `<day> de`), and a day of the month (`antes del 5`, `el día 20`;
  not when a month or `de` follows). Left out because English and Russian have no such form: `la semana que viene`
  and `3/11`.
- Data: [`spanish.jsonl`](spanish.jsonl), 18 synthetic tasks written by hand, in the set's format, from 3 invented
  people (Lucía Ejemplo, Pablo Muestra, Marta Prueba) in private chats, 2026-10-12 to 2026-11-28. Seven duplicate
  groups, each a task and a later reminder: the date written another way (`el jueves` / `para mañana`,
  `el 15 de noviembre` / `para el domingo`), `mañana` read from the reminder's own time, and `por la mañana` in both
  messages of one job (no date). Three look-alike pairs: the same job on another date (`el martes` /
  `a fin de mes`, `hoy` / `el sábado`), and monthly rent (`antes del 5 de noviembre` / `de diciembre`, the first
  closed). The labels are calendar dates in Europe/Madrid.
- [`spanish.mjs`](spanish.mjs) counts the due dates against the labels, and prints the dates read from the Spanish
  category set ([`../categories/spanish.json`](../categories/spanish.json), 24 messages, no date labels) as if sent
  on Wednesday 2026-10-14. [`linked.mjs`](linked.mjs) replays `spanish.jsonl` with the shipped weights and bands
  (results: [`results-spanish.json`](results-spanish.json)). "Before" is the same scripts on `chain.mjs` without the
  Spanish patterns.

```sh
performance/tasks/duplicates/run.sh   # the Spanish runs are its last two commands
```

### Results

Due dates on `spanish.jsonl`: before, 16 of 16 missed; after, 16 right, 0 wrong, and the 2 `por la mañana` tasks
still have none. On the Spanish category set, 6 of 24 messages now get a date (before: 0); one of them is a date in
the past (`ya te he pagado lo del sábado` reads as next Saturday), as `paid for saturday` would in English.

The 251-task English and Russian set: every count, weight, band and extraction number above is the same as before
(only runtime moves), so no due date there changed.

Replay of `spanish.jsonl` (6 duplicate pairs, 12 tasks with no earlier duplicate):

| Run | | ≥ 5 true/false | P | R | ≥ 10 true/false | P | R | new refused |
|---|---|---|---|---|---|---|---|---|
| Agent, own text | before | 6/2 | 75% | 100% | 0/0 | — | 0% | 2/12 |
| Agent, own text | after | 6/1 | 86% | 100% | 3/0 | 100% | 50% | 1/12 |
| Rule tasks, source message read | before | 4/2 | 67% | 67% | 0/0 | — | 0% | 2/12 |
| Rule tasks, source message read | after | 5/2 | 71% | 83% | 2/1 | 67% | 33% | 1/12 |

### What it showed

- **A matched date lifts a reminder from maybe to likely.** The three reminders that name the same day another way
  (`el jueves` / `mañana`, `el viernes` / `mañana`, `pasado mañana` / `mañana` a day later) scored 9 before and 13
  after. Two more (`antes del día 20` / `hoy`, `el 15 de noviembre` / `el domingo`) rose from 5 to 9. The
  `por la mañana` pair scored 9 both times: it was not read as tomorrow.
- **A date apart drops a look-alike.** `fotos del viaje hoy` / `fotos de la boda el sábado` fell from 5 (maybe) to
  below it. `el coche al taller el martes` / `a fin de mes` fell from 9 to 8 and stays a maybe: the words and the
  person are the same, and −1 cannot outweigh them.
- **The one new wrong "likely" is a date shared by chance.** In the rule run, which compares a rule's task by its
  message only, `Lo de la mesa es para mañana por la noche` and `Lo del pasaporte de Leo es mañana` (same person,
  same day) rose from 7 to 11. With the agent's titles they stay apart. English `tomorrow` would do the same.

### Not measured

- Real Spanish chats. The 18 tasks were written with the patterns in mind, so they show only that the patterns work
  on these phrasings.
- Spanish amounts (`900 €` already reads; `15 mil`, `900 pavos` do not), and Spanish forms with no English or
  Russian counterpart (`la semana que viene`, `3/11`).

## Follow-up: amounts and dates read by cli-core (2026-10-16)

`chain.mjs` kept its own copy of cli-core's amount and due-date patterns, so a fix in cli-core reached this test
only when someone copied it by hand. The question: does the chain give the same answers when it reads amounts and
dates with cli-core's own functions? The answer decided whether the copy could go.

- Setup: the same machine and data as above, Node v24.19.0, `@wirecat/cli-core@0.303.0` (stemmers, `normalize()`
  and now `dist/search/task-signature.js`), Europe/Madrid, load average near 5. Command: `bash run.sh`.
- Results: every count, score and band in `results-plan.json`, `results-none.json`, `results-linked.json` and
  `results-spanish.json` is the same as with the copy on cli-core 0.277.0. Only the version, the date and the
  runtime changed: plan run 0.3 ms per task (median), 0.6 ms at the 95th percentile, 16 ms maximum, 0.1 s for all
  251 tasks.
- What it showed: the copy matched cli-core exactly, so it was removed. The runtime is lower mainly because this
  run had a load near 5, not near 50; it was not measured apart from that.

## Follow-up: real chats (2026-10-17)

The synthetic set gave "likely the same" 75% precision. The owner asked whether that holds on real conversations,
on a small first run of about 1,000 messages. The answer decides whether the scoring needs changing before agents
create tasks on every sync.

- Data: the owner's own store, copied; the real one was never written. The newest 1,104 messages of 7 chats where
  the owner writes: 4 Telegram dialogs, 2 MAX dialogs, 1 MAX group. Channels left out. Only totals are here; titles,
  chat names and per-pair rows are in the owner's private repository.
- Tasks: an agent read each chat one day at a time, without memory of earlier days, as separate syncs would, and
  drafted 148 tasks (63 promises, 44 questions, 37 requests, 4 mentions). It never saw the check's answers.
- Check: [`real-chats/replay.mjs`](real-chats/replay.mjs) adds the drafts oldest first with `tasks add` (tg and max
  main on cli-core 0.305.0, `MESSAGING_STORE` and `WIRECAT_CONFIG_DIR` pointing at the copy), records each answer, and
  keeps a refused draft with `--new` so later drafts are compared against all of them.
- Labels: 85 pairs, by an agent reading the conversation around both messages, blind to the check's answer; the
  4 it was unsure of were answered by the owner. 50 pairs first (every "likely", 18 "maybe" across scores, 10
  unflagged pairs from the same chat and category within 7 days), then the 35 pairs only the second run flagged.
- Machine: Linux x86_64, Node v24.19.0.

| Run | Drafts refused | "likely": same job | "maybe": same job | Known repeats found |
|---|---|---|---|---|
| as replayed | 74 of 148 | 6 of 22 (27%) | 13 of 52 labelled (25%) | 19 of 20 |
| compared by message send time | 36 of 148 | 5 of 10 (50%) | 10 of 36 (28%) | 15 of 20 |

What it showed:

- **The first run measured a bug, not only the scorer.** It created all 148 tasks within minutes, and the check
  compared tasks by when they were written: every pair looked "created together" (+2), and "tomorrow" in each
  meant the same day (+4). The same happens in real use whenever tasks are written from history (`tasks apply`,
  an agent going through a backlog). Comparing by the source message's send time halved the refusals and doubled
  the precision of "likely" (cli-core fix: compare by message time). On the synthetic set a task has one time, so
  the fix cannot change those results.
- **Three signals still mislead on real chats** (in the second run's flagged pairs, wrong / right): titles alike
  letter by letter 24 / 11 (an agent writes titles to one pattern: "Получить …", "Созвониться …"), same person
  14 / 1 (in a dialog the other person is always the same), one reply chain 8 / 2. Not changed: 85 labels are too
  few to retune weights without fitting noise.
- **The rules find little here.** On two dialogs, 300 messages each, the task rules (unanswered questions,
  mentions) would open no task, while the agent drafted 40 from the same messages. Real tasks come from agents.

Not measured: recall over all pairs (only flagged pairs and a 10-pair unflagged sample were labelled); groups
beyond one; Russian-only titles vs other languages; agents other than the one that drafted; the effect of the three
signals above once changed.

## Follow-up: a second labelled set (2026-10-17)

The owner's duplicate list still shows false matches. The first real-chats run found three signals that mislead:
titles alike letter by letter, the same person in a one-to-one chat, and one reply chain. 85 labels were too few to
retune them. The question: with more labels, does a new weight or rule for those three fix the false matches? The
answer decides whether cli-core changes the scoring module before agents create tasks on every sync.

### Setup

- Machine: AMD Ryzen AI 9 HX 470, Linux 7.0, Node v24.19.0. Tool: `tg` 0.70.0 on `@wirecat/cli-core` 0.323.0, the
  version that compares tasks by their messages' send time. Profile passed explicitly (`tg personal`).
- Data: a copy of the owner's store; the real one was checked before and after and never written. The only messages
  the first run had not read: the older parts of two one-to-one Telegram chats, 1,331 messages (700 + 631), from
  2026-04-30 to 2026-09-16. No group chat. Only totals are here; titles and per-pair rows are in the owner's private
  repository.
- Drafts: one fresh model call per chat and day (105 calls, [`prompt.txt`](real-chats/labelled-2/prompt.txt),
  [`draft-one.sh`](real-chats/labelled-2/draft-one.sh)), no memory of other days, never shown the check: 227 drafts.
- Check: [`replay.mjs`](real-chats/labelled-2/replay.mjs) adds them oldest first with
  `tg personal --offline tasks add`, keeps a refused one with `--new`, then asks `tasks related <key> --limit 40` for
  every task. 14 drafts were certain matches, 42 were refused, 213 tasks were stored, and the candidate pool is
  4,473 pairs. [`score.mjs`](real-chats/labelled-2/score.mjs), which calls cli-core's own scorer, gives the same
  score and levels as `tasks related` on all 4,468 pairs that `tasks related` listed.
- Sample: 129 pairs, seed 20261017. 99 targeted: every flagged pair (50), every reply-chain pair (9), every pair
  whose text level comes from trigrams (63), every same-person pair with text ≥ 0.3 (40); these overlap. 30 random
  from the rest of the pool.
- Labels: a blind first pass, one fresh model call per pair with both tasks and the messages around them, no score
  or levels ([`labelprompt.txt`](real-chats/labelled-2/labelprompt.txt)), then a reviewer read every reason and
  changed 3 (2 flipped, 1 to unsure). 29 same, 99 different, 1 unsure (left out). The random 30: all different.
- Old pairs: the first run's drafts and levels were deleted. Each old task's source message was found again from
  its title ([`oldprompt.txt`](real-chats/labelled-2/oldprompt.txt); 70 of 90 found with confidence) and scored
  with the same scorer, without the description and category, which were lost. The rebuilt band matches the first
  run's band on 60 of 85 pairs, so "old" is approximate.
- Command: `bash real-chats/labelled-2/run.sh <cli-core dir>` in a private folder with `chats.json` (chat and
  account ids) and `categories.txt`; it runs every step in order ([output](real-chats/labelled-2/results.txt)).
  No two labels contradict each other: no three pairs where two are "same" and the closing one "different".

### Results

**Over the whole candidate pool.** 99 of the 129 pairs were picked because a signal fired, so the plain share of
"same" pairs in the sample (23%) is not the pool's. Each targeted pair counts once (every pair of each targeted kind
is in the sample) and each random pair counts for 146 pool pairs (4,374 / 30). The random pairs had no "same" pair,
so "same" pairs in the pool are rare: about 29 of 4,473. Weighted that way, each signal against today's weight:

| Signal | duplicates showing it (m) | other pairs showing it (u) | counted weight | weight now |
|---|---|---|---|---|
| titles alike letter by letter | 18 of 29 | 44 of ~4,443 (1%) | +5.9 | text +5 |
| same person | 15 of 29 | ~1,634 of ~4,443 (37%) | +0.5 | +1 |
| one reply chain | 1 of 29 | 8 of ~4,443 | +4.7 (one pair) | +6 |

Other levels counted the same way that differ most from today's: "4–14 days apart" +1.4 (now −2), due date
within 2 days +2.7 (now +4). The "same" pairs come only from the targeted part, so m is high for the signals that
chose them; these weights are a check, not a fit to ship.

**Among the pairs the owner is shown** ("maybe" or "likely" as shipped), wrong / right:

| | titles alike | same person | reply chain | all shown |
|---|---|---|---|---|
| old (rebuilt) | 5 / 5 | 2 / 0 | 3 / 1 | 12 / 13 |
| new | 5 / 10 | 5 / 11 | 8 / 1 | 28 / 21 |
| all | 10 / 15 | 7 / 11 | 11 / 2 | 40 / 34 |

The bands as shipped, on the new set (every flagged pair is labelled): "likely" 5 of 11 right, "maybe" or "likely"
21 of 49 right (43%), finding 21 of the 29 same pairs.

Changes tried, "maybe" or "likely": right / shown, and same pairs found:

| Change | old | new | all |
|---|---|---|---|
| none | 13 / 25 · 13 of 20 | 21 / 49 · 21 of 29 | 34 / 74 · 34 of 49 |
| reply chain +6 → +2 | 12 / 21 · 12 | 20 / 43 · 20 | 32 / 64 · 32 |
| same person 0 in a one-to-one chat | 13 / 25 · 13 | 19 / 46 · 19 | 32 / 71 · 32 |
| text from stems only, no trigrams | 11 / 19 · 11 | 15 / 39 · 15 | 26 / 58 · 26 |
| trigrams count only when stems ≥ 0.2 | 13 / 24 · 13 | 17 / 44 · 17 | 30 / 68 · 30 |
| trigrams of the title without its first word | 11 / 21 · 11 | 17 / 43 · 17 | 28 / 64 · 28 |
| reply +2, person 0, trigram floor together | 12 / 20 · 12 | 16 / 38 · 16 | 28 / 58 · 28 |

How well the score puts "same" above "different" on the old pairs (AUC): shipped weights 0.75; every level counted
on the new set, weighted to the pool, 0.74. Reply +2 alone: 0.73 on old, 0.82 on new (shipped 0.80).

### What it showed

- **Over the whole pool the three signals do their job.** Titles alike and a reply chain are rare among unrelated
  pairs and common among duplicates; counted, they come out near today's weights. Same person is weak (+0.5 against
  +1): in a one-to-one chat a third of all pairs share it. These signals are what make a pair a candidate.
- **Among the pairs that already score high, they do not tell right from wrong — except reply chain, which points
  the wrong way.** Titles alike (10 wrong / 15 right) and same person (7 / 11) are right a little more often than
  the shown pairs as a whole (40 / 34). Reply chain is wrong 11 times in 13. The wrong pairs agree on every field:
  the same contact, the same verb-first title pattern ("Получить от … …"), the same category, a few days apart. They
  differ in the object: which audit, which payment, which call. No field sees that, so no weight change takes the
  shown pairs much past 50% right.
- **Lowering titles alike or same person costs found duplicates** (stems only: 15 of 29 found instead of 21) for no
  gain in precision. Counting every weight anew on this data does not order the old pairs better.
- **Reply chain +6 → +2 is the only change that helped both sets at the band.** "Maybe" or "likely" precision went
  from 52% to 57% on old and from 43% to 47% on new, losing one right pair on each; the pool count (+4.7) rests on a
  single duplicate. A candidate, not a proven fix.

Proposal for a follow-up in cli-core: reply chain `yes` from +6 to +2. Leave the same-person and trigram weights as
they are. The fix for the rest is the judge: `tasks add` already asks the agent that writes the task, and that agent
can read the object. Worth measuring next, on a sample drawn for it: "4–14 days apart" (−2), which counts positive
here.

### Not measured

- Group chats: the new set is two one-to-one chats only. Same person fires on most pairs there.
- Reply chains: only 9 new pairs, 14 in all.
- Recall over the whole pool: the 30 random pairs had no same pair, so misses outside the targeted pairs are not
  estimated, and m in the pool table counts only the duplicates the targeted part found.
- The old pairs' exact levels: rebuilt without description or category.
- Labels from the owner: the labels come from a model and a reviewer, not from the owner.
- Agents other than the one that drafted; languages other than Russian.
