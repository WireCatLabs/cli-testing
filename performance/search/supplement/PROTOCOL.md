# Supplement validation protocol

Test whether two model selections improve evidence delivery without losing evidence already in
baseline positions 11–12. This fixture has 24 new questions with 64 competing agenda headings
per scenario. It includes proposals, obsolete decisions, unresolved conflicts, missing facts,
parent-dependent replies, long evidence and Russian fallback controls.

Fixture SHA-256 before any retrieval or scoring:
`c4649d96e8b7273cb7dbe8651791c7b5f85cdca4d5b177860117206960ffefc4`.
The same agent authored the questions and judgments. This is a frozen synthetic stress test,
not independent human certification or a representative production accuracy estimate.

Use published SDK 0.229.0 discovery to collect at most 300 candidates. Score the first 100 with
pinned MiniLM-L6, eligible same-chat parent context, batch size 1 and four CPU threads. Reuse
verified model assets; no labels enter inference. Preserve the original order for Russian.

Compare baseline twelve with baseline ten plus two distinct model selections. Evaluate actual
Answer@12, evidence recall and graded nDCG@12; inspect per-query losses, not only averages.
Also compare identical 4,096, 8,192 and 16,384-byte evidence budgets. Encode ordered records as
compact UTF-8 JSON containing message id and complete body text. Stop before the first record
that would exceed the budget; do not clip or skip bodies. Count brackets and commas. This is an
explicit evidence-payload simulation, not the CLI's actual response schema or token budget.
Record delivered counts and bytes. Protecting ten positions does not protect their byte budget.

Before integration require no per-query loss of an actual answer, supporting/conflicting evidence
or nDCG, at twelve results and each byte budget. No thresholds or policy changes based on this
fixture may be presented as independently validated. Report failures and retain the default
model-free path if the gates fail. Missing facts measure partial hits, not safe abstention.

The first attempted inference aborted on a pair exceeding the model's 512-token capacity. No
scores were produced. An explicit follow-up excludes overlength pairs from the original top-100
shortlist before inference and records their ids and tokenizer hash. It never truncates text,
expands beyond rank 100 or removes long messages from baseline results. This recovery was added
after the runtime failure, before viewing any neural scores. Long answers outside the baseline
cannot be recovered by this variant; that limitation is part of the evaluation.

The broad fixture delivered every twelve-result payload under 4 KiB and had no relevant item
at baseline ranks 11–12. It cannot settle either boundary. A second, deliberately adversarial
fixture varies the number of copied headings around the known log-retention failure pattern.
It adds conflicting records and a genuine terse-reply probe. Its SHA-256 is
`ce1170132d7d6295f2f940953eef68f5872b1985bcfddafe45cf522ef28a113b`.
Freeze labels before this run and add 512- and 1,024-byte diagnostics to force tighter delivery.
This is a targeted regression test inspired by exposed failures, not an untouched quality set.

The boundary run exposed an answer/support swap at positions 11–12: the model's order slightly
reduced graded nDCG even though both messages remained present. After inspecting that failure,
compare an exploratory stable merge: choose the same two messages using neural scores, then
place those two in their original baseline order. Selection, inference work and result count
stay the same. Recheck both fixtures and all three older controls. This change uses the observed
failure; passing those controls is regression evidence, not independent validation.
