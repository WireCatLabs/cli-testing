# Memo hybrid search and questions in other words (7 November 2026)

## Why it was run

The v3 benchmark reworded 18 of its 50 questions (`kg-fixture-v3-paraphrased`). On the 17 that have a source record,
memo 0.131.47 `search all` found 0.34 of the answers in its first 10 hits. The same e5-small model alone, plain cosine
over each record's text (`../eval_embeddings.py`), found 0.71. The question: what in memo's word + meaning search
loses the reworded questions, and is there a ranking change in cli-core that helps them without hurting the plain
v3 questions and the older 10K set? It fed cli-core PR
[#2609](https://github.com/WireCatLabs/cli-core/pull/2609).

## Setup

- Machine: Linux x64, 30 GB, other benchmark jobs running beside it. Python 3.14, Node 24.19.
- memo 0.131.47 as installed (cli-core 0.599.0 bundled; its search code is the same as cli-core 0.600.0), e5-small
  8-bit, every store in an isolated folder (`../memo_baseline.py`'s `Memo`), never the owner's.
- Stores, all seeded by `../memo_baseline.py`:
  - v3 with one sender on every mail (`From: Synthetic Sender`, how the harness wrote mail until this change),
  - v3 with each mail's author as its sender (this change to `../memo_baseline.py`),
  - 10K (`kg-fixture-10k`), built with memo 0.131.38, read by 0.131.47.
- Question sets: the 17 reworded v3 questions; the 46 plain v3 questions; the 40 10K questions. Each asked as typed
  (`verbatim`) and as its content words joined by OR (`or`), `search all --limit 10`.
- Scripts, in the order they were used:
  - `meaning_lane.py`: ranks the 4,372 v3 mails by meaning alone, outside memo, swapping one piece at a time.
  - `patch_memo.py`: copies the memo package and patches its bundled cli-core, `--debug` to dump each source's word
    and meaning lists, `--fix` to apply the change.
  - `capture.py` + `simulate.py`: record each source's lists for every question, replay memo's merge from them,
    then try other merge rules on the same lists.
  - `hybrid_eval.py` + `all_sets.sh`: recall@1/5/10 of the real memo, before and after, on every set.

```sh
python3 patch_memo.py ~/.nvm/versions/node/v24.19.0/lib/node_modules/@wirecat/cli-memo /tmp/memo-before --debug
python3 patch_memo.py ~/.nvm/versions/node/v24.19.0/lib/node_modules/@wirecat/cli-memo /tmp/memo-after --fix
uv run --with fastembed --with onnxruntime --with tokenizers python3 -I meaning_lane.py <v3 store>/memo \
  ~/.cache/wirecat-bench/kg-fixture-v3-paraphrased
python3 capture.py /tmp/memo-before/dist/bin/memo.js <v3 store>/memo ~/.cache/wirecat-bench/kg-fixture-v3 verbatim \
  cap/v3-verbatim.json        # and the other sets
python3 simulate.py cap/*.json
./all_sets.sh /tmp/memo-before/dist/bin/memo.js /tmp/memo-after/dist/bin/memo.js <v3 store>/memo <10K store>/memo
```

## Results

### 1. Meaning alone, mail only: the sender line

Where memo's meaning search puts the 20 mail answers of the reworded questions among 4,372 mails
(`meaning-lane-one-sender.txt`, `meaning-lane-real-senders.txt`).

| Vectors | In top 10 | In top 30 | Median rank |
|---|---:|---:|---:|
| memo's, every mail from `Synthetic Sender` | 0.40 | 0.60 | 18 |
| memo's, each mail from its author | 0.50 | 0.70 | 10 |
| the record text alone, same 8-bit model | 0.55 | 0.70 | 7 |
| the record text alone, full-precision e5-small | 0.55 | 0.65 | 9 |

- memo embeds a mail as `<sender>: <subject>` and the body. One name on every mail put the same words at the head of
  every piece, and the answers fell from median rank 10 to 18. That came from the harness, not memo:
  `../memo_baseline.py` now writes each record's author as its sender.
- With real senders the sender line still costs a little (10 against 7). Not changed: the text is what each mail's
  vector is stored by, so changing it re-embeds every owner's mail.
- The 8-bit model against full precision: no loss here. The `query: ` prefix: without it the median rank is 21.

### 2. The merge: where the found answer is lost

Replaying memo's ranking from the captured lists matched memo's own top 10 on 45 of 46 questions and 40 of 40
(`simulation.txt`). On the reworded questions:

- **A question's hit that both lists hold keeps only its words rank.** `search all` asks a question as any-word, and
  for a question a hit both words and meaning found gets no second vote (MEMO-36), so it keeps its words rank only.
  In 5 of the 17 questions meaning ranked the answer 0 to 5 and the any-word list 4 to 16. Those answers sat at rank
  7 to 16 of their own source and fell off the page.
- **The page takes about five hits per source.** `oneList` merges the sources by rank in each source, so on a page
  of 10 with mail and notes, rank 5 of mail is about rank 10 of the page.
- **Meaning ranks some answers too low to be rescued:** 13, 24, 45, 47, 57 and 70 of 4,372 mails.

Merge rules tried on the same lists, v3 with real senders and 10K, recall@10 (the reworded and v3 columns are the
questions as typed unless marked OR):

| Rule | Reworded | v3 typed | v3 OR | 10K typed | 10K OR |
|---|---:|---:|---:|---:|---:|
| now: words rank only for a question | 0.36 | 0.71 | 0.87 | 1.00 | 1.00 |
| sum both votes always | 0.42 (@1 0.14 → 0.23) | 0.72 (@1 0.33 → 0.38) | 0.87 | 1.00 (@1 0.72 → 0.68) | 1.00 |
| better of the two ranks, always | 0.44 | 0.75 | 0.89 (@1 0.54 → 0.51) | 1.00 | 1.00 |
| **better of the two ranks, for a question** | **0.44** | **0.75** | **0.87** | **1.00** | **1.00** |
| one meaning list for every source by cosine | 0.53 | 0.76 | 0.87 | — | — |

Summing both votes is what MEMO-36 had removed: it lifts @1 for some sets and drops it for 10K. One meaning list
across sources helped the reworded questions as typed but cost their OR form 0.42 → 0.30; not taken. The change is
the fourth row: it alters only what the MEMO-36 rule did, and nothing for a query that is not a question.

### 3. memo before and after the change

memo 0.131.47 as shipped and with the change, v3 with real senders and 10K, mail scored by its ref
(`results-memo-0.131.47.txt`). Recall @1 / @5 / @10:

| Set | Asked | Before | After |
|---|---|---|---|
| v3 reworded (17) | as typed | 0.14 / 0.36 / 0.36 | 0.14 / **0.44 / 0.44** |
| v3 reworded (17) | OR | 0.14 / 0.36 / 0.42 | 0.14 / 0.36 / 0.42 |
| v3 plain (46) | as typed | 0.34 / 0.64 / 0.71 | 0.34 / **0.68 / 0.75** |
| v3 plain (46) | OR | 0.54 / 0.82 / 0.87 | 0.54 / 0.82 / 0.87 |
| 10K (40) | as typed | 0.72 / 1.00 / 1.00 | 0.72 / 1.00 / 1.00 |
| 10K (40) | OR | 0.68 / 0.97 / 1.00 | 0.68 / 0.97 / 1.00 |

On the v3 store with one sender (the store of the 0.34 above), the reworded questions as typed go 0.31 / 0.34 at
@5 / @10 to 0.39 / 0.42 and the plain v3 ones do not drop (`simulation.txt`, `cap-old`). The real senders alone, with no
change in memo, moved the plain v3 questions as typed from 0.24 to 0.34 at @1 and OR from 0.45 / 0.79 to
0.54 / 0.82 at @1 / @5.

## What it showed

- The gap to plain cosine has three parts. The harness's single sender cost about 8 median ranks of meaning. The
  merge threw away meaning's rank for a hit words also found. The page takes about five hits per source.
- The change raises the reworded questions from 0.36 to 0.44 at @10 and the plain v3 questions as typed from 0.71
  to 0.75. The OR form and the 10K set do not move.
- The rest of the gap is in meaning itself: for six answers e5-small 8-bit ranks a dozen near-identical
  distractors higher ("Grove Atlas offsite" mails for the "Grove Atlas team retreat deposit"). A larger model
  (e5-large 0.82 alone, cli-core #2608) is the lever there, not the merge.
- Scoring fix: a mail's `title` in `search all` is its thread's, so the scorer credited the first mail of a thread
  as the thread's latest reply. `memo_baseline.py` now maps a mail by its ref. Results before 7 November were
  scored by title.

## What was not measured

- Real mailboxes. Every record is synthetic, one or two sentences long, with subjects named `r0001`….
- Messenger messages: in this harness Telegram chats and meetings are stored as notes, so `search all`'s message
  merge was not exercised. It uses the same rule and gets the same change.
- The change with e5-large or EmbeddingGemma (cli-core #2608), and with the query parsing of #2607.
- Speed: the change does no new work; p50 stayed at 1.1–1.2 s per question.
- A wider page (`--limit 20` and up), where the per-source share matters less.
