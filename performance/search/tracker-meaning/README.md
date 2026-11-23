# Issues, projects and comments found by meaning in `search all`

Measured 2026-11-23 on cli-core 0.730.0 from npm.

## Why it was run

Until cli-core 0.729 the tracker lane of `search all` found Linear issues, projects and comments by their words only.
cli-core 0.730.0 ([#3247](https://github.com/WireCatLabs/cli-core/pull/3247)) embeds them as chunks of type
`tracker_item` (`embedTracker`) and fuses the lane's word hits with meaning hits, as notes and messages already do.
The question: on realistic synthetic issue sets, how much does words + meaning improve finding the right issue over
words alone, and at what latency and embedding cost? It feeds two open decisions:

- whether to put the issue's key and title in front of a comment's text before it is embedded;
- whether to skip very short comments (`LGTM`, `+1`) when embedding.

## Setup

- Machine: AMD Ryzen AI 9 HX 370 laptop, Linux 7.0, Node 24.19.0. Other work shared the machine (load average 2–4),
  so read single milliseconds as rough.
- Code: `@wirecat/cli-core@0.730.0` installed from npm into a scratch folder; the scripts import its `dist`.
- Models: `e5-small` (8-bit, 384 dimensions, meaning floor 0.8) and `embeddinggemma` (cli-core's default since
  e5-small, floor 0). Each was downloaded once through cli-core's `downloadTextModel` into its own bench folder
  (`~/.cache/wirecat-bench/tracker-meaning/models-<model>`), so cli-core's default-model choice could not mix them.
  The owner's model folder and keyring were not read.
- Isolation: every run had a throwaway `HOME`, `XDG_*`, `WIRECAT_CONFIG_DIR`, store file and
  `DBUS_SESSION_BUS_ADDRESS=disabled:`. No network except the npm install and the model downloads.
- Data, all synthetic, from [corpus.mjs](corpus.mjs) with a fixed seed:
  - 30 hand-written targets: 18 issues, 8 comments and 4 projects, about half Russian. Each has a look-alike that shares
    its words but means something else, such as "Export to CSV drops leading zeros" against "Import from CSV adds
    leading zeros". A comment target's answer is in its body, not in its issue's title.
  - Seeded filler from templates (20 product areas × 14 problems × 10 sentences, English and Russian) up to 2,000 or
    20,000 items per workspace. 30% of issues have no description. 20% of filler comments are short noise (`LGTM`,
    `+1`, `👍`, `ок`, `Готово` and so on).
  - The same workspace synced under two Linear accounts (`alice`, `bob`) through `fakeTrackerSource` and `syncTracker`,
    as two sign-ins to one workspace are. So 2,000 items are 4,000 stored rows.
  - Chat messages on the same topics (a quarter of the rows), so a full `search all` has another lane competing for the
    page.
- Queries: 60 in [queries.json](queries.json), 12 of each kind: exact words, other word forms, typos, paraphrases
  that share no content word with the answer, and questions. They were written and committed (`bd39385`) before any
  run.
- Arms:
  - **Words only**: the same store before `embedTracker`. The lane's meaning half then stops with `not_found` ("no
    issue, project or comment has vectors of … yet") and the lane reports `tracker.by = "words"`. The script checks
    that. `exact` was not used: it also changes the word match and turns off question handling.
  - **Words + meaning**: after `embedTracker`, `tracker.by = "words and meaning"`.
  - **Meaning alone**: `nearestTracker` with a warm model. Also the raw nearest list before the floor, to tell "dropped
    by the floor" from "not near". These two embed the query as written, less a trailing `?`; the lane plans a
    question first.
  - **Comments as-is** against **comments prefixed**: a second store where every comment's body is saved as
    `<key> <title>\n\n<body>`. That simulates embedding with the prefix, but the prefix also enters the word index
    and the comment's title in hits, which a real change would not do.
  - **Prefixed, short comments left out**: the prefixed store without the short comments. It stands in for "prefix,
    and do not embed short comments". It also takes them out of the word index. In the prefixed store a short comment
    carries its issue's title words, so this removes some word hits too: words alone put short comments in the first
    ten 10 times at 2,000 items and 6 times at 20,000. A real change would leave the word index alone.
- Scoring: `searchAll(store, account, { text, limit: 10, only: ["tracker"] })` for the lane, and without `only` for
  the full `search all`. A query hits at rank k when either account's copy of the target is within the first k.
  Recall@10 is the share of the two copies found in the first ten.
- Latency: 10 queries (two of each kind), 30 rounds, after one warm-up call. `searchAll` creates and closes its own
  model on every call, as one CLI search does. So "words + meaning" includes opening the model. The words-only timing
  runs on the same store with a model folder that holds no model, so the meaning half stops at once. "Meaning lookup,
  warm" is `nearestTracker` with a warm model, as a long-lived MCP server would hold it.
- Command, from this folder, per model, size and variant:

```sh
npm install --prefix /tmp/core @wirecat/cli-core@0.730.0
T=$(mktemp -d)
flock ~/.cache/wirecat-heavy.lock sh -c "free -g && env DBUS_SESSION_BUS_ADDRESS=disabled: HOME=$T/home \
  XDG_CONFIG_HOME=$T/config XDG_DATA_HOME=$T/data XDG_STATE_HOME=$T/state XDG_CACHE_HOME=$T/cache \
  WIRECAT_CONFIG_DIR=$T/config/wirecat MESSAGING_STORE=$T/unused.db \
  WIRECAT_STATE_DIR=$HOME/.cache/wirecat-bench/tracker-meaning/models-e5-small \
  node bench.mjs /tmp/core/node_modules/@wirecat/cli-core $T/work e5-small 2000 as-is 30"
node score.mjs results/e5-small-2000-as-is.json
```

[bench.mjs](bench.mjs) writes `results/<model>-<items>-<variant>.json` with every query's rank, the meaning list's
ranks and cosines, store counts and timings. [score.mjs](score.mjs) prints the tables below from it.

## Results

### Words against words + meaning, tracker lane, 2,000 items, comments as-is

hit@1 / hit@3 / hit@10 / MRR@10:

| query kind (12 each) | words | words + meaning, e5-small | words + meaning, EmbeddingGemma |
|---|---|---|---|
| exact words | 100 / 100 / 100 / 1.00 | 100 / 100 / 100 / 1.00 | 100 / 100 / 100 / 1.00 |
| other word forms | 0 / 0 / 0 / 0.00 | 67 / 75 / 100 / 0.74 | 92 / 100 / 100 / 0.94 |
| typos | 0 / 0 / 0 / 0.00 | 83 / 83 / 100 / 0.87 | 100 / 100 / 100 / 1.00 |
| paraphrases | 0 / 0 / 0 / 0.00 | 33 / 33 / 58 / 0.37 | 75 / 83 / 83 / 0.78 |
| questions | 17 / 25 / 25 / 0.19 | 50 / 58 / 75 / 0.57 | 50 / 67 / 75 / 0.58 |
| **all 60** | **23 / 25 / 25 / 0.24** | **67 / 70 / 87 / 0.71** | **83 / 90 / 92 / 0.86** |
| issue targets (36) | 22 / 22 / 22 / 0.22 | 72 / 75 / 97 / 0.77 | 94 / 97 / 100 / 0.96 |
| comment targets (16) | 19 / 25 / 25 / 0.21 | 56 / 63 / 63 / 0.59 | 69 / 75 / 75 / 0.71 |
| project targets (8) | 38 / 38 / 38 / 0.38 | 63 / 63 / 88 / 0.67 | 63 / 88 / 88 / 0.73 |

The words-only column is the same for both models: no vectors are read.

Recall@10 of the two account copies, lane alone and full `search all`: words 25% and 25%; e5-small 87% and 87%;
EmbeddingGemma 92% and 92%. hit@1 in the full `search all` is the same as in the lane or up to 3 points lower: chat
messages reached the first ten in only 6 of 60 queries.

Meaning alone (`nearestTracker`) scores almost the same as the fused lane: e5-small 67 / 72 / 87 / 0.71,
EmbeddingGemma 85 / 88 / 88 / 0.86. The e5-small floor of 0.8 dropped no target from the first ten. The targets' cosines
had a median of 0.878, and the best unrelated items scored 0.84–0.91.

### At 20,000 items (e5-small)

| | words | words + meaning |
|---|---|---|
| all 60 | 25 / 25 / 25 / 0.25 | 60 / 65 / 68 / 0.62 |
| issue / comment / project targets, hit@10 | 22 / 25 / 38 | 69 / 63 / 75 |

EmbeddingGemma was not run at 20,000: it embeds about three times slower, and the e5-small run already shows the trend.

### Comments: as-is, with the issue's key and title in front, and without short comments

Words + meaning, tracker lane, hit@1 / hit@3 / hit@10 / MRR@10:

| | as-is | prefixed | prefixed, short comments left out |
|---|---|---|---|
| e5-small 2k, all | 67 / 70 / 87 / 0.71 | 65 / 70 / 87 / 0.70 | 68 / 73 / 87 / 0.72 |
| e5-small 2k, comment targets | 56 / 63 / 63 / 0.59 | 63 / 75 / 81 / 0.68 | 69 / 81 / 81 / 0.73 |
| e5-small 2k, issue targets | 72 / 75 / 97 / 0.77 | 67 / 69 / 89 / 0.71 | 69 / 72 / 89 / 0.73 |
| e5-small 2k, short comments in the first ten (all queries) | 0 | 32 | 0 |
| EmbeddingGemma 2k, all | 83 / 90 / 92 / 0.86 | 83 / 88 / 97 / 0.87 | 83 / 93 / 97 / 0.87 |
| EmbeddingGemma 2k, comment targets | 69 / 75 / 75 / 0.71 | 69 / 75 / 94 / 0.74 | 69 / 88 / 94 / 0.76 |
| EmbeddingGemma 2k, issue targets | 94 / 97 / 100 / 0.96 | 94 / 94 / 100 / 0.95 | 94 / 97 / 100 / 0.96 |
| EmbeddingGemma 2k, short comments in the first ten | 8 | 48 | 0 |
| e5-small 20k, all | 60 / 65 / 68 / 0.62 | 58 / 63 / 68 / 0.61 | 60 / 67 / 72 / 0.63 |
| e5-small 20k, comment targets | 56 / 63 / 63 / 0.58 | 56 / 69 / 81 / 0.62 | 63 / 75 / 81 / 0.67 |
| e5-small 20k, issue targets | 64 / 69 / 69 / 0.66 | 61 / 64 / 64 / 0.62 | 61 / 67 / 67 / 0.63 |

With the prefix, the comment questions ("why are Android 14 users stuck in a login loop?", answered only by a
comment) went from 75% to 100% hit@10 for both models at 2,000 items.

### Cost

| | e5-small 2k | EmbeddingGemma 2k | e5-small 20k |
|---|---|---|---|
| tracker rows (two accounts) | 4,000 | 4,000 | 40,000 |
| chunks / distinct texts = vectors, as-is | 4,000 / 904 | 4,000 / 904 | 40,000 / 6,063 |
| distinct texts, prefixed (and without short comments) | 1,903 (1,677) | 1,903 (1,677) | 17,222 (14,938) |
| short-comment chunks / their vectors, as-is → prefixed | 456 / 10 → 226 | 456 / 10 → 226 | 4,610 / 10 → 2,284 |
| embedding time, as-is / prefixed / prefixed without short comments | 5.0 / 8.2 / 8.7 s | 16.0 / 31.9 / 29.6 s | 44.3 / 121.7 / 106.8 s |
| distinct texts embedded per second, as-is | 181 | 57 | 137 |
| tracker items (one account's) per second, as-is | 400 | 125 | 451 |
| store file + WAL before → after embedding, as-is | 10.7 → 24.1 MB | 10.7 → 35.5 MB | 66.4 → 147.7 MB |

The speeds are for one-sentence texts, and only distinct texts are embedded. cli-core's catalogue gives e5-small
31 chunks a second for chunks of about 300 tokens. A real workspace, with longer and less repeated text, will embed
several times slower per item than this table shows.

Latency in ms, p50 / p95, 300 calls each, as-is stores:

| | e5-small 2k | EmbeddingGemma 2k | e5-small 20k |
|---|---|---|---|
| lane, words only | 1.9 / 4.2 | 2.0 / 4.1 | 3.3 / 15.1 |
| lane, words + meaning (model opened per call) | 558 / 658 | 877 / 949 | 596 / 775 |
| full `search all`, words only | 22 / 46 | 22 / 46 | 27 / 63 |
| full `search all`, words + meaning | 577 / 692 | 876 / 950 | 614 / 771 |
| meaning lookup alone, warm model | 6.3 / 7.5 | 17.5 / 32.7 | 24.8 / 159 |

## What it showed

- **Meaning makes the tracker lane find what words cannot.** Words alone found the target only when the query held its
  exact words (100%) or for a few questions (25%). Other word forms, typos and paraphrases found nothing, because the
  lane's word index (`tracker_item_words`, an FTS5 table with the `unicode61` tokenizer in cli-core 0.730.0's
  migrations) has no stems and needs every word unless the query is a question. With meaning, hit@10 went from 25% to
  87% (e5-small) and 92% (EmbeddingGemma) at 2,000 items, and hit@1 from 23% to 67% and 83%. No exact-words query lost
  its first place.
- **EmbeddingGemma ranks much better than e5-small, at about 1.6 times the latency.** It put 83% of targets first,
  against 67%, and paraphrases at 75% hit@1, against 33%. e5-small's cosines are bunched (0.83–0.91 for answers and
  look-alike items alike), so its 0.8 floor removes almost nothing and the order inside that band is close to noise for
  paraphrases.
- **The added time is opening the model, not the search.** One `search all` with meaning costs about 0.55 s more
  with e5-small and 0.85 s with EmbeddingGemma, because `searchAll` opens the model for every call. The lookup itself
  is 6–25 ms with a warm model. That matches what [search-all-meaning](../search-all-meaning/README.md) found for
  messages; an MCP server that keeps the model warm pays only the lookup.
- **Embedding is cheap here because texts repeat.** Chunks are stored once per distinct text, so 4,000 rows
  needed 904 vectors, and 456 short-comment chunks needed only 10. Two accounts on one workspace cost no extra vectors.
  The filler repeats its templates, so a real workspace has more distinct texts per row, and its embedding time grows
  with them.
- **Two accounts on one workspace halve the page.** Both copies of every hit come back side by side (73 of 77 first
  pairs were the same item), so ten results show about five distinct items. That held in every arm. It is a ranking
  issue of its own, beside meaning.
- **Prefixing comments: better for comments, slightly worse for issues with e5-small.** Comment targets went from 63% to
  81% hit@10 (e5-small) and from 75% to 94% (EmbeddingGemma). With e5-small, issue targets fell from 97% to 89%, because
  the prefixed comments compete with their own issue. With EmbeddingGemma they held at 100%. A prefixed `LGTM` becomes a
  near copy of its issue, so short comments filled 32–48 of the first-ten slots across the 60 queries instead of 0–8.
  Each one also needs its own vector: 226 instead of 10 at 2,000 items. Leaving the short comments out removed that
  crowding and scored best or equal of the three for every model and size, by one to three queries: hit@10 87%
  (e5-small) and 97% (EmbeddingGemma) at 2,000 items, 72% at 20,000. It also needed fewer vectors than prefixing alone
  (1,677 against 1,903 at 2,000 items). Issue targets with e5-small stayed below as-is (89% against 97% at 2,000 items,
  67% against 69% at 20,000), so with e5-small the prefix still costs the issues a little. Part of this variant's gain
  comes from the word side of the simulation (see Setup), which a real change would not have.
- At 20,000 items, e5-small's hit@10 fell from 87% to 68%. More look-alike filler sits in the same cosine band.
- **Read the variant differences as direction, not size.** One query is 1.7 points of 60, and one comment query is
  6 points of 16. Most gaps between the three comment variants are one to three queries. The words against meaning
  gap (25% against 87–92%) is the only large one.

## For the decisions

- **Prefix a comment with its issue's key and title before embedding?** It finds more comments with both models
  (hit@10 63% → 81% with e5-small, 75% → 94% with EmbeddingGemma). With EmbeddingGemma, the default, issues lost
  nothing. With e5-small, issues lost 8 points of hit@10 at 2,000 items.
- **Skip very short comments when embedding?** It matters only if the prefix ships. Embedded as they are, the short
  comments cost 10 vectors in all, because identical texts share one, and they took 0–8 of the 600 first-ten slots.
  Prefixed, each becomes a near copy of its issue: 226 vectors and 32–48 slots. So the two decisions go together:
  prefix and skip short comments, or neither.

## Not measured

- Real issues. The filler is template text with many repeats, the targets were written by the same agent that
  scored them, and there is one target per query. A real workspace has longer, more varied text, so absolute numbers
  will differ. The words-only baseline is likely too low on real data, where people reuse the issue's words more.
- Queries with no answer. Meaning returns a full page for any query (about 9 of 10 lane slots were meaning-only hits in
  every run), so it will also return items when nothing matches. That was not scored.
- A real prefix. The prefixed store also changes the word index and the hit's title; a cli-core change would prefix
  only the embedded text.
- Messages, mail and notes by meaning in the same `search all`. The bench passes no messages meaning lane, so only
  the word hits of chat messages competed with the tracker lane. With every lane searched by meaning, the tracker lane
  gets fewer of the first ten.
- EmbeddingGemma at 20,000 items, e5-large, the MCP server end to end, Bun, and a cold file cache.
- Long descriptions over one chunk (1,200 characters): every text here fits in one chunk.
