# Drive push: converting local files into native Docs and Sheets

## Why it was run

The owner asked for a command that keeps local folders mirrored into Google Drive: Markdown as native Google Docs,
CSV and XLSX as Google Sheets. The design (one-way push, stop on a remote change, `--force` to overwrite) rests on
two things Google's docs do not settle:

1. Does uploading new media into an **existing** native Doc or Sheet convert it, and keep its id, URL and comments?
   The [upload guide](https://developers.google.com/workspace/drive/api/guides/manage-uploads) says an update with
   conversion "replaces the full contents"; the
   [files.update reference](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update)
   does not mention conversion.
2. Which field tells a real edit in Google apart from a comment or a sharing change? Drive has no conditional
   update, and `headRevisionId` and `md5Checksum` exist only for binary files
   ([files resource](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)).

The answers decide how drive-cli detects conflicts and what it warns about before re-pushing a Sheet.

## Setup

- 2026-10-21, Europe/Madrid. Linux, Node 24.19.0, drive-cli 0.19.0 built from source (its saved sign-in only),
  `@googleapis/drive`, `@googleapis/docs`, `@googleapis/sheets` from that checkout.
- One owner account with the Drive write grant, owner-authorized live writes.
- All files are synthetic and live in a new folder marked `wirecat-push-spike-… (synthetic, safe to delete)`. The
  script trashes it at the end.
- Command: `node performance/documents/drive-push/spike.mjs <drive-cli checkout> <profile>`
- Raw output with ids removed: [results-2026-10-21.jsonl](results-2026-10-21.jsonl) (run 3; run 1 matched on
  every step it reached).

## Results

| Check | Result |
|---|---|
| `about.importFormats` | `text/markdown` and DOCX → Doc; `text/csv` and XLSX → Sheet |
| Create Doc from Markdown (metadata `mimeType` = Doc) | native Doc |
| Create Doc from DOCX, Sheet from CSV, Sheet from XLSX | native Doc / Sheet |
| Update existing Doc with `text/markdown` media only | converts; same id; still a Doc; content replaced |
| Comment after that update | still there (an unanchored API comment) |
| Revisions after that update | one more |
| Update existing Sheet with `text/csv` media only | converts; same id; **extra tab deleted, header bold lost** |
| Update existing Sheet with XLSX media | converts; same id |
| Find a file by its `appProperties` key | found, exactly one |

What changes each signal on a Doc:

| Event | `version` | `modifiedTime` | last revision id | hash of Markdown export |
|---|---|---|---|---|
| Comment added | changes | same | same | same |
| Shared by link | changes | changes | same | same |
| Link sharing removed | changes | changes | same | same |
| Text edit via Docs API (checked at 0, 10, 30 and 60 s) | **same** | **same** | changes | changes |
| Our own Markdown update | changes | changes | changes | changes |

On a Sheet, a Sheets API edit did change `version` and `modifiedTime`.

Markdown round trip: headings, bold, italic, links, nested lists and tables survive Markdown → Doc → Markdown. A
fenced code block becomes plain text (`const x \= 1`). A local image link (`./missing.png`) stays as literal text;
an `https` image is embedded.

## What it showed

- Re-pushing into the same Doc or Sheet works with a plain media update; the URL and comments survive.
- **`version` and `modifiedTime` cannot detect edits to a Doc.** They move on comments and sharing (false
  conflicts), and did not move on a Docs API text edit (a missed conflict). The last revision id and the export
  hash moved only on content changes.
- **Re-pushing a CSV wipes a Sheet's other tabs and formatting.**
- Both results led drive-cli away from re-uploading: updates go through the Docs and Sheets editing APIs, and a
  change in Google is detected by comparing the document's content with what the last push wrote (see the
  formatting check below), not by Drive metadata.
- Local images in Markdown need uploading separately, or a warning.

## Not measured

- Edits made in the Docs editor by a person (only API edits). Revisions may merge over time, so the last revision
  id may behave differently for editor edits.
- Comments anchored to text: an API comment is unanchored, so whether anchors survive a re-push is unknown.
- Suggestions, multi-tab Docs, large files, Shared Drives, and how `revisions.list` pages on long histories.
- The resumable upload path (this used the client library's simple upload).

## Formatting check (2026-10-21)

### Why

Updating by re-upload breaks Docs and Sheets, so drive-cli writes Docs through its own Markdown → Docs API
writer, with Google's native formatting (real lists, checklists, headings, tables). That works only if every kind
of formatting reads back from Google exactly as written; otherwise an unchanged paragraph looks changed on every
push.

### Setup

Same machine, account and terms as above. A new marked synthetic folder and Doc; the owner then ticked one
checkbox, commented on one phrase and made one suggestion by hand, because the API cannot do these. Scripts:
[format-spike.mjs](format-spike.mjs) (write, read back), [format-reread.mjs](format-reread.mjs) (read only),
[format-edit.mjs](format-edit.mjs) (one edit elsewhere, comments read). Raw output, ids removed:
[format-results-2026-10-21.jsonl](format-results-2026-10-21.jsonl).

### Results

| Written through `batchUpdate` | Read back by `documents.get` |
|---|---|
| `HEADING_1`, `HEADING_2` | same `namedStyleType` |
| bold, italic, strikethrough, link | same text style on the exact runs |
| inline code: Roboto Mono | same font on the run |
| bullets `BULLET_DISC_CIRCLE_SQUARE`, nesting by a leading tab | one list id, nesting 0/1/0, tabs removed |
| numbered `NUMBERED_DECIMAL_ALPHA_ROMAN` | list with `DECIMAL` glyphs |
| checklist `BULLET_CHECKBOX` | list with `GLYPH_TYPE_UNSPECIFIED` and no glyph symbol |
| code block: shading + Roboto Mono | shading and font present |
| quote: `indentStart` + left border | both present |
| rule: empty paragraph with a bottom border | border present |
| 2×2 table, cells filled in reverse order | table with the cell text |
| `insertInlineImage` from an `https` URL | inline object |

- 15 requests in one `batchUpdate` succeeded.
- `writeControl.requiredRevisionId` with a stale id: refused, HTTP 400 "does not match the latest revision".
- A paragraph inserted into the middle of a numbered list stays in the same list.
- Creating bullets removes the leading tabs, so indices after the list shift: an insert computed before that
  landed one character early.
- **A ticked checkbox is not visible in the API.** The ticked and unticked items return identical paragraph JSON
  (style, bullet, runs).
- A suggestion appears as `suggestedInsertionIds` on its run; `PREVIEW_WITHOUT_SUGGESTIONS` hides it.
- A comment anchored to a phrase keeps its anchor and quoted text after an edit to another paragraph.

### What it showed

- Native formatting round-trips for every block kind tried, so a Docs writer can compare blocks safely.
- Checklist tick state is lost both ways: it cannot be read, and there is no request to set it. A tool can
  create checklists but cannot sync ticks.
- Suggestions are detectable; a writer can refuse to edit a Doc with pending suggestions.
- Editing one block leaves anchored comments on other blocks in place.

### Not measured

- Edits made in the editor to the same block a push rewrites (the comment on that block is expected to detach).
- Multi-tab Docs, headings 3–6, numbered lists nested under bullets, a horizontal rule made in the editor.

## Checklist ticks (2026-10-21)

### Why

The formatting check found that the Docs API returns identical JSON for a ticked and an unticked checklist item.
Other tools report the same gap
([gws-axi #84](https://github.com/JarvusInnovations/gws-axi/issues/84),
[Latenode thread](https://community.latenode.com/t/is-there-a-way-to-detect-checkbox-status-in-google-docs-api/7820)),
and the Apps Script [ListItem](https://developers.google.com/apps-script/reference/document/list-item) has no
checked-state method either. This check looks for another route to read and write ticks.

### Setup

Same terms. [export-check.mjs](export-check.mjs) exported the owner-ticked test Doc in five formats;
[tick-spike.mjs](tick-spike.mjs) imported Markdown with `- [x]` and set strikethrough on a checklist item through
the API. Output: [tick-results-2026-10-21.jsonl](tick-results-2026-10-21.jsonl).

### Results

| Route | Ticked item comes out as |
|---|---|
| Docs API `documents.get` | same as unticked |
| Drive export, Markdown | `- [x] ~~task done~~` |
| Drive export, HTML | `<li>` with `text-decoration:line-through`, no checkbox markup |
| Drive export, DOCX | run with `<w:strike>`, no checkbox element |
| Drive export, plain text | `* task done`, same as unticked |
| Drive import of Markdown `- [x] done item` | ticked: exports back as `- [x] done item` |
| Docs API strikethrough on an unticked item | still unticked: exports as `- [ ] ~~struck item~~` |

### What it showed

- **Reading ticks works through the Markdown export.** A tool can match the export's checklist lines to the
  Docs API's checklist paragraphs in order.
- **Writing a tick works only through Drive's Markdown import**, which creates or replaces a whole document. No
  Docs API request and no Apps Script method sets a tick on an existing Doc.
- Strikethrough is a rendering of a tick, not the tick itself.

## Acceptance of `drive mirrors sync` (2026-10-22)

### Why

The checks above shaped `drive <profile> mirrors`: Docs written by drive's own writer with native formatting and
edited block by block, Sheets updated only in the mirrored range, a Google edit stopping the file. This run checks
the built command against real Google before release.

### Setup

drive-cli branch `feat/mirrors-push` built against the packed cli-core branch `feat/documents-push` (the push
engine). The owner's profile with the write grant; its `config.json` backed up and restored byte for byte; a new
marked synthetic folder, trashed at the end. [mirror-acceptance.mjs](mirror-acceptance.mjs) runs the real CLI
(`mirrors add`, `mirrors sync`) and reads results with the Docs, Drive and Sheets APIs. Output, ids removed:
[mirror-results-2026-10-22.jsonl](mirror-results-2026-10-22.jsonl) (run 4; runs 1–3 found the writer bugs below).

### Results

| Step | Result |
|---|---|
| First sync of a Markdown file (headings, marks, nested bullets, numbered, checklist, code, quote, table, rule) and a CSV | Doc and Sheet created |
| Doc read back as blocks vs the Markdown's blocks | all 14 equal |
| Sync with nothing changed | nothing written (`unchanged: 2`) |
| One local line changed | Doc updated; blocks equal the new file |
| Item struck in Google (how drive marks a tick), then two local edits and syncs | no conflict; item still checked after both |
| Text inserted in Google, then a local edit | conflict reported; the Google text kept |
| Tab added and a cell written beside the range in Google, then a shorter CSV | range rewritten, stale row cleared, the tab and the cell kept |

Runs 1–3 found three writer bugs, fixed before run 4: text inserted before a list paragraph joined that list (so
every list became one bulleted list and nesting tabs stayed in the text); the empty paragraph Docs puts before an
inserted table took the next paragraph's border (an extra rule); a bold table header never compared equal to
Markdown. Each is a request-order detail that the unit tests' fake could not show.

### Not measured

- Ticks clicked in the editor (the API cannot click; strike stands in), comments anchored to edited paragraphs,
  numbering continuity when an item is inserted into an existing list, Shared Drives, large Docs.
