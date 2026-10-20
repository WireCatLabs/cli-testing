# Project evidence on large documents

## Why we ran it

The [frozen project evidence test](../evidence/README.md) holds 13 short texts, so it cannot show how
`memo projects evidence` behaves on a large imported document. Two things were never checked: what the command
returns when one document is far larger than a page and its matching paragraphs lie far apart, and which
paragraphs the `around` context shows for a document hit. The risk was recorded as RISK-1268. The owner decided
(NEED-1572, option A) to measure it in a separate test and leave the frozen fixture, its `baseline.json` and its
results unchanged. The decision this feeds: whether a reader who gets a document hit can trust the excerpt and the
`around` paragraphs to point at what matched, and whether a long search finishes when it is cut into steps.

## Setup

- AMD Ryzen AI 9 HX 470, Linux 7.0, Node v24.19.0.
- Memo 0.82.0, built from `main` at `579e0af` (`v0.82.0-3-g579e0af`), with `@wirecat/cli-core` 0.371.0 and
  `@wirecat/cli-base` 0.47.1. Measured 2026-10-20.
- Limits from Core's [project gathering guide](https://github.com/WireCatLabs/cli-core/blob/main/docs/dev/PROJECT-GATHERING.md):
  a page is 64 KiB (65,536 bytes); a record above that is read alone, up to 256 KiB; above 256 KiB it is listed
  under `oversized` and not read; the read budget is 2 MiB per invocation.
- Synthetic store of 11 documents in one imported notes folder, project "Lantern Works" with key `LNW` and alias
  "Beacon Desk" (three searches, shown as `l1` name, `l2` key, `l3` alias). Paragraphs are split at blank lines and
  start with a marker (`p004`), so the paragraph a result shows can be read off its text.

  | Document | Bytes | Paragraphs that name the project |
  | --- | --- | --- |
  | `large` | 144,829 | p4 (name), p60 (key), p150 (alias), p215 (name) |
  | `huge` | 284,459 | p10 (name) |
  | `m1` to `m6` | 42,829 each | p30 (name) |
  | `small` | 76 | p2 (alias) |
  | `decoy-lantern` | 29,865 | none: "lantern" and "works" in the same paragraph |
  | `decoy-garden` | 29,841 | none |

- The right answers are in [`baseline.json`](baseline.json), written before the first run: which documents must be
  found, which paragraphs `around` must show, that `huge` is `oversized`, and what the resume must do. The runner
  [`evidence-large-document.ts`](evidence-large-document.ts) builds the store through the build's store module, runs
  the built `memo projects evidence LNW --json` three ways (default; `--before-n 5 --after-n 5`; `--max-pages 2` and
  `--cursor` until it stops) and prints the scores. It runs under the existing
  [external-I/O guard](../../documents/drive-shared-store/guard.mjs). It does not touch the owner's store; it
  refuses to start unless HOME, the XDG folders, `MESSAGING_STORE`, `WIRECAT_STATE_DIR` and `TMPDIR` are inside
  one fresh `/var/tmp` folder.
- The runner reuses no helper from [`../fixture.ts`](../fixture.ts): that file seeds the Harbour Bureau store and
  cannot take other documents. The same sandbox idea is repeated, as in the frozen test.

Command, from the repository root, with a built Memo checkout:

```sh
S=$(mktemp -d -p /var/tmp ld-XXX) && HOME=$S XDG_CONFIG_HOME=$S/config XDG_DATA_HOME=$S/data XDG_CACHE_HOME=$S/cache MESSAGING_STORE=$S/store.db WIRECAT_STATE_DIR=$S/state TMPDIR=$S node performance/projects/evidence-large-document/evidence-large-document.ts /path/to/cli-memo > performance/projects/evidence-large-document/result.json
```

The full output of this run is [`result.json`](result.json).

## Results

Default run, one invocation: 13 reads, 12 pages, `complete: true`, no checkpoint, 104 ms.

| Check | Label (before the run) | Observed |
| --- | --- | --- |
| Documents found | `large`, `m1` to `m6`, `small` | all eight found |
| Decoys not found | `decoy-lantern`, `decoy-garden` | `decoy-garden` not found; **`decoy-lantern` found** by the name search |
| `huge` (284,459 bytes) | listed under `oversized`, charged 0 | `oversized` lists it (284,515 bytes, name search); no item |
| `large` found by | three searches | all three (`l1`, `l2`, `l3`) |
| Charged bytes | at most 1.2 times the size of the documents read | 432,246 for 431,744 bytes of found documents: 1.00 |
| Pages | name search at least 4 | name search 9 (one record per page), key search 1, alias search 2 |
| Mediums and `small`: `around` | p28 to p32 and p1 to p3 | exactly as labelled, the hit paragraph marked `found` |
| `large`: `around` | p2 to p6, around the first paragraph that names the project (p4) | **p58 to p62, around p60** (the key paragraph) |
| `large` with `--before-n 5 --after-n 5` | p1 to p9 | **p55 to p65**, around p60 |
| Paragraphs that name the project, shown in `around` | 8 of 12 | 8 of 12, but one of them is the wrong one: `large` p60 is shown instead of p4; p150, p215 and the paragraph in `huge` (not read) are not |
| `around` bytes (`usage.around_bytes`) | not labelled | 8,171 default; 17,887 with 5 and 5 |

The excerpt of a hit is the first 300 characters of the document, and `around` shows 200-character excerpts
(Core's guide). So of the four paragraphs in `large` that name the project, a reader sees one, and which one depends
on the search that found the document first, not on the position in the document.

Resume with `--max-pages 2` and `--cursor`:

| Invocation | New references | Pages so far | Charged bytes | `complete` |
| --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 42,881 | false |
| 2 | 1 | 2 | 144,887 | false |
| 3 | 2 | 4 | 43,015 | false |
| 4 | 0 | 4 | 0 | false |

It never completes: 4 of the 9 references the one-shot run returns, no duplicates, and invocation 4 and every later
one read nothing and return the same checkpoint (the runner stops there; the first run went on to 41 invocations
with the same result). `stopped` is `null`, so the output does not say why it stopped.

## What it showed

1. **Large-document paging works in one shot.** A 145 KB document and six 43 KB ones are found in a single
   invocation, each read once (1.00 of the bytes), and the 284 KB document is reported as `oversized` instead of
   stalling the run.
2. **BUG-1: a resumed run stalls** (fixed, see [After the fixes](#after-the-fixes-memo-0840-core-03770)). With `--max-pages 2` the units end `partial` and the checkpoint is returned,
   but a resume makes no read and returns the same checkpoint, forever. Tried with `--max-pages 3` and `4`: the
   same, at other points. A caller that follows `checkpoint` as the guide says loops without progress. A
   likely cause, not confirmed, is the `huge` record or the `read-limited` state of `large` that the first
   invocation reports (its units show `read-limited` with `validation_error`); the run was not repeated without
   `huge`.
3. **FIND-1: `around` for a document follows the search that found it first, not the document.** Core's guide says
   the context is around "the first one that names a lane word, in document order". In `large` that would be p4;
   the output is around p60, the paragraph of the key search. The three other matching paragraphs are not shown
   and nothing in the item says there are more. Fixed, see [After the fixes](#after-the-fixes-memo-0840-core-03770).
4. **FIND-2: the project name is searched as separate words.** `decoy-lantern` has no "Lantern Works" in it, only
   "lantern" and "works" in one paragraph, and the name search returns it. The `--help` text calls each name "its
   own literal search". For a project with a common-word name this gives false hits.

## Not measured

Timing beyond one wall-clock figure, memory, a store with many thousand documents, messages or mail next to the
documents, a document between 256 KiB and a few MiB through other paths, other budgets (the CLI sets only
`--max-pages`), whether `--max-pages` without `huge` completes, and any real data. All data here is invented.

## After the fixes (Memo 0.84.0, Core 0.377.0)

Run 2026-10-20 with the same runner and the same synthetic store. The two findings above were fixed in Core
0.377.0 ([cli-core#1690](https://github.com/WireCatLabs/cli-core/pull/1690), resume;
[cli-core#1694](https://github.com/WireCatLabs/cli-core/pull/1694), document `around` and the new `moreMatches`
field), released in Memo 0.84.0 (`@wirecat/cli-memo` on npm). Setup: Memo built from the tag `v0.84.0`
(`ca74d71`) with `@wirecat/cli-core` 0.377.0, same machine and Node. The runner gained one output field,
`more_matches`, and nothing else; the full output is
[`result-2026-10-20-memo-0.84.0.json`](result-2026-10-20-memo-0.84.0.json). `result.json` and `baseline.json` are
unchanged.

Default run, one invocation: 13 reads, 12 pages, `complete: true`, no checkpoint, 99 ms.

| Check | Label (before the run) | Observed |
| --- | --- | --- |
| Documents found | `large`, `m1` to `m6`, `small` | all eight found |
| Decoys not found | `decoy-lantern`, `decoy-garden` | `decoy-garden` not found; `decoy-lantern` found by the name search (expected, see below) |
| `huge` (284,459 bytes) | listed under `oversized`, charged 0 | `oversized` lists it (284,515 bytes, name search); no item |
| `large` found by | three searches | all three (`l1`, `l2`, `l3`) |
| Charged bytes | at most 1.2 times the size of the documents read | 432,246 for 431,744 bytes of found documents: 1.00 |
| Pages | name search at least 4 | name search 9, key search 1, alias search 2 |
| Mediums and `small`: `around` | p28 to p32 and p1 to p3 | exactly as labelled, the hit paragraph marked `found` |
| `large`: `around` | p2 to p6, around the first paragraph that names the project (p4) | **p2 to p6, found p4** (was p58 to p62) |
| `large` with `--before-n 5 --after-n 5` | p1 to p9 | **p1 to p9, found p4** (was p55 to p65) |
| Paragraphs that name the project, shown in `around` | 8 of 12 | 8 of 12, and now the right ones: `large` p4 is shown; p60, p150, p215 and the paragraph in `huge` (not read) are not |
| `around` bytes (`usage.around_bytes`) | not labelled | 8,171 default; 17,483 with 5 and 5 |

Checks that failed before and pass now: the `large` `around` position (both runs), and the resume. Everything else
is unchanged.

`moreMatches` in the default run: `large` 3 (p60, p150 and p215 are the other matching paragraphs); every other
document 0. So the item now says that more paragraphs match than the `around` shows, though it still does not say
which.

Resume with `--max-pages 2` and `--cursor`:

| Invocation | New references | Pages so far | Charged bytes | `complete` |
| --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 42,881 | false |
| 2 | 1 | 2 | 144,887 | false |
| 3 | 2 | 4 | 43,015 | false |
| 4 | 1 | 6 | 42,881 | false |
| 5 | 2 | 8 | 85,762 | false |
| 6 | 2 | 10 | 72,820 | false |
| 7 | 0 | 12 | 0 | true |

The resume completes in 7 invocations with the same 9 references as the one-shot run, no duplicates, 12 pages and
432,246 charged bytes in total (the same as the one-shot run), and no invocation reads without progress.

What is still open:

- **`decoy-lantern` is found. This is expected behaviour, not a bug.** The owner decided (NEED-1579, option B) to
  keep matching the words of a project name anywhere in one text, so "lantern" and "works" in one paragraph match
  "Lantern Works". FIND-2 stays as a description of that behaviour, and a project with a common-word name will get
  such hits. The baseline still labels the decoy as "not found"; that label is kept as written and is not
  re-scored.
- Only the first matching paragraph of a document is shown in `around`; `moreMatches` gives the count of the
  others, not their position.
- Everything under "Not measured" above is still not measured.
