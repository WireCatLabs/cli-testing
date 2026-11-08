# Write-time enrichment in Memo, off and on

## Why this was run

The owner decided that rewriting records with a model at write time ("enrichment") should be a setting, off by
default, that WireCat Desktop can show as a switch: the records go to a hosted model, so it must be his choice. The
setting is [cli-core #2690](https://github.com/WireCatLabs/cli-core/pull/2690). An earlier prototype
([../knowledge-graph-memory/enrich_records.py](../knowledge-graph-memory/enrich_records.py)) appended a model's facts
to each record and lifted Memo 0.131.47 on 17 reworded questions from 0.34 to 0.56 at @10. This run asks the same
question of the shipped design, where the text is kept beside the record (in its stems and in a chunk of its own), and
of a newer Memo whose search without enrichment is already much better.

The question: with enrichment on, does Memo find the record for a question asked in other words more often, and what
does it cost? The answer feeds the default (off) and what the desktop says about the switch.

## Setup

- Machine: Linux x86_64, one embedding job at a time (a shared lock), e5-small (`MEMO_EMBEDDING_MODEL`).
- Memo 0.131.55 built against cli-core `feat/enrichment-setting` at 870b8c23f (the same code as 1269d3d57 after a
  rebase), packed with `pnpm pack` and installed as a file dependency. Mail loaded by the `mail` CLI 0.20.0.
- Data: the synthetic v3 set (wcatbench `synthetic-10444-74290fb3`): 10,444 records (4,372 mail, 6,072 notes,
  meetings and chat lines as Markdown notes), 50 questions, 46 with a cited source. The paraphrased set has the same
  records (same sha256) and the same questions, 17 of them reworded so they share no phrase with the record; the
  reworded subset is chosen as `eval_embeddings.py:57` chooses it.
- Memo keeps one document per distinct text, so 560 notes that repeat another note's text have no row of their own:
  9,884 records can be enriched.
- Enrichment: gpt-4o-mini through cli-core's `enrichRecords` (the gateway, the prompt and the reply checks memo's
  sync uses), 20 records a request, 6 requests at once. The key is read from the keyring entry `openai/default` inside
  the script and given only to the enrichment process.

```sh
python3 enrich_bench.py --fixture ~/.cache/wirecat-bench/kg-fixture-v3 \
  --paraphrased ~/.cache/wirecat-bench/kg-fixture-v3-paraphrased --output <new dir> \
  --memo <memo built against the branch>/dist/bin/memo.js --core <cli-core checkout> --sample 0.1   # or --sample 1
```

The script ([enrich_bench.py](enrich_bench.py), loading and scoring copied from `memo_baseline.py`) loads the store
once, embeds it, asks both question sets with enrichment off, turns enrichment on with
`memo models consents set openai --model gpt-4o-mini --yes`, enriches the chosen records
([enrich_sample.mjs](enrich_sample.mjs)), embeds the new chunks with a plain `memo sync`, and asks the same questions
again. Off and on are the same store, the same model and the same questions; only the enrichment differs.

## Results

Recall of the cited record, question as typed, e5-small hybrid search (`memo search all`).

### Small run first: every cited record and 10% of the rest (1,048 records)

Run first, to find problems before paying for the whole set. It is optimistic: every record a question cites is
enriched, but only one in ten of the records competing with it.

| Questions | Off @1 / @5 / @10 | On @1 / @5 / @10 |
|---|---|---|
| all 46, record's words | 0.54 / 0.91 / 0.93 | 0.61 / 0.93 / 0.93 |
| all 46, other words | 0.39 / 0.73 / 0.79 | 0.44 / 0.79 / 0.86 |
| 17 reworded, other words | 0.20 / 0.50 / 0.62 | 0.20 / 0.62 / **0.79** |
| 17 reworded, other words, words joined by OR | 0.14 / 0.50 / 0.59 | 0.20 / 0.56 / 0.65 |

1,048 records enriched, none failed, 69,311 input and 68,523 output tokens, **$0.0515**, 130 s.

### The whole set (9,884 records)

The headline. 9,840 records enriched; 44 were left for the next sync (a batch the model answered wrongly, or a record
missing from a reply), 7 got no facts (small talk).

| Questions | Off @1 / @5 / @10 | On @1 / @5 / @10 |
|---|---|---|
| all 46, record's words | 0.54 / 0.91 / 0.93 | 0.48 / 0.92 / 0.93 |
| all 46, other words | 0.39 / 0.73 / 0.79 | 0.39 / 0.81 / **0.86** |
| 17 reworded, record's words | 0.59 / 0.99 / 1.00 | 0.47 / 0.99 / 1.00 |
| 17 reworded, other words | 0.20 / 0.50 / 0.62 | 0.25 / 0.68 / **0.79** |
| 17 reworded, other words, words joined by OR | 0.14 / 0.50 / 0.59 | 0.23 / 0.68 / 0.74 |

The whole set gives the same @10 as the small run (0.79 on reworded questions): the small run's bias did not show at
@10, only at @1 (below).

### Real cost

| Run | Records | Tokens in / out | Cost |
|---|---:|---|---:|
| smoke run, 300 records, 15 enriched | 15 | 1,011 / 816 | $0.0006 |
| memo sync with enrichment on, same 300-record store | 284 | 36,608 in all (split not reported) | about $0.014 |
| small run | 1,048 | 69,311 / 68,523 | $0.0515 |
| whole set | 9,840 | 1,299,046 in all | about $0.49 |

The `memo sync` check proves the path an owner gets: with the setting on and a key, one sync enriched the 284
records left and embedded 284 new chunks (171 notes, 113 mails). Memo's sync reply does not show the enrichment yet,
so its token split was not reported; the whole-set run lost its printed split to a failed sync (below). Both costs
are the stored token totals priced at the small run's split (50% input), at gpt-4o-mini's
[list price](https://developers.openai.com/api/docs/pricing) ($0.15 / $0.60 per million).

Scores and settings of both runs: [results-sample10.json](results-sample10.json), [results-full.json](results-full.json).

## What it showed

- The code works end to end: the consent command, the enrichment, the stems, the separate chunk, the citations
  (hits still name the record) and the sync path.
- With enrichment on, reworded questions find their record more often at @5 and @10. Memo without enrichment is
  already far better than the 0.131.47 the prototype measured (0.62 against 0.34 at @10), so the gain is smaller
  than the prototype's +0.22, and that is the honest result.
- On the reworded questions it is +0.17 at @10 (0.62 → 0.79) and +0.18 at @5; on all 46 in other words +0.07 at @10.
- The first place gets worse for questions in the record's own words: 0.54 → 0.48 on all 46 (0.59 → 0.47 on the 17).
  With every record enriched, records that only talk about the same project now share the question's words through
  the facts and questions the model wrote, and sometimes outrank the record itself. @5 and @10 stay the same. The
  small run did not show it, because there most competing records had no enrichment.
- Per record: 66 input tokens (41 of them the prompt's share) and 65 output tokens; cli-core's estimate uses 40 and 70.

## Not measured

- Real mail or notes: synthetic records only, in English, about 100 characters each. Long documents are sent by
  their first 4,000 characters.
- Claude Haiku 5.5 (supported, not run here), EmbeddingGemma, or memo's answers through an agent.
- Time for a large mailbox: each sync with enrichment on hashes every record to find the pending ones.
- One sync of the whole-set run exited 1 right after the 9,840 records were enriched (queued for indexing); the next
  sync on the same store succeeded and the run was resumed from the saved off replies (`--resume`). The error text was
  lost to the progress lines, which the script now filters out. Not reproduced.
