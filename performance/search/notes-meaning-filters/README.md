# Field filters and search by meaning in notes (2026-10-31)

## Why this was run

WireCat Desktop's Search page sends the owner's filters as query fields: `date:today`, `tag:work`. For memo notes
and Drive documents it had to add `--exact`, because without it about 20 hits matched none of the filters, and with
it nothing was found by meaning. Separately, a Drive document's date filter and the date its hit showed disagreed.

The question: how many hits of the default search (words and meaning) break the query's own fields, before and after
the fix in [cli-core #2223](https://github.com/WireCatLabs/cli-core/pull/2223)? The answer decided whether the
Desktop can stop forcing `--exact`.

## Setup

- One Linux machine, the owner's real WireCat store (about 1,450 Drive documents and notes, all imported within the
  last 30 days by the local copy's time).
- Before: the installed memo 0.124.0 (cli-core 0.491.0) and drive 0.49.0 (cli-core 0.491.0). After: the same
  tools built from their pull requests on cli-core 0.496.0
  ([cli-memo #512](https://github.com/WireCatLabs/cli-memo/pull/512),
  [drive-cli #294](https://github.com/WireCatLabs/drive-cli/pull/294)), run as `node dist/bin/<tool>.js`.
  cli-core 0.496.0 has no store migration, so running them on the real store changed nothing in it.
- `measure.py` runs each query once as the user would (default limit 20, `--json --no-record`, drive with
  `--offline`), then the same query with `--exact`, paged to the end, as the set of notes that truly match the fields.
  "Outside the filter" counts hits not in that set. For the date queries it also counts hits whose shown `updated_at`
  is in the range (Europe/Madrid days).

```sh
python3 -I measure.py memo -- memo search notes
python3 -I measure.py drive -- drive personal search
python3 -I measure.py memo -- node /path/to/cli-memo/dist/bin/memo.js search notes
```

drive has one profile on this machine, `personal`; it was the only one measured.

The five queries are generic test words and fields, chosen for this run, not the owner's own searches.

## Results

Hits are out of 20. "Outside" is how many of them do not match the query's fields. "Dated" is how many show a date
inside the queried range.

| Query | Tool | Before: hits | Before: outside | Before: dated | After: hits | After: outside | After: dated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `date:today` | memo | 20 | 20 | 0 | 0 | 0 | – |
| `tag:work` | memo | 20 | 20 | – | 0 | 0 | – |
| `date>=30d` | memo | 20 | 2 | 12 | 20 | 0 | 20 |
| `budget date>=30d` | memo | 20 | 13 | 14 | 20 | 0 | 20 |
| `plan tag:work` | memo | 20 | 20 | – | 0 | 0 | – |
| `date:today` | drive | 20 | 20 | 0 | 0 | 0 | – |
| `tag:work` | drive | 20 | 20 | – | 0 | 0 | – |
| `date>=30d` | drive | 20 | 0 | 4 | 20 | 0 | 20 |
| `budget date>=30d` | drive | 20 | 0 | 2 | 7 | 0 | 7 |
| `plan tag:work` | drive | 20 | 20 | – | 0 | 0 | – |

## What it showed

- **Fields alone.** Before, `date:today`, `tag:work` and `plan tag:work` returned 20 hits each, every one found by
  meaning and none matching the field: the meaning half embedded the text `date:today` as if it were words. After,
  they return only matching notes. On this store no note was written today and none is tagged `work`, so the right
  answer is empty, and it is.
- **Words and a field.** `budget date>=30d` in memo had 13 of 20 hits outside the range; after, none.
- **Which time `date:` reads (drive).** Before, `date>=30d` matched 1,110 documents, because every document was
  imported in the last 30 days, while only 4 of the 20 hits showed a date in range: the hit showed the Drive edit
  time. After, `date:` reads the Drive edit time too: 144 documents match in drive's profile (488 in memo, which
  reads every notes folder and Drive account), and every shown date is in range. The "Before: outside" of 0 for drive's
  date queries is by the old rule, the import time, which every document passed.
- **The Desktop can drop `--exact`** for memo notes and drive once these releases are installed: the default search
  no longer returns hits outside the owner's filters.
- memo's "Before: outside" of 2 for `date>=30d` is partly an artefact: `--exact` pages stop at 1,100 notes, so a few
  matching notes are missing from the ground truth.

## What was not measured

- Ranking quality: whether the meaning hits that remain are the right ones. The fix only removes hits that break a
  field; it does not reorder the rest.
- Speed. The new date rule (Drive edit time) took about 15 ms over the whole documents table with `sqlite3`.
- Messages: `search messages --discover` builds its filter by joining every field with AND, a different path that
  this run did not test.
- Note titles, texts and refs: totals only, by design.

## Meaning inside the filter, and totals (2026-10-31, cli-core #2236)

### Why this was run

After #2223 no hit broke a filter, but a narrow filter left few meaning hits: meaning took the 50 notes nearest
overall and dropped those outside the filter. Drive's `budget date>=30d` gave 7 hits while 144 documents match the
date. The owner chose to rank the filter's own notes by meaning (A), and asked for a total of matches "like elastic
does". The questions: does ranking inside the filter fill the page without letting a hit outside it, how much does it
cost, and does the new total equal a count taken another way? The answers set the threshold (`RANK_WITHIN`) in
[cli-core #2236](https://github.com/WireCatLabs/cli-core/pull/2236).

### Setup

- The same machine and store as above: 1,454 documents and notes with 23,308 chunks; 1,455 documents chunked.
- Before: cli-core 0.498.0. After: the #2236 branch. Both run from a cli-core worktree through Vitest with
  `vitest.measure.config.ts` (the scripts go in `.measure/` of that worktree), calling the services the tools call:
  `searchNotes` with drive's one documents account as `folderIds`, or with no scope as memo does; `searchStore` for
  messages over the Telegram account that holds the most messages.
- **Read only.** The store opens with `readOnly: true`. Two writes a search makes on its way are stubbed: indexing
  notes that wait to be indexed, and topping up the message word index. So the runs search the indexes as they stand.
  The store held about 5.5 GB and the disk had 1.5 GB free, so no copy was possible.
- `DBUS_SESSION_BUS_ADDRESS=disabled:` on every run; the default local model `e5-small`.

```sh
MEASURE_STORE=~/.local/share/WireCat/wirecat.db MEASURE_OUT=out.jsonl MEASURE_LABEL=after \
  DBUS_SESSION_BUS_ADDRESS=disabled: npx vitest run --config .measure/vitest.measure.config.ts
MEASURE_FILE=.measure/measure-timing.test.ts …   # scoring cost
MEASURE_FILE=.measure/measure-messages.test.ts … # messages totals
```

The query words are generic test words chosen for these runs, not the owner's own searches. Per-query rows are in
cli-private (`reports/2026-10-31-notes-meaning-in-filter.md`); this page holds totals.

### Results

| What | Before | After |
| --- | --- | --- |
| Hits outside the query's fields, 12 notes queries (6 each in memo and drive) | 0 | 0 |
| Drive `budget date>=30d`: hits, of them found by meaning | 7, 6 | 20, 19 |
| memo `budget date>=30d`: hits, of them found by meaning | 20, 9 | 20, 13 |
| Totals of the 6 fields-only notes queries equal to the matching notes listed | – | 6 of 6 |
| Drive `date>=30d` total against a separate `sqlite3 -readonly` count | – | 144 `eq`, SQL 144 |
| Messages totals against the grouped count of `search stats`, 9 runs that answered | – | 7 equal; 2 `10000 gte` where the count is 32,180 |

Cost of scoring a filter's notes one by one, against the vector index's nearest 50 (milliseconds, 3 runs):

| Notes scored | 150 | 500 | 1,000 | 1,454 | nearest 50 overall |
| --- | --- | --- | --- | --- | --- |
| ms | 14–26 | 35–41 | 132–173 | 478–599 | 165–205 |

Counting up to 10,000 matching notes took 13–17 ms.

### What it showed

- **Ranking inside the filter fills the page.** Drive's `budget date>=30d` went from 7 hits to 20: 50 of the 144
  documents in the date range pass the meaning floor. None of the new hits breaks a field.
- **The cost grows with chunks, not notes.** Long documents come late in the list and cost the most. 2,000 notes
  keeps the scoring under about a second at this store's density (16 chunks per document); above it the old path
  runs. A chunk budget would scale better on stores of long documents.
- **Totals agree with counts taken another way.** The two capped totals are `gte`, as designed. A notes total with
  words also counts the notes found by meaning, so no separate count exists for it.
- **BUG-36 is not reachable.** A `--discover` query with an excluded or ORed field (`встреча -date>=30d`,
  `встреча (date>=30d OR …)`) runs strict search, with no meaning half. So its hits cannot break those fields: 0
  dated outside the range.

### What was not measured

- Ranking quality inside the filter: whether the 19 meaning hits are the right ones.
- `--discover` with plain words on the real store. Its follow-up step creates a temporary table, which a read-only
  connection refuses, so those runs failed here. The unit tests cover their totals.
- The tools' own command lines: the runs called cli-core's services, not `drive` or `memo` binaries.
