# Question-level search pilot: lexical discovery and local embeddings

The owner pointed out that name/alias gathering omitted semantic search and that a known project chat
held much more context. This experiment asks whether six concrete questions find supporting evidence,
what ranks above the answers, and what preparation/cost the semantic path needs. It informs source
coverage, index readiness and answer-focused ranking. It is a small diagnostic, not independent accuracy.

## Source coverage and index preparation

The selected project chat held 199 messages in total, 130 within the retained 60-day window. The earlier
project name/key run returned 6 of those 130 directly. Adding names/contact returned 8 directly and 34
including nearby context:4.62%, 6.15% and 26.15% of stored chat messages respectively. These are **local
chat-message coverage fractions, not semantic recall**: not every chat message is a relevant answer.
A known project chat must be a source in its own right; name matching cannot recover every unnamed reply.

The newest stored message was 7 October, but chat metadata showed activity on 19 October. Another related
chat had metadata but no stored history. Two bounded sync attempts, one on installed MAX 0.62.0 and one
on released 0.66.0, failed with authentication_error/auth.failed. Each emitted one client request and
response trace event. These count attempted client operations, not independently observed network frames.
No newer messages were imported; the second chat's import was not reached. Remote completeness remains unknown.

The first conversation search returned nothing and explicitly reported a missing conversation build.
An already downloaded multilingual-e5-small model was available. Local preparation on installed 0.62:

| Operation | Reported result | CLI wall time |
| --- | --- | ---: |
| Build selected chat |199 messages, 117 links, 96 conversations; rules version 5 |903.07 ms |
| Embed with local E5, 2 threads |128 embedded operations, 0 skipped |7004.35 ms |
| Later index status, also checked on 0.66 |120 current conversation chunks, 0 missing/stale |Not included above |

Do not report 128 as the current conversation-chunk count. The embedding implementation also processes
image-context chunks; this may explain the extra operations, but the image-row count was not separately
measured. Built-in image descriptions use message context, not verified image pixels. Index readiness
is not provider freshness: a ready index can still cover an archive missing recent messages.

## Main comparison

The main comparison used an isolated registry installation of MAX 0.66.0/Core 0.370.0/Base 0.47.0, Node 24.19.0,
Linux x 64, the same chat/window and k=5. The retained package lock reproduces the installation. Existing
models were reused, with no model download or external embedding service. The earlier 0.62 and Memo 0.85
observations remain private historical artifacts, not relabeled as 0.66 measurements.

Questions and anchor refs were declared before the compared runs, using previously seen material.
They cover several project tasks; exact needs and evidence identities remain private. These are **known-answer diagnostic questions**, not a
blind held-out sample. Keyword queries are manually curated. Literal-question means strict word
conjunction with the ordinary query language; it is not a claim that the `--exact` flag was used.

| Method | Supported answer found@5 | Supported-answer MRR | Direct-support precision@5 | Search commands | Search wall time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Strict whole-question words |0/6 |0.0000 |0.0% |6 |2509.31 ms |
| Curated word queries |4/6 |0.5833 |20.0% |6 |2241.73 ms |
| Native lexical discovery |5/6 |0.5056 |26.67% |6 |2632.15 ms |
| Hybrid local E5 conversations |6/6 |0.6167 |23.33% |6 |7694.34 ms |

Meaning search additionally expanded 16 distinct conversations in 16 CLI reads, 5784.91 ms. Expansion was
cached across questions:30 result slots did not cause 30 expansion calls. Preparation adds 7907.42 ms once
for this build/embed observation. Search timing excludes that cost, corpus counting, agent reading and
labeling. The main comparison has 24 search commands plus 16 expansion commands, 40 measured CLI calls.
The 18 lexical/discovery commands total 7383.19 ms; hybrid search/expansion totals 13479.25 ms.

All 30 hybrid result slots explicitly report a meaning contribution, with 0 stale hits. This is the
existing hybrid algorithm, not an isolated vector-only experiment. Message excerpts and conversation
chunks differ in size: curated queries returned 9284 excerpt bytes; discovery 10044; hybrid 67917 chunk
bytes across the six questions. Some chunks contain several messages or a long single message. A fixed
k does not establish equal context/token budget or an embedding-only causal benefit.

## How scores were judged

One unblinded agent graded each returned question/result pair:

- **2:** directly supports an answer to that question, preserving uncertainty/reporting status.
- **1:** related context, question, plan, weak snippet or partial support.
- **0:** off-question, even when it concerns the same project.

Precision@5 is grade 2 slots /30 possible slots; empty slots contribute no support. Answer-found@5 is
questions with at least one grade 2 result /6. MRR averages 1/rank of the first grade 2 result, with 0 for
no supporting result. These are **provisional assessor metrics**, not independent human ground truth.
The retrieval tool did not generate answers whose factual correctness was scored.

This stricter question-specific rubric differs from the earlier broad orientation review. A document
can help orient on a project and still fail to answer the particular question. The returned slots are
correlated and repeat sources across questions; they are not independent labeled documents.

## What the failures show

Questions, plans and generic advice can rank above direct support even when they concern the correct
project. A confirmation can require a native reply pair. Exact-anchor grading can miss equivalent
support under another reference. One diagnostic premise also needed qualification rather than acceptance
as fact. Exact cases, labels, source texts and per-question outcomes stay private.

Aggregate known-anchor scores therefore differ from judged support. Curated words, discovery and E5
each hit a preselected anchor for 5/6 questions. Their anchor MRRs are 0.7500, 0.3667, 0.4500. These figures
should not replace the main support metrics: some anchors are only partial evidence and other references
can answer the question. Corpus-wide recall and nDCG are still not established.

## Reproduction

Private inputs are named in `2026-10-21-project-semantic-pilot.md`: question cases, MAX 0.66 lexical/meaning
results, graded labels, corpus census, index/import proofs, exact executed helpers and installation lock.
No source body is committed. The live helpers print source excerpts for in-memory review; **do not
redirect their stdout to a file**. Their output files retain refs/hashes/costs, not bodies.

Offline scoring, with temporary state, launches no application or database:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T XDG_CONFIG_HOME=$T/c XDG_CACHE_HOME=$T/k MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/s TMPDIR=$T node performance/projects/gathering-audit/score-questions.mjs /PRIVATE/case.json /PRIVATE/lexical.json /PRIVATE/meaning.json /PRIVATE/judgments.json
```

Compare parsed JSON with [question-totals.json](question-totals.json). Scoring refuses changed references
or passage hashes before reusing labels. The reported chat census uses three bounded date-range queries
and exact de-duplication; its script refuses an over-budget or unresolvable dense timestamp interval.

To prepare/query a selected existing archive, supply the owner's explicit profile and chat:

```sh
max PROFILE conversations build --chat=CHAT --offline --json
max PROFILE conversations embed --chat=CHAT --provider local --model e5-small --threads 2 --max-chunks 300 --offline --json
max PROFILE search messages 'QUESTION chat:"CHAT"' --discover --backend archive --offline --limit 5 --json
max PROFILE search conversations 'QUESTION' --chat=CHAT --provider local --model e5-small --offline --limit 5 --json
max PROFILE conversations show CONVERSATION_ID --offline --json
```

These live commands intentionally use the selected real HOME; use fresh TMPDIR and new private output
paths as the helper recipes show. Building/embedding changes only local conversation/vector indexes.
Raw-message deletion, rebuilding a project, new knowledge links or accepted tasks are unnecessary here.
The full fixed time filter and exact command args are retained privately.

## Improving gathering and its evaluation

For gathering: discover explicit project chats and source freshness first; prepare bounded local indexes;
combine lexical discovery with semantic candidates; expand replies/sections; rerank for answer support
and dated authority; stage typed knowledge with evidence. Reuse provider-neutral Core services and thin
hosts rather than create a separate MAX/Zoom retrieval engine. Preserve raw retrieval scores and source
roles so a question or old plan cannot silently become an accepted fact.

For evaluation: add held-out questions and hard negatives, multiple acceptable evidence sets, a second
independent assessor, fixed byte/token budgets, randomized/repeated method order and complete stage-cost
traces. Measure source completeness, answer support, citations, owner corrections and stale/duplicate
writes separately. This pilot gives executable numbers and concrete failures; six familiar questions
cannot establish broad quality, true archive recall or production tail latency.

A targeted cheaper expansion also worked: after discovery, one bounded `messages context MESSAGE_REF
--thread` read returned the approval request and its affirmative native reply in 542.04 ms. Combining
`search messages --discover --thread` directly on 0.66 instead refused with “internal combined evaluation
does not hydrate threads”. The separate context command is a working route; the combined flags need
source verification and either a shared hydration fix or an explicit supported conflict/next step.
This was one selected case, not a fifth full-method quality score.

Of E5's 30 result slots, 7 directly supported the question, 10 were related context and 13 were off-question.
The corresponding counts were 6/12/8 plus 4 empty slots for curated words, and 8/13/9 for discovery.
This is why “not direct support” should not all be called false positives: some background is useful,
but the off-question slots are a concrete target for better support ordering. All judgments remain provisional.
