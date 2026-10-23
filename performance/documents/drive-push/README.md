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

## Two-way sync: Google's edits back into local files (2026-10-22)

### Why

The owner asked for Google edits to come back into the local files, not only stop the sync (ASK-294,
NEED-1618/1619 in the private journal). cli-core gained a three-way block merge and a Markdown splice that rewrites
only the lines of changed blocks; drive's `mirrors sync` uses them and gains `--keep local|google|both`. The
question: on real Docs and Sheets, does a Google edit land in the file without disturbing the rest of it, is a
both-sides change reported with Google's time and author, and does `--keep both` keep both? The run gated the
cli-core release.

### Setup

- Linux, Node 24.19.0; drive-cli branch `feat/mirrors-pull` built against cli-core branch `feat/documents-pull`
  (unreleased, linked); the owner's personal profile, authorized for synthetic live writes.
- A new folder marked `wirecat-pull-acceptance-… (synthetic, safe to delete)`, trashed at the end; the local
  folder and the config change are removed and restored.
- `node pull-acceptance.mjs <drive-cli checkout> <profile>`; results in `pull-results-2026-10-22.jsonl`.
- The Markdown uses `*` bullets and a ```` ```js ```` fence, which a Doc cannot hold, to see whether a pull
  keeps the file's own spelling. Google-side edits go through the Docs and Sheets APIs.

### Results

| Step | Result |
|---|---|
| First sync of a Markdown file and a CSV | Doc and Sheet created |
| Text inserted into a paragraph and an item struck (a tick) in Google; file unchanged; sync | file pulled, nothing written to Google; 2 lines changed, `*` bullets and the `js` fence kept |
| Sync again | nothing pulled or written |
| Same paragraph changed in Google and in the file | conflict with the paragraph at the last sync, each side's text, the local time, Google's revision time and editor; file untouched |
| `--keep both` | both paragraphs, local first, in the file and the Doc |
| Cell edited and a row added in Google; CSV unchanged; sync | CSV pulled: `950.50` kept as written, `130` and the new row in |
| Drive change feed read right after a Docs API edit | the Doc was not listed |

### What it showed

- A pull touches only the changed lines; the file keeps formatting the Doc cannot carry.
- Conflict reports carry Google's last revision time and editor from the revision list.
- The change feed did not list a Docs API edit when read straight after it. Whether it lists it later, or lists
  edits made in the editor, is still open; a watcher cannot rely on it alone yet.

### Not measured

- Edits and ticks made by a person in the editor (the API stands in), suggestions, comments on rewritten
  paragraphs, XLSX (pull is not supported; a Google edit stays a conflict), Windows and macOS line handling on a
  live run (unit tests cover CRLF and the byte-order mark), large files.

## Google Docs' own Markdown editing (2026-10-23)

### Why

Google Docs now opens a `.md` file stored in Drive and edits it as Markdown, saving Markdown back into the same
file. drive's `mirrors` turns each `.md` into a separate native Doc. If Google's own editing keeps the file
Markdown, mirrors may be the wrong tool for plain notes, and the owner held images and a watcher until this was
known. Two questions:

1. What does a person's edit in Docs do to a `.md` file: does it stay `text/markdown`, which formatting changes,
   and where do comments go?
2. Does Drive's change feed list edits made by a person in the editor? The two-way sync run found that it did not
   list a Docs API edit read right after it, and a watcher depends on the feed.

### Setup

- Linux, Node 24.19.0, drive-cli 0.23.0 built from source (its saved sign-in only); the owner's personal profile,
  authorized for synthetic live writes.
- `native-md-check.mjs` with four phases: `setup` makes a folder marked
  `wirecat-native-md-check-… (synthetic, safe to delete)` holding `notes.md` (heading, bold, a link, two task
  items, a table, a closing line) and an empty-ish Doc, and records a change-feed start token. Then, by hand in
  the browser, the owner opened `notes.md` in Docs, commented on "Plain paragraph", edited the closing line and
  ticked the open item, and typed into the Doc. `check` reads the feed, the file and the comments, then replaces
  the file from outside as a local sync would. `inspect` counts what Docs wrote into the file without printing it.
  `cleanup` trashes the folder.
- `node native-md-check.mjs <drive-cli checkout> <profile> setup|check|inspect|cleanup <state.json>`; results in
  [native-md-results-2026-10-23.jsonl](native-md-results-2026-10-23.jsonl), ids and links removed.

### Results

| Check | Result |
|---|---|
| File type after the hand edits | still `text/markdown`; every revision `text/markdown` |
| Tick | `- [ ] open item` became `- [x] open item` followed by two trailing spaces |
| Bold, link, table | kept; the table separator `\|---\|---\|` was rewritten as `\| :---- \| :---- \|` |
| Comment in the Drive comments list | **none**, also with deleted comments included |
| Comment in the file | inline markers `<!-- gdoc_comment_begin: c1 -->…<!-- gdoc_comment_end: c1 -->` around the quoted text, plus a `gdoc_comments:` block between `---` lines at the end holding status, an opaque token, the author's display name, the time, the comment text and the quote |
| Change feed, hand edit in the Doc | listed |
| Change feed, hand edit in the `.md` | listed |
| Outside replacement keeping the text (a line appended after the block) | accepted; one more revision; the comment block stays in the file because the text kept it |

### What it showed

- Docs' own Markdown editing keeps the file Markdown and the tick as `[x]`, but rewrites some spelling (table
  separator, trailing spaces). A sync of raw `.md` files would see those as changes.
- **Comments live in the file.** A downloaded or synced `.md` carries commenters' names and comment text, and the
  Drive comments API does not show them. A tool that copies the file into a git repository publishes the
  comments; a tool that drops the block deletes them.
- The change feed listed both editor edits, so a watcher can use the feed for edits a person makes. The earlier
  miss was a Docs API edit read at once.

### Not measured

- Whether Docs still shows the comment after an outside replacement that moves or drops the block; how long the
  feed takes to list an editor edit (the check ran about a minute after the edits); suggestions; images; a file
  shared with a second person; how Docs handles Markdown it does not write itself (`*` bullets, fenced code).
