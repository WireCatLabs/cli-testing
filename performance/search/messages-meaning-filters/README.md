# Meaning hits for explicit syntax and inside a filter, messages (2026-10-31)

## Why this was run

`search messages --discover` sent any query with `-`, `NOT`, `OR`, brackets or a phrase to strict search, with no
meaning half ([notes-meaning-filters](../notes-meaning-filters/README.md), "BUG-36 is not reachable"). The owner
chose to give such queries meaning hits that obey the whole query, as notes have done since cli-core 0.496.0. The
same run checked RISK-61: meaning took the 100 messages nearest overall and then dropped those outside the filter,
so a narrow filter lost hits. Notes fixed this in cli-core #2236.

The questions:

- Does any hit, found by meaning or added as a reply or follow-up, break the query?
- How many meaning hits do these queries gain?
- What does it cost to rank a filter's own messages, and up to what filter size?

The answers fed [cli-core #2254](https://github.com/WireCatLabs/cli-core/pull/2254) and its threshold
`RANK_WITHIN_MESSAGES` = 100,000.

## Setup

- One Linux machine, the owner's real WireCat store. The Telegram account with the most messages holds about 209,000
  messages, and 8,862 of them (4%) have a vector of the default model `e5-small`.
- Before: cli-core `main` at 0.504.0, plus only the read-only fix for the follow-up step (FIND-112), so that discovery
  can run at all on a read-only connection. After: the #2254 branch.
- Both run from a cli-core worktree through Vitest with `vitest.measure.config.ts`. Put the scripts in `.measure/` of
  that worktree. They call `searchStore` with the real meaning lane (`meaningLane`), without the reranker, as
  `tg search messages --discover --limit 20` would.
- **Read only.** The store opens with `readOnly: true`. The word-index top-up and the notes index drain are stubbed,
  so the runs search the indexes as they stand. `DBUS_SESSION_BUS_ADDRESS=disabled:` was set on every run.
- Each script ran twice, before and after taking turns. The tables give the second pass, so the disk cache is warm
  for both.

```sh
MEASURE_STORE=~/.local/share/WireCat/wirecat.db MEASURE_ACCOUNT=<telegram account id> \
  MEASURE_CHATS=<exclude1>,<exclude2>,<narrow1>,<narrow2> MEASURE_OUT=out.jsonl MEASURE_LABEL=after \
  DBUS_SESSION_BUS_ADDRESS=disabled: npx vitest run --config .measure/vitest.measure.config.ts
MEASURE_FILE=.measure/measure-timing.test.ts …   # the cost of ranking a filter's messages
```

The query words (`встреча`, `созвон`, `завтра`, `оплата`) are generic test words, not the owner's searches. Each
query is paired with an independent check of what a hit must not be: its timestamp, chat or text, with a day of
margin for date edges. Per-query rows are in cli-private (`docs_ai/reports/2026-10-31-messages-meaning-filters.md`).
This page holds totals only.

## Results

| What | Before | After |
| --- | --- | --- |
| Hits that break the query, 11 queries × 20 hits, follow-ups included | 0 | 0 |
| Meaning hits in 20, 6 explicit-syntax queries (`-date`, `NOT`, `OR`, a group of dates, `-chat`, `-(chat OR chat)`) | 0 each (strict search) | 10–17 |
| Narrow chat 1 (1,013 messages, 898 with vectors): hits, meaning hits, meaning candidates | 9, 3, 3 | 20, 15, 100 |
| Narrow chat 2 (1,152 messages, 370 with vectors): hits, meaning hits | 20, 0 | 20, 20 (all also found by words) |
| `встреча date>=30d` (91,485 messages, 957 with vectors): meaning candidates, meaning hits | 10, 10 | 100, 10 |
| `оплата date>=14d`: meaning candidates, meaning hits | 5, 5 | 100, 10 |
| `встреча date>=60d` (above 100,000 messages): meaning candidates | 22 | 22 (old path, as designed) |
| Time, explicit-syntax queries | 0.17–0.21 s | 1.1–1.4 s |
| Time, narrow filters | 1.2–1.4 s | 1.3–1.5 s |

The time includes loading the model, about a second, which strict search never did. An earlier pair of passes, on a
machine busy with other work, measured about 0.5 s more for both and gave the same hit counts.

The cost of ranking a filter's own messages, against the vector index's nearest 100 (third of 3 runs, query
`встреча`):

| Filter | Messages | With vectors | List keys, ms | Score, ms |
| --- | --- | --- | --- | --- |
| chat 1 | 1,013 | 898 | 1 | 7 |
| chat 2 | 1,152 | 370 | 1 | 5 |
| `date>=30d` | 91,485 | 957 | 161 | 50 |
| `date>=90d` | 153,282 | 2,477 | 163 | 68 |
| `date>=180d` | 171,744 | 4,354 | 184 | 97 |
| `date>=365d` | 179,895 | 5,379 | 266 | 86 |
| `date>=730d` | 191,049 | 6,430 | 282 | 163 |
| `date>=1500d` | 204,465 | 7,731 | 449 | 174 |
| nearest 100 overall | – | 8,862 | – | 17 |

## What it showed

- **No hit breaks the query.** This holds for the meaning hits, and for the replies and follow-ups that discovery
  adds, for negation, `NOT`, `OR` and groups. The checks had something to remove: the excluded group of two chats
  removed 81 of the 100 nearest messages, and `-date>=30d` removed 13. The single excluded chat held none of the
  100 nearest, so that query proves less.
- **Explicit syntax gains meaning hits.** 10 to 17 of the 20 hits come from meaning, or from words and meaning
  together, where before there were none. The cost is the model load, about one second.
- **A narrow filter fills its page.** A 1,000-message chat went from 9 hits to 20. A 30-day window went from 10 to 100
  meaning candidates.
- **The cost depends on vectors, not messages.** Listing a filter costs about 2 µs a message. Scoring costs about
  22 µs a vector, the same rate notes measured. On this store only 4% of messages have a vector, so the whole account
  (204k messages) costs about 0.6 s. The threshold therefore counts messages: 100,000 covers a month here at
  about 0.2 s.
- **Risk at the threshold.** If all 100,000 messages had vectors, scoring would take about 2 s. A cap on vectors would
  bound this more tightly.

## What was not measured

- Ranking quality: whether the meaning hits are the right ones.
- The reranker. It was left off to keep the runs short, and it reorders only the first 50 hits.
- The tools' own command lines. The runs called cli-core's services, not `tg` binaries.
- `search all`. Its messages list still skips meaning when the query uses `NOT`, or a field under `OR` or in a group.
