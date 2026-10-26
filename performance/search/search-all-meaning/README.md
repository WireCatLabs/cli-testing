# Search all by meaning: what it costs

Measured 2026-10-25 for [cli-core#2009](https://github.com/WireCatLabs/cli-core/pull/2009).

## Why we ran it

`search all` (tg, max, and memo's) matched messages by words only, while `search messages --discover` already
found them by meaning too (cli-core 0.432.0, [#1979](https://github.com/WireCatLabs/cli-core/pull/1979)).
#2009 runs the same meaning lookup inside `search all`. The question: how much slower does a `search all`
get when it searches messages by meaning as well, and where does the time go? The answer decided two things:
whether meaning can be on by default once the model and vectors exist, and whether the model should be shared
between the messages and notes lookups in one search.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, Linux, Node 24.19.0.
- Code: cli-core branch `feat/search-all-meaning` (#2009); the messages-only runs at commit `06b2f49c`. Before/after for model sharing: commit `aa70d561`
  (before) and `01fea012` (after).
- Model: the real e5-small, from the owner's model folder, symlinked into a temporary state folder. Nothing
  downloaded, no hosted service.
- Data: a synthetic store in a temporary folder: 10,000 messages (2 accounts × 10 chats × 500), each 6–15 words
  drawn from a fixed 30-word vocabulary with a seeded generator, all given vectors (101.6 s to embed). For the notes
  case, 200 synthetic notes, embedded. No real messages or notes were opened.
- Queries: `paying the bill`, `trip abroad`, `cat`, `doctor appointment` (`chat:3` in the first run), `release bug`,
  three rounds each (n = 15), `limit 20`.
- Scripts: [bench-search-all.ts](bench-search-all.ts) (builds the store, messages only),
  [bench-split.ts](bench-split.ts) (the parts timed apart),
  [bench-search-all-notes.ts](bench-search-all-notes.ts) (adds notes, default `search all`). Copy them into a
  cli-core checkout's root and run with `npx tsx`.

## Results

Messages only (`only: messages`):

| | median | max |
|---|---|---|
| words only | 10 ms | 19 ms |
| words + meaning | 962 ms | 1,331 ms |
| the meaning lookup alone | 1,035 ms | 1,294 ms |

The meaning lookup, timed apart (median of 10):

| part | median |
|---|---|
| open e5-small | 730 ms |
| embed the query | 24 ms |
| nearest vectors, both accounts, 10,000 vectors | 57 ms |

Default `search all` (messages and notes), both searched by meaning:

| | median | max |
|---|---|---|
| before: each opens its own model | 1,693 ms | 2,412 ms |
| after: one model per search | 873 ms | 1,734 ms |

Run again back to back, alternating the two commits: before 1,684 and 1,564 ms, after 859 and 977 ms (medians).
One more run of the after commit alone gave 1,197 ms. The machine was busy (load average about 14), so the
milliseconds move by a few hundred between runs. The halving held on every run.

## What it showed

- Searching by meaning adds about a second, and about three quarters of that is opening the model. The CLI opens
  it on every search. `--discover` pays the same. The vector lookup itself is small at this size.
- Messages and notes each opened the model, so a default `search all` paid the load twice. Sharing one model per
  search halved the median. #2009 now does that.

## Not measured

- The MCP server, which keeps models warm between calls. Its messages lookup reuses the warm model; notes still
  open their own.
- Stores larger than 10,000 messages. The vector lookup grows with them; see [vector-index](../vector-index/README.md).
- Ranking quality. Fusion follows arm A2 of the [evidence pipeline](../evidence-pipeline/README.md), which measured
  it for `--discover`.
- Real messages. The vocabulary is tiny, so the words-only timing is likely lower than on a real archive.
