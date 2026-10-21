# Audit project gathering beyond its hit count

The owner could not assess the earlier gathering from “80 → 115 references.” This audit asks what
was collected, what work the tools performed, what interpretation remains, and how the next experiment
can measure quality. It informs passage expansion, source coverage and evaluation priorities. It adds
no production retrieval algorithm and makes no full-project backup/reset claim.

## What the measured run actually did

Registry Memo 0.84.0, Core 0.377.0, Base 0.47.4, Linux x64, Node 24.19.0. Two requests against one
existing second project: stored name/key, then three explicit alternative names and one existing person.
A fixed 60-day window, all 14 resolved local sources, 100 items/96 reader calls per invocation and
four-invocation cap. Each request ran against the existing index, default catch-up, then default repeat.

This is local archive retrieval, not downloading every Telegram conversation, fetching Drive documents
from Google or requesting Zoom recordings. Catch-up indexes already stored mail/documents. The caller
requested no provider fetch command. Provider HTTP calls were not traced, so a measured HTTP count is
**unknown**, not a fabricated zero. The app made no model-completion request; the analyzing agent's
model use and token cost were not instrumented.

| Metric | Name/key | Names + contact |
| --- | ---: | ---: |
| Unique direct refs per phase | 80 | 115 |
| Documents | 70 | 100 |
| Messages | 10 | 15 |
| Message split: MAX / Telegram | 7 / 3 | 9 / 6 |
| Meeting cues / mail | 0 / 0 | 0 / 0 |
| Nearby refs | 64 | 144 |
| Nearby-only refs | 0 | 52 |
| Combined direct + nearby refs | 80 | 167 |
| Evidence CLI calls per phase | 2 | 4 |
| Local reader calls per phase | 88 | 232 |
| First phase evidence wall time | 2,220.24 ms | 3,623.69 ms |
| Truncated direct excerpts | 76/80 (95%) | 107/115 (93.04%) |
| Hits with nearby-context budget issues | 11 | 3 |
| Oversized refs excluded | 4 | 6 |
| Distinct direct excerpt hashes | 79 | 113 |

All three phases within each request return identical reference/excerpt-hash sets and zero duplicate
references. Distinct references can still have identical snippets: these are not proven duplicate
source documents. Every lane ends, but archive completeness is explicitly unknown; internal notes are
unread. Oversized exclusions are not silently counted as relevant or irrelevant.

Across both three-phase tests: **18 evidence CLI calls, four context CLI reads, 960 local reader calls,
17,448.10 ms evidence-command wall time**. The two whole-run intervals total **20,264 ms**, including
context reads and runner overhead. At least five extra owner-archive CLI calls for discovery/manual
reading are reconstructable from the previous session: at least 27 in total, not a fully instrumented
end-to-end count. Installation, research, agent reasoning and report-writing time are outside these timers.
These few successive runs without cold-cache control do not support production p95 or cold-cache performance claims.

The expanded request retains all 80 original refs and adds 35: +43.75% candidate count, **not** +43.75%
recall. Thirty common refs have different excerpt hashes because a different lane can select another
passage; repeated-request stability is not cross-request passage identity. One first-emission
person-only label becomes project context after merging later `matched_again` lanes. Aggregate consumers
must merge lane updates before treating first-emission context labels as final. This corrects the earlier
114 project/1 person-only interpretation: all 115 have a project lane after reconciliation.

## What was gathered and what was not

The private reader review found project requirements, dated implementation journals, contractor
communications, content/SEO plans and financial-table candidates. It did not create or verify current
facts, attendee identities, commitments, owners, deadlines or numbered tasks. More documents does not
mean more independently corroborating evidence: copied versions and mirrored documents need provenance.

A document warning about copied material was a useful retrieval result, but would be dangerous input
to automatic destination-project membership. A mixed-topic workbook was relevant in one sheet despite
an unrelated first sheet. Conflicting specification versions were both useful; search did not choose
which represented the present agreement. Dates on imported documents need separate interpretation:
a recently updated/imported document can discuss old events.

A new bounded review replayed the expanded request in **four calls, 4,138.92 ms**. The same 115 refs
returned; 36 selected evidence fingerprints/excerpt hashes matched the retained run. Sampling used all
15 messages, ten deterministic hash-selected baseline documents, ten added documents and one context-label
diagnostic. A single agent judged visible material; there was no independent human assessor.

| Provisional review grade | Count |
| --- | ---: |
| Directly useful for project orientation | 30 |
| Contextual mention/template/warning or weak excerpt | 6 |
| Visibly unrelated | 0 |
| Candidates not reviewed | 79 |

These are descriptive judgments of a stratified sample plus a diagnostic. They are **not 100% accuracy**,
a calibrated population precision estimate, a false-positive guarantee or a recall score. Grade 1 is not
necessarily a retrieval error. There is no relevant-item denominator, independent gold set, full-document
annotation or accepted-fact comparison. Five separate `notes show` calls recovered obscured sample output
and checked a workbook section; their time is not included in the four-call replay timer.

## Reproduce the arithmetic without opening an archive

The actual executed metadata-only analyzers and aggregate outputs are retained here:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T XDG_CONFIG_HOME=$T/c XDG_CACHE_HOME=$T/k MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/s TMPDIR=$T node performance/projects/gathering-audit/analyze.mjs /PRIVATE/baseline.json /PRIVATE/expanded.json
```

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T XDG_CONFIG_HOME=$T/c XDG_CACHE_HOME=$T/k MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/s TMPDIR=$T node performance/projects/gathering-audit/score-judgments.mjs /PRIVATE/sample-observation.json /PRIVATE/judgments.json
```

Compare parsed stdout JSON with [result.json](result.json) and [sample-totals.json](sample-totals.json).
The analyzers launch no CLI and read no database. Public outputs allowlist aggregate counts and hashes;
private cases, queries, references, judgments and derived descriptions remain in cli-private. See
private report `2026-10-21-gathering-detailed-audit.md` for exact inputs and file hashes.

Rehydrate the selected sample only with explicit owner-archive opt-in and the installed release:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=/SELECTED/OWNER/HOME TMPDIR=$T node performance/projects/gathering-audit/sample-local.mjs --live-local /PRIVATE/baseline.json /PRIVATE/expanded.json /PRIVATE/new-observation.json /ABSOLUTE/installed/memo
```

Source excerpts print for in-memory agent review; **do not redirect stdout into a file**. The output
file contains metadata/hashes, never bodies. Existing output is refused before archive reads. A new
sample run can drift: refuse to reuse judgments when evidence fingerprints or excerpt hashes change.
The fixed hash sample is reproducible; it is not a cryptographically random population sample.

The original-run cutoff was about 1–2 minutes after each runner started. Repeats happened before that
cutoff, so the date filter did not freeze concurrent writes. Future protocols choose a past cutoff and
record source freshness. No database deletion was needed to recover these metrics; deleting indexed or
annotation data would destroy the baseline rather than add missing relevance labels.

## Most useful improvements

1. Reconcile continuation lanes in reports and downstream consumers; first-emission labels can be provisional.
2. Expand the relevant document passage/sheet with bounded budgets and preserve warnings/version dates.
3. Handle oversized documents explicitly: enumerate exclusions, allow targeted bounded passage reads and
   measure recovery. Excluding a large relevant document can dominate answer quality despite fast pagination.
4. Add a frozen private judgment pool across multiple retrieval approaches and domain questions. Separate
   useful orientation, current-state facts, membership and tasks; they require different labels.
5. Instrument provider HTTP, CLI child commands, local reader calls, passage expansion, model calls and
   review effort separately. Avoid replacing a useful latency/quality breakdown with one hit count.

[Industry methods and proposed repeatable protocol](METHOD.md) defines the next experiment, metrics,
annotation rubric, instrumented trace and release gates. It is a protocol, not a claim that the proposed
hybrid/reranking/extraction experiments have already run.

The exact executed sample source is retained privately as
`tools/context-gathering/sample-pmed-executed-2026-10-21.mjs`; its SHA-256 matches the observation.
The public copy has repository formatting and uses stdout writes instead of console logging.
Offline analyzer guards can be reproduced with temporary state and `node performance/projects/gathering-audit/check.mjs`.

## New experiment: individual hint contributions

Six one-phase variants used a separate installed registry copy of Memo 0.84.0/Core 0.377.0, fixed past
cutoff, identical local source scope/budgets and no index catch-up. Seeded execution order was 2,5,0,1,3,4.
The global installation had concurrently changed to 0.85.0; a version guard refused it before archive
access, so it was left intact. The isolated 0.84 install has a retained dependency lock and matching
before/after entry hashes. This is one round, not a randomized repeated latency trial.

| Variant | Candidates | Added to baseline | CLI calls | Local reader calls | Wall ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0: name/key | 80 | 0 | 2 | 88 | 1760.24 |
| 1: add alternative name A | 84 | 4 | 2 | 112 | 1810.55 |
| 2: add alternative name B | 88 | 8 | 3 | 131 | 2732.51 |
| 3: add alternative name C | 108 | 28 | 3 | 143 | 2638.09 |
| 4: add existing person | 80 | 0 | 2 | 104 | 1807.91 |
| 5: all hints | 115 | 35 | 4 | 232 | 3463.69 |

All variants finish pagination and retain all 80 baseline refs. No retrieved source fingerprint changes
between variants. The alternative names contribute differently; the person adds no new reference
on this case while still adding local reads. That does not imply contacts are useless on other projects.
Candidate contributions overlap, so 4+8+28 must not be called 40 distinct added items. Relevance/recall
and incremental useful-evidence cost need independent labels, not these counts alone.

The 16 evidence commands took 14212.99 ms, with 810 local reader calls. Combined with the original run
and the sample replay, there are 38 measured evidence commands taking 35800.01 ms, plus four original
context reads: 42 measured child CLI calls. At least ten additional manual/discovery archive calls are
known across the two sessions. None of these timings measures the agent's active reasoning time.

Run `ablate-local.mjs --live-local PRIVATE_CASE NEW_PRIVATE_OUTPUT ABSOLUTE_INSTALLED_MEMO` with
explicit real HOME and fresh TMPDIR to repeat. Public `ablation-totals.mjs PRIVATE_OUTPUT` reproduces
[ablation-totals.json](ablation-totals.json) offline. Private case maps anonymous variant names to
actual hints. No source bodies are saved; the exact executed script and npm installation lock are private.

## Historical first-project context

The earlier first-project observation on Memo 0.81.0/Core 0.370.0 is a different request/archive/window,
not a control against the newer second-project result. It returned 93 direct refs: 41 messages,
51 documents and one meeting cue, with 170 combined refs. Three evidence commands took 3214.68 ms
in total; two additional project-context commands were inside a 4104 ms runner interval. Sixty-six
of 93 direct excerpts were truncated, no oversized refs or nearby-budget issues were reported, and
internal notes remained unread. Its source-import/manual reading effort was outside the timer.

[Historical aggregate audit](first-project081-audit.json) is reproduced with `analyze.mjs` using the
same retained private first-project v6 result for both input arguments and selecting stdout's `baseline`
object. No cross-request comparison is inferred. This makes existing exclusions/passage metrics
visible without relabeling the old run as a current-version result. The 42-command total above concerns
the second-project workflow and follow-ups, not every historical source import or test in this session.

To recreate the isolated released installation from the retained private manifest/lock, copy them to
new paths named `package.json` and `package-lock.json`, then run:

```sh
task_lab=$(mktemp -d -p /var/tmp memo084-lab-XXXXXX)
cp /PRIVATE/manifest.json "$task_lab/package.json"
cp /PRIVATE/lock.json "$task_lab/package-lock.json"
T=$(mktemp -d -p /var/tmp) && HOME=$T XDG_CONFIG_HOME=$T/c XDG_CACHE_HOME=$T/k MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/s NPM_CONFIG_USERCONFIG=/dev/null npm ci --prefix "$task_lab" --ignore-scripts --no-audit --no-fund
```

Use `$task_lab/node_modules/.bin/memo` as the explicit binary path in the live runner. The install
itself has temporary state and opens no owner archive. The subsequent live command intentionally uses
selected real HOME. Prefer `npm ci` to resolving the dependency graph again with `npm install`.

[Question-level semantic pilot](QUESTION-PILOT.md): lexical discovery versus actual local E5, support/ranking scores and source/index gaps.
