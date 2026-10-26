# Google's native Markdown files and drive mirrors

Run 2026-10-25 for drive-cli backlog item DRV-9.

## Why

Since 2026-10-05 Google Drive and Docs open `.md` files natively: people view, edit and comment on them in Docs
and the file stays Markdown ([Google Workspace Updates, 2026-10-05][announcement]). drive's `mirrors` turn a local
Markdown folder into Google Docs and merge edits both ways. The question: when a `.md` file in Drive is enough,
what can a program still do with it, and when are mirrors still needed? The answer feeds drive's
[mirroring guide](https://github.com/WireCatLabs/drive-cli/blob/main/docs/mirrors.md).

It adds the program's side to the [2026-10-23 editor check](../drive-push/README.md#google-docs-own-markdown-editing-2026-10-23),
which measured what a person's edit in Docs writes into the file.

## Setup

- drive-cli built from `main` at 0.31.0 plus the sign-in refactor (PR 214/215), on Linux, Node 24.19.
- A personal Google account, after Google's rollout window; a test folder only.
- [sample.md](sample.md): synthetic, with YAML front matter, headings, emphasis, inline code, a link, task and
  ordered lists with nesting, a table, a fenced code block, a quote, a web image and a footnote.
- Command: `./probe.sh <drive-cli checkout> <profile> <test folder id>`. It uploads the sample, then calls the
  Drive and Docs APIs; [replace.mjs](replace.mjs) replaces the file's bytes with the saved sign-in.

## Results

| Operation | Result |
| --- | --- |
| Upload `sample.md` | Stored as `text/markdown`; `canEdit` and `canComment` true |
| Docs API `documents.get` | Works: the file reads as a Doc |
| Docs API `documents.batchUpdate` | HTTP 400 "This operation is not supported for this document. The document must not be an Office file." |
| Drive comment on the file (API, no anchor) | Created and listed; unlike a comment made in the Docs editor, which is written into the file and not listed (2026-10-23) |
| Replace the whole file (`files.update`, `uploadType=media`) | Same id, still `text/markdown`; the Docs view shows the new text; the comment stays |
| Download (`alt=media`) | The bytes as uploaded |

How the Docs API sees the sample:

| Markdown | In the Doc |
| --- | --- |
| Front matter (`---` … `---`) | A horizontal rule, then the YAML lines as one level-2 heading |
| `#`, `##` headings | Heading 1, Heading 2 |
| Bold, italic, inline code, link | Bold, italic, monospace font, link |
| Task list, nested list, ordered list | Bulleted paragraphs; the check boxes are not text |
| Table | A 3 × 2 table |
| Fenced code block, quote | Paragraphs with a private-use marker character before the text; code in monospace |
| Web image, footnote | An inline image; a real footnote |

## What it showed

- A `.md` file in Drive is readable by programs through the Docs API, with structure, so search and import do not
  need a converted copy.
- Programs cannot edit it piece by piece: the Docs API refuses every write, as for Word files. A program can only
  replace the whole file. That keeps the file and its unanchored comments.
- Google reads front matter the way cli-core's Markdown reader does (drive DRV-8): as a rule and a heading. That is
  the CommonMark reading of `---`, so front matter needs explicit handling on both paths.
- Comments split two ways: one made in the Docs editor is written into the `.md` file with the commenter's name
  and text, invisible to the comments API (2026-10-23); one made through the API stays outside the file.
- So a native `.md` file is enough when people edit in Docs, programs only read or replace the whole file, and
  comments may travel inside the file. A mirror (a real Google Doc) is still needed when a program and people both
  edit the same document, or when comments must stay out of the Markdown, for example in a git repository.

## Not measured

- Whether the Docs editor keeps front matter and footnotes when a person edits: the 2026-10-23 check covered ticks,
  tables, bold, links and comments, not these. The browser was not available for this run.
- Whether comments anchored to text in the Docs editor survive a whole-file replace (API comments have no anchor
  Docs shows).
- Files larger than the sample, `.markdown` files, Workspace accounts and shared drives.

[announcement]: https://workspaceupdates.googleblog.com/2026/10/preview-edit-and-collaborate-on-Markdown-files-natively-across-Drive-and-Docs.html
