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
  hash moved only on content changes. A push should compare the last revision id, or the export hash.
- **Re-pushing a CSV wipes a Sheet's other tabs and formatting.** A Sheet that people work in should not be a
  CSV push target; the push should warn, or refuse when the Sheet has more than one tab.
- Local images in Markdown need uploading separately, or a warning.

## Not measured

- Edits made in the Docs editor by a person (only API edits). Revisions may merge over time, so the last revision
  id may behave differently for editor edits.
- Comments anchored to text: an API comment is unanchored, so whether anchors survive a re-push is unknown.
- Suggestions, multi-tab Docs, large files, Shared Drives, and how `revisions.list` pages on long histories.
- The resumable upload path (this used the client library's simple upload).
