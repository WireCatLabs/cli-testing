# Project review: what an agent reads and decides

Measured 2026-10-19 for [cli-memo #340](https://github.com/WireCatLabs/cli-memo/pull/340) (`memo projects actions`)
and [cli-core #1660](https://github.com/WireCatLabs/cli-core/pull/1660) (evidence findings).

## Why we ran it

The owner wants an agent to stage cited facts, follow-ups and key documents for a project, and to decide by itself
what it is confident about, with a reason and asking him about the rest (owner's choices NEED-1554 and NEED-1557,
2026-10-19). He also asked for context by default: the text around each cited message, so the agent can decide
without opening every source. This measures what that review costs in output, whether a text that changed after it
was cited is caught, and whether decisions are recorded with who made them and why.

## Setup

- AMD Ryzen AI 9 HX 470, Linux 7.0, Node v24.19.0. memo built from `main` at `437108d` (version 0.77.0, unpublished
  at the time), on `@wirecat/cli-core` 0.363.0. Store in a fresh temporary folder.
- The synthetic store of [the evidence baseline](../evidence/README.md), now in [`fixture.ts`](../fixture.ts) and shared
  by both measurements.
- [`review.ts`](review.ts):
  1. runs `projects evidence` and stages, as an agent (`AI_AGENT` set), one batch of 6 cited facts — 4 the baseline
     labels relevant and 2 wrong on purpose (the TV cable and the shop newsletter) — and one suggested key document;
  2. reads `projects actions list` with context and with `--brief`;
  3. edits one cited message, reads the list again and tries to confirm;
  4. restages from fresh evidence and lets the agent decide with a reason; tries the stale first batch again.
- Run from this folder: `node review.ts <cli-memo checkout with dist/ and node_modules/>`. Output:
  [`result.json`](result.json).

## Results

| What | Value |
|---|---:|
| Review list, with context (2 items: 1 key document, 1 batch of 6) | 4,093 bytes |
| Same, `--brief` | 1,937 bytes |
| Per staged finding, with context / brief | 682 / 323 bytes |
| Neighbouring messages shown | 13 |

- After one cited message was edited, the list marked exactly that finding `changed` and the other five
  `unchanged`; confirming the batch refused as `evidence-findings.stale`.
- An agent confirming without `--reason` was refused. With a reason, the decision was recorded as the agent's for the
  owner, with the reason (`decided_by: { bot: "synthetic-reviewer", reason: … }`).
- Restaged from fresh evidence, the agent accepted the 4 relevant findings and rejected the 2 wrong ones in one call;
  the receipt keeps its reason.
- **The stale first batch could not be closed at all** — not even rejected by the owner — so it stayed in every list
  of open proposals. Fixed in [cli-core #1664](https://github.com/WireCatLabs/cli-core/pull/1664): rejecting creates
  nothing and no longer needs current evidence.

## What it showed

1. **Context roughly doubles what a review reads** (682 against 323 bytes a finding): about 360 bytes buys the cited
   text and two messages either side. For a batch of 16 findings that is about 11 KB, small next to reading the
   sources, which the manual run of 2026-10-18 did by hand.
2. **A change in one cited text makes the whole batch stale.** The agent restages all six to decide one changed one.
   That is correct for accepting — nothing is created from a text nobody re-read — but it costs a round trip.
3. **Rejecting must not depend on fresh evidence.** It did, and a stale batch would have stayed open forever.

## What was not measured

- How well an agent extracts findings: the 6 findings here are written by the script, not by a model.
- Whether 2 messages of context are enough to judge a finding; no reader judged it.
- Mail and document context in the list (this run cites messages, one mail and a key document).
- Any real project or account.
