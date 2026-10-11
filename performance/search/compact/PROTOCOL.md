# Compact reranking protocol

Compare frozen pretrained text-pair rankers with discovery's existing order. The goal is to move
actual answers earlier while retaining useful supporting and contradictory evidence.

The three existing, exposed synthetic sets provide regression controls: original templates,
fresh scenarios and the permission-question fixture. No training, score floor or label feature
enters inference. This is development evidence, not a new blind or human-judged evaluation.

Fixed runs use TinyBERT and MiniLM-L6 at the revisions/checksums already pinned in the matrix;
body-only or eligible parent-plus-reply text; one pair at a time or batches of 16; and the first
100 or all 300 candidates. The eight original ranking misses sit at rank 62, so a top-40 cascade
would exclude them before inference.

Compare raw neural order and equal reciprocal rank fusion (k=60). English-only application keeps
Russian results in their original order; all-language results are diagnostics, not a multilingual
support claim. Record Answer@1/3/10 and MRR on actual-answer questions; evidence recall and nDCG
also include useful support/conflicts. Report missing-fact partial hits separately from answerability.

A candidate must avoid regressions across all three controls in answer success, MRR, evidence
recall and nDCG before production integration. Runtime measurements cover native model-worker
loading, CPU scoring, disk assets and whole-worker RSS. They exclude the CLI process; do not
present worker memory as the whole application's RAM. No default model download is authorized
by a promising benchmark alone.

After the initial scores exposed lost supporting evidence, add one exploratory merge: preserve
baseline positions 1–3, then fill from neural order without duplicates. This was added after
inspection; do not call it a predeclared or independent holdout result. It adds no model inference
or tuned numerical weights. It must pass the same regression gates before further validation.

Also explore evidence packaging separately from replacement ranking: retain the baseline ten
and add two distinct model-selected messages within a 12-result budget. Compare Answer@12 and
Evidence Recall@12 against the baseline twelve. Preserving ten by construction is not proof of
better top-ten ordering; this is a separate, explicitly exploratory output design.
