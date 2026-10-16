# Task categories: the new default list

## Why it was run

cli-core gives every task a category from one list. An agent names it; a rule that finds a task in a message picks
it by trigger words. The default list had seven names (`money`, `documents`, `meeting`, `delivery`, `access`,
`personal`, `other`). On 2026-10-16 the owner approved a list of 36 (cli-core
[`docs/dev/tasks-plan.md`](https://github.com/WireCatLabs/cli-core/blob/main/docs/dev/tasks-plan.md), "Categories and
labels"). The category is also one field of the duplicate check: +1 when two tasks share it, −1 when they do not, and
one of the candidate lookups (the 10 newest tasks of the same category).

The questions:

1. How often does the rule's category match what a person would pick, with the old list and the new one?
2. Does the new list make the duplicate check better or worse?

The answers went into the cli-core change that ships the list.

## Setup

- Machine and versions: as in [duplicates](../duplicates/README.md) (AMD Ryzen AI 9 HX 470, Linux 7.0, Node 24.19.0),
  and the same Snowball stemmers and `normalize()` from the published `@wirecat/cli-core@0.277.0`.
- Data: the 251 synthetic tasks of the duplicate set, [`../duplicates/tasks.jsonl`](../duplicates/tasks.jsonl),
  unchanged. Each task's message is its `description`, and that is what the rule reads.
- Lists: [`old-defaults.json`](old-defaults.json) (cli-core `main` before the change) and
  [`new-defaults.json`](new-defaults.json) (the list the change ships), exported from cli-core's
  `DEFAULT_TASK_CATEGORIES`.
- Labels:
  - **Set labels.** The set's own `category`, in the old seven. To score the new list against them, a new name maps
    to the old one that held its tasks: `bills`, `taxes`, `bank`, `insurance` → `money`; `legal`, `government` →
    `documents`; `family`, `health`, `shopping`, `travel`, `events`, `entertainment`, `car` → `personal`; every
    other new name → `other`.
  - **New labels.** [`labels.json`](labels.json) gives each task one of the 36 names, written by hand from the
    meanings before the new triggers were measured. The rule: the most specific meaning wins; `money` is for a debt,
    a payback or a payment with no closer area (rent is `home`, a car repair `car`, a school collection `family`, a
    utility `bills`). Every task of one duplicate group has the same label. The old list scores against these labels
    too: its names that exist in the new list can match.
- Rule: [`evaluate.mjs`](evaluate.mjs) ports cli-core's `categorize()` (`src/services/task-categories.ts`): stems by
  script, a Latin word through the English stemmer only (cli-core's first default Latin stemmer, so Spanish words are
  stemmed by it too), the category with the most distinct trigger stems hit, a tie to the earlier one, none hit is
  `other`. With `--core`, the script checks the port against the real function on all 251 tasks and both lists.
- Duplicates: the replay of [`../duplicates/linked.mjs`](../duplicates/linked.mjs) with cli-core's shipped weights
  and bands (maybe ≥ 5, likely ≥ 10), run four times with `category` taken from the set labels, the new labels, the
  rule with the old list and the rule with the new list. Two of its runs are reported: tasks with an agent's own text
  ("agent tasks", the "no agent" run there), and tasks a rule opened that compare by their source message ("rule
  tasks"). A rule's task gets its category from the rule, so "rule tasks" with a rule category is the realistic row.

```sh
node performance/tasks/categories/evaluate.mjs --core <cli-core checkout, built>
```

## Results

Port check: the port matches cli-core's `categorize()` on 251 tasks × 2 lists.

### How often the rule's category is right (251 tasks)

| List | New labels (36) | Set labels (old 7) | Fell to `other` |
|---|---|---|---|
| Old (7) | 66 (26%) | 110 (44%) | 144 |
| New (36), first draft | 144 (57%) | 121 (48%) | 51 |
| New (36), shipped | 146 (58%) | 125 (50%) | 55 |

The first draft was written from the meanings. The shipped list drops triggers that stem to a common word, found by
reviewing every stem of four letters or less and by the draft's misses: `billing` → `bill`, `staging` → `stage`,
`moving` → `move`, `wedding` → `wed` (Wednesday), `post` (post office), `irs` → `ir` (Spanish "to go"), `son`
(Spanish "they are"), `друг` → `другой`, `суд` → `судя`, `кино` → `кинь`, `статья` → `стать`, a discount in
`sales`. That change used the set, so the 58% is partly in-sample. The draft's 57% is less so, but its author had read the
set's messages.

Most common misses, new labels → rule:

| Old list | New list |
|---|---|
| money → other 24 | money → other 11 |
| home → other 19 | meeting → other 8 |
| family → other 17 | work → other 7 |
| meeting → other 13 | family → other 7 |
| work → other 11 | bills → money 4 |
| family → personal 9 | home → money 3 |
| bills → money 7 | money → entertainment 3 |
| content → other 7 | money → events 3 |

### The duplicate check, by where the category comes from

Pairs are new task × candidate, as in [duplicates](../duplicates/README.md). Recall counts the duplicates stored when
the task arrives. 180 tasks have no earlier duplicate; "new tasks refused" counts those sent to review.

| Category from | Tasks | ≥ 5 true/false | P | R | ≥ 10 true/false | P | R | New tasks refused |
|---|---|---|---|---|---|---|---|---|
| Set labels (old 7) | agent | 72/53 | 58% | 90% | 34/6 | 85% | 43% | 38 |
| New labels (36) | agent | 72/41 | 64% | 90% | 34/6 | 85% | 43% | 32 |
| Rule, old list | agent | 69/47 | 59% | 86% | 34/5 | 87% | 43% | 33 |
| Rule, new list | agent | 69/36 | 66% | 86% | 34/6 | 85% | 43% | 28 |
| Set labels (old 7) | rule | 59/27 | 69% | 74% | 27/3 | 90% | 34% | 18 |
| New labels (36) | rule | 59/24 | 71% | 74% | 27/3 | 90% | 34% | 17 |
| Rule, old list | rule | 56/28 | 67% | 70% | 27/2 | 93% | 34% | 19 |
| Rule, new list | rule | 56/19 | 75% | 70% | 27/3 | 90% | 34% | 13 |

The set-label rows match the published duplicate results (72/53 and 59/27). Raw numbers: [`results.json`](results.json).
The first-draft list gave 69/37 and 34/5 (agent), 56/19 and 27/2 (rule).

## What it showed

- **The new list more than doubles how often the rule's category is right: 26% → 58%.** Most of the gain is tasks
  that fell to `other` with the old list (144 → 55): home, family, bills, work and content had no name or no words.
  Against the set's own seven labels the gain is small (44% → 50%), because the old seven cannot tell these apart.
- **The duplicate check gets more precise and loses nothing.** At maybe ≥ 5, precision rises from 59% to 66% for
  agent tasks and from 67% to 75% for rule tasks; recall stays 86% and 70%. Fewer new tasks go to review (33 → 28,
  19 → 13). A finer list puts fewer unrelated tasks in one category, so the category lookup brings fewer false
  candidates and "different category" (−1) separates more of them. At likely ≥ 10 the counts move by one pair.
- **A rule splits duplicate groups, and a finer list splits more of them.** A reminder rarely repeats the words that
  chose the first message's category ("Скинь 7 400 ₽ за билеты на матч" is `entertainment`, "Напоминаю про 7400 за
  билеты" is `events`). The old list split 10 of the set's duplicate groups, the new one 17. Both cost the same 3
  pairs of recall at ≥ 5 against labelled categories; the 7 extra splits moved no pair across a band here, but on
  other data they could.
- **Counting hits favours generic words.** "Оплати счёт за электричество" has two `money` words and one `bills` word,
  so it is `money`. Paybacks for tickets, flights or a hotel go to `events`, `travel` or `entertainment`, since the
  payback itself ("скинь", "your half") has no trigger. The tie order cannot fix either: these are not ties.

## Not measured

- **The labels and the triggers have one author.** Labels were written before the first measurement, from the
  meanings, but by the same person who wrote the triggers, and the shipped triggers were trimmed after seeing misses.
- Real chats: the set is synthetic, Russian and English, with no Spanish message. Spanish triggers are untested here.
- An agent's category choice. Agents name a category themselves; this measures the rule only.
- Categories outside this set's topics: `insurance`, `bank`, `sales`, `support`, `education`, `community`, `intro`
  and `follow-up` have no task with that label.
