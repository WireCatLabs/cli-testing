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
