# HTML readers on 30 public pages

Measured 2026-10-13. Plan: max-cli `docs_ai/plans/2026-10-13-readers-and-html-plan.md`, decision 5 and work item 2.

## Why we ran it

memo, drive and attachments read an HTML page with one regex function, `htmlText`. It drops scripts and tags and
keeps every word that is left, so the menu, the cookie text and the footer end up in the search index next to the
article. It also returns no title, author or date. The reader plan replaces it with a DOM parser, a main content
extractor and Markdown output with headings and metadata. Two engines can do that:

- **A:** [defuddle](https://github.com/kepano/defuddle) 0.19.5 on linkedom 0.18.13. Main content, metadata and Markdown in one call.
- **B:** [@mozilla/readability](https://github.com/mozilla/readability) 0.6.0 and
  [turndown](https://github.com/mixmark-io/turndown) 7.2.4 on linkedom, with metadata read by hand (about 20 lines).

The question: which one finds the article text and drops the page furniture more reliably, what metadata does it
give, and what does it cost in time and install size? The answer picks the engine for the HTML reader (PR 3 of the
plan). The current regex reader is the baseline, **C**.

## Setup

- **30 saved pages** in [fixtures/](fixtures/), fetched once with `curl` on 2026-10-13, kept unchanged.
  [manifest.json](manifest.json) holds each page's source URL (the attribution), licence, language, kind and fetch
  date. 19 English and 11 Russian: 8 documentation pages, 6 news items, 4 forum threads (all Wikipedia talk pages),
  3 Wikipedia articles, 3 blog posts, 3 newsletter issues (Wikimedia Tech News), 2 product pages (Open Food Facts),
  1 government page with a heavy menu (USAGov). Every page is under an open or public domain licence, listed in
  the manifest: CC BY or CC BY-SA (Wikipedia, Wikinews, Meta-Wiki, Open Food Facts, MDN, Rails Guides, Kubernetes,
  the Go blog, kremlin.ru), MIT or Apache-2.0 (Rust book and blog), PostgreSQL licence, PSF licence, and US
  government public domain (NASA, USAGov). The newsletters are wiki pages, not table based HTML email markup.
  No private data.
- **Hand cut reference** per page, in [reference/](reference/): the expected title, 3 to 4 passages that must be in
  the main text and 2 to 3 strings from menus or footers that must not be. All strings were checked to exist on
  the page (`node check-reference.mjs`). Matching ignores case and punctuation and works on the output with Markdown
  link targets removed.
- **Engines** in [engines.mjs](engines.mjs), run in one Node process, parse included in the time:
  A, B, and C, which is `htmlText` copied from cli-messaging `src/attachments/markup.ts`
  (file last changed in commit `358475e0`; cli-messaging main was `b00ae58c`), types removed.
- **Metrics.** Recall: share of must appear passages found. Noise: share of must not strings present in the
  output. Title: the expected title occurs in the engine's title (exact: the title is only that, no site suffix).
  Metadata: pages with a non empty description, author, published date, language, site name (found, not checked
  for correctness; language is checked against the manifest). Headings: lines starting with `#` in the output
  against `h1` to `h6` inside the main element or `body` and outside nav, header, footer and aside. Time: 5 runs
  of every page, so 150 timings per engine, median and p95. Size: the engine's dependencies installed alone with
  pnpm, `du -sk node_modules`, and packages counted in `node_modules/.pnpm`.
- AMD Ryzen AI 9 HX 470, Linux 7.0.0-38, Node v24.19.0, pnpm 11.20.0. Other work was running on the machine.
- Run, in this folder:

  ```sh
  pnpm install --ignore-workspace
  node check-reference.mjs
  node sizes.mjs   # installs each engine alone in a temp folder, writes sizes.json
  node run.mjs     # prints the tables, writes results.json
  ```

## Results

Totals over the 30 pages. Full data per page: [results.json](results.json).

| engine | recall | pages with all passages | noise | title contains / exact | metadata d / a / p / l / s | `#` lines / headings | median ms | p95 ms | install | packages |
|---|---|---|---|---|---|---|---|---|---|---|
| **A** linkedom + defuddle | 0.98 (114 of 116) | 28 | **0.02** | 29 / 16 | 17 / 10 / 13 / 30 / 30 | **209 / 327** | 64 | 290 | 22.6 MB | 27 |
| **B** linkedom + readability + turndown | 0.91 (105 of 116) | 25 | 0.02 | 30 / 13 | 17 / 13 / 6 / 30 / 16 | 186 / 327 | **16.8** | **70** | **16.1 MB** | 23 |
| **C** regex `htmlText` (current) | **0.99** (115 of 116) | **29** | 0.98 | 30 / 2 | 0 / 0 / 0 / 0 / 0 | 31 / 327 | 0.4 | 1.5 | 0 | 0 |

Metadata columns: d description, a author, p published, l language, s site, each out of 30 pages. Language is
correct on all 30 pages for A and B. C's 31 heading lines are lines of plain text that happen to start with `#`; it
has no headings. The one title A missed is the Open Food Facts Coca Cola page, where A drops the last part
("330 ml").

Passages found by kind of page (A / B / C):

| kind | passages | A | B | C |
|---|---|---|---|---|
| docs | 31 | 31 | 30 | 31 |
| news | 22 | 22 | 18 | 22 |
| forum | 15 | 15 | 15 | 15 |
| email | 13 | 12 | 12 | 13 |
| blog | 11 | 11 | 11 | 10 |
| wikipedia | 12 | 11 | 11 | 12 |
| shop | 8 | 8 | 8 | 8 |
| heavy menu | 4 | 4 | 0 | 4 |

- B returned no main text on one Kremlin news page (0 of 4) and on the USAGov page (0 of 4), and lost one passage
  each on the MDN page, the English Wikipedia article and one newsletter. I think Readability's scoring drops pages
  without long paragraphs; the run does not show the cause.
- A lost one passage on the English Wikipedia article and one on a newsletter issue (the same ones B lost).
- A kept 1 noise string on each of 2 Wikipedia talk pages; B kept 2 on the Rust book (its keyboard help box).
- Russian: A 42 of 42, B 38 of 42, C 42 of 42. English: A 72 of 74, B 67 of 74, C 73 of 74.
- Slowest for A: the Russian Kubernetes docs page and the Kubernetes blog (about 320 ms and 275 ms, 500 KB of HTML
  each) and the Python json docs (about 190 ms). Slowest for B: the Wikipedia articles (about 70 ms). Medians moved
  by about 20 % between runs, so read times to within that.

## What it showed

- C finds nearly all the text because it keeps all the text; 98 % of the menu and footer strings are in its output
  too. It has no title, no metadata and no headings. It is fast (0.4 ms) and needs nothing installed.
- A is within one passage of C on recall and removes almost all the noise. It also gives metadata (site name and
  language on every page, description on 17) and keeps 209 of 327 headings. The cost is about four times B's time
  (median 64 ms, p95 290 ms on pages of up to 0.6 MB) and 6.5 MB more install.
- B is faster and smaller but loses the whole article on two pages that are not shaped like a news story, and its
  hand written metadata finds the site name on only 16 pages (it reads `og:site_name` only) against A's 30. It finds
  author on 3 more pages than A because it falls back to Readability's byline.
- Author and publication date are on under half the pages for both engines. Probably the other pages do not
  publish them in `meta` or JSON-LD; the run did not check that page by page.
- An earlier run on three commercial newsletter pages (table based email markup, removed because their licence is
  all rights reserved) showed B losing half the text of two of them and A keeping it all. That is not reproducible
  from this folder, so treat it as a hint, not a result.

## Recommendation

Use **A (linkedom + defuddle)** for the HTML reader. It has better recall than B (0.98 against 0.91), the same noise,
more metadata and headings, and its slower time stays under 0.4 s per page in this set (largest page 0.6 MB). Keep
the regex `htmlText` as the fallback when A throws or returns an empty text, as the plan says.
B's one edge is author (13 pages against 10), from Readability's byline fallback. If that matters, the reader can
fill an empty `author` from `<meta name="author">` after A returns.

## What was not measured

- Correctness of metadata values, only that a field was found (language was checked against the manifest).
- Pages that need JavaScript to show the article, tables and code blocks in the Markdown, image `alt` text, links.
- Pages in other languages or scripts, real saved pages with inlined CSS (the "heavy menu" case is one page), and
  table based HTML email markup (no openly licensed example was found; the newsletters here are wiki pages).
- A fair p95 for large pages on a slower machine, memory use, and cold start (the first call of each engine is
  discarded as a warm up; module load time is not in the numbers).
- Section ranges for chunking: the plan's `sections` come from headings and are not scored here.
- The reference is small (3 to 4 passages per page) and cut by one person, so a difference of one passage is noise.
- defuddle's Markdown on pages with math or footnotes was not read line by line.
