# Knowledge graph memory: results so far (2 November 2026)

This page has only the results and what they mean. How each test was set up and run is in the [README](README.md).
The method will move to its own page, `METHOD.md`.

## Why this was run

WireCat wants to be the place AI agents read a person's context from: messages, mail, notes and meetings. The
question is whether an agent answers better with WireCat than with what it already has: its own memory, or a hosted
memory service. The answer decides what to fix in WireCat first, and what the website may claim.

## The test in one paragraph

A script writes 2,000 invented records about 10 invented projects: 500 chat messages, 500 emails, 500 notes and
500 meeting passages. Most are filler. For each project a few records matter: the first chat message sets a delivery
date, a later email moves it, a note names the owner, and a meeting passage records a promise. There are 50
questions, five per project:

| Group | Example question | The right answer comes from |
|---|---|---|
| current date | What is the current confirmed delivery date for Amber Kite? | the email that moved the date |
| original date | What was the original delivery date, before it changed? | the first chat message |
| owner | Who is the confirmed delivery owner of Amber Kite? | the owner note |
| commitment | What did Ari Vale commit to delivering for Amber Kite? | the meeting passage |
| unknown budget | What approved budget amount was agreed for Amber Kite? | nothing: the right answer is "unknown" |

The data and the answer key are the same on every run, and a script scores the answers. No AI judges them.

## Test 1: does the search find the right record?

Here no AI writes an answer. Each question goes into the tool's own search, and we check where the one record that
holds the answer lands in the list. This test is free for Memo and OpenClaw, which run on this computer.

**How to read the numbers.** 40 questions have one right record. The 10 budget questions have none, so they are
left out. "Top 1" is the share of the 40 where the right record came **first**. "Top 5" means it was somewhere in
the first five. 1.00 means all 40, 0.25 means 10 of 40.

**"As typed"** means the question was sent exactly as a person would write it. **"Keywords"** means a script
dropped small words ("what", "is", "the") and sent the rest as "word OR word OR word". That is what a smart agent
does by itself, so it shows what the search can do with help.

| Search | Question as typed: top 1 | top 5 | top 10 | Keywords: top 1 | top 5 | top 10 | Time per search |
|---|---:|---:|---:|---:|---:|---:|---:|
| **Memo, word search** | 0.00 | 0.00 | 0.00 | 0.25 | 0.75 | **1.00** | 0.3 s |
| **Memo, word + meaning search** | 0.25 | 0.30 | 0.30 | 0.25 | 0.55 | 0.55 | 1.1 s |
| **OpenClaw's memory search** | 0.35 | **1.00** | 1.00 | 0.35 | 0.97 | 1.00 | 6 s (as a command) |
| **Supermemory** (best of two loads) | **0.47** | **1.00** | 1.00 | **0.50** | 1.00 | 1.00 | 0.5 s |
| **Mem0** | **0.47** | 0.95 | 0.95 | 0.45 | 0.95 | 0.95 | 0.9 s |

Supermemory and Mem0 times include the trip over the internet. OpenClaw's 6 s is mostly starting the program each
time; inside a running agent it is much faster.

### What Test 1 showed

- **Memo cannot search with a question typed as a sentence.** Its word search needs every word of the question in
  one record. No record contains "what", "is", "current" and the project name together, so all 50 searches came
  back empty. The same words as keywords found every right record in the top 10. Every competitor handles the
  sentence as typed.
- **Memo does not rank mail and notes together.** It takes turns: an email, a note, an email, a note. So a note
  can never come first while any email matches, and "top 1" can never pass 0.25.
- **Memo's meaning search never returns an email.** All 500 emails were processed for meaning search, but none
  came back. The cause is not known yet.
- **OpenClaw and the hosted services find every right record in the top 5, from the question as typed.**
- **Nobody puts the current answer first reliably.** For "current date" questions OpenClaw put the email with the
  new date third, after the old date. An agent that trusts the first result gives the old date.
- **Supermemory ranked the same data differently on two loads.** On the first load the email with the new date came
  4th or 5th. On the second load, of the same records, it came first in 10 of 10. The cause is not known.
- **Mem0 lost two date changes.** For two projects it processed the email that moved the date but kept no memory of
  it. It only holds the old date there, so an agent using Mem0 can only give the old date for those two.
- **Supermemory and Mem0 cannot tell the agent which record an answer came from.** Through Hermes, an agent sees
  only the remembered text, never the record's name. So they can never score on "correct with sources" below.

## Test 2: does the agent answer correctly?

Here an AI agent (OpenClaw 2026.10.9 or Hermes 0.21.0) answers all 50 questions with the same model, Claude Sonnet
5.5, one question per fresh session. It must give the answer and the names of the records it used.

**How to read the numbers.**

- **Correct**: the answer matches the key (for example 2026-12-11), out of 50. A leading "the", "a" or "an" is
  ignored, so "the accessibility review" counts. **Strict** is the same count without that allowance.
- **Correct with sources**: the answer is right **and** the agent named exactly the right records: no record
  missing, no extra one. This is the strict score. It matters because a user should be able to click through to
  the message that proves the answer.
- **Stale**: the agent gave the old date after it had changed. 0 is good.
- **Median time**: half the questions took less than this, from question to answer.
- **Cost**: what the 50 answers cost at Anthropic's list price ($2 per million input tokens, $10 per million output
  tokens, $0.20 per million re-read tokens).
- **Tokens per question**: how much text the model read and wrote for one question. This is what drives cost.

| Setup | Correct | Strict | Correct with sources | Stale | Median time | Cost for 50 | Tokens per question |
|---|---:|---:|---:|---:|---:|---:|---:|
| **OpenClaw alone**: the records as files, its own memory search | 50 | 50 | 34 | 0 | 27.5 s | $1.33 | 97,800 |
| **OpenClaw + WireCat**: the records in Memo, read through the memo command | 50 | 50 | **40** | 0 | 33.3 s | $2.35 | 113,400 |
| **Hermes alone**: the records as files, its file and shell tools | 50 | 40 | 37 | 0 | **8.5 s** | $0.88 | 29,300 |
| **Hermes + Supermemory**: the records only in Supermemory | 40 | 30 | 10 | 0 | 16.9 s | $3.34 | 50,700 |
| **Hermes + Mem0**: the records only in Mem0 | 48 | 38 | 10 | **2** | 11.4 s | **$0.78** | **14,800** |
| Hermes + WireCat | waits for memo's search fixes | | | | | | |

Hermes's costs are computed from the tokens it reports, at the same list price (cache writes at $2.50 per million);
Hermes itself reports the cost as unknown. Hermes + Supermemory and + Mem0 can score "correct with sources" only on
the 10 budget questions, where the right answer names nothing: their tools never show the agent a record's name, so
the agent cited memory ids instead.

**What went wrong with Hermes:**

- **Hermes alone** wrote "the accessibility review" for all 10 commitment questions (strict 40). For the original
  date it also named the email that moved the date, like OpenClaw.
- **Hermes + Supermemory** answered "unknown" to all 10 "original date" questions. It probably sees only the latest
  date: its search returns memories, which hold the current state, and the raw text pieces reach the agent empty.
  This explanation is an inference from Hermes's provider code, not checked request by request.
- **Hermes + Mem0** gave the old date for two projects (q11 Cedar Lantern, q16 Dune Harbor). Mem0 never kept the
  emails that moved those dates, as Test 1 found. Every other answer was right.

The first Hermes alone run (2 November) was thrown away: Hermes's tools started outside the records folder, and on 9
questions the agent searched the whole disk. The runner was fixed and the run repeated.

**Where OpenClaw lost source points**, by question group (10 questions each, exact sources):

| Group | OpenClaw alone | OpenClaw + WireCat | What went wrong |
|---|---:|---:|---|
| current date | 10 | 10 | |
| original date | 0 | 0 | Both named the right chat message **and** the email that later moved the date. The answer was right; the extra source fails the strict score. |
| owner | 10 | 10 | |
| commitment | 4 | **10** | Alone, the agent 6 times named a note that mentions the promise instead of the meeting where it was made. With WireCat it named the meeting every time. |
| unknown budget | 10 | 10 | Both said "unknown" and named nothing. |

### What Test 2 showed

- **On 2,000 short records a strong model answers everything, with or without WireCat.** Both setups got 50 of 50
  right and never gave an old date. This data is too small and too easy to show the value of a context layer.
- **WireCat's advantage is exact sources.** It named the meeting itself, not a note about the meeting: 40 exact
  against 34.
- **WireCat's cost is real.** About 1.8 times the price ($0.047 against $0.027 per question), 16 % more tokens and
  20 % more time. The agent reads memo's whole instruction file for every question, and memo's replies are long.
- **Hermes alone is the cheapest and fastest strong setup here**: every answer right, 3 times faster and a third
  cheaper than OpenClaw alone, with almost as many exact sources as OpenClaw + WireCat (37 against 40).
- **Hosted memory alone loses information an agent needs.** With Supermemory the agent could not find the original
  dates. With Mem0 it gave two old dates. Neither can show where an answer came from. Plain files did better on
  every count.
- **The agent did well with Memo only because it rewrote the questions into keywords itself.** Test 1 shows that
  Memo's search fails on the question as typed. A weaker model, or a user typing into a search box, would not get
  that help.

## Strong and weak, per option

| Option | Strong at | Weak at |
|---|---|---|
| **WireCat (Memo)** | Exact sources: it names the precise message, email or meeting. Runs on this computer, free, fast (0.3 s per search). Keeps the record's real date and kind. | A question typed as a sentence finds nothing. Mail and notes take turns instead of being ranked. Meaning search never returns mail. `search all` skips meetings. Costs an agent more tokens and time. |
| **OpenClaw alone** (files + its own memory search) | Finds every record from the question as typed. Cheapest and fastest agent here. Needs nothing installed beyond the agent. | Puts the old date ahead of the new one. Names a related note instead of the original meeting. Only plain files: no idea which record is an email or a chat. |
| **Supermemory** | Best first-place rate (up to 0.50). Every record in the top 5 from the question as typed. | Ranked the same data differently on two loads. Its search through Hermes hides the record name, so no exact sources. Data leaves the computer. Building its memories took hours. |
| **Mem0** | Good first-place rate (0.47). One short fact per record matches questions well. | Lost two of ten date changes and kept the old date. No record name reaches the agent. No date field. After 90 minutes it had processed only 716 of 2,000 records. Data leaves the computer. |
| **Hermes alone** | Every answer right, the fastest (8.5 s) and among the cheapest. Good exact sources (37). | Adds "the" to answers. Names an extra source for original dates. Needed a workaround to use a Console API key (fixed upstream in 0.22.6). |
| **Hermes + Supermemory** | Never gave an old date. | Could not find any original date (10 unknown). No sources. The most expensive setup ($3.34). |
| **Hermes + Mem0** | Cheapest and fewest tokens. 48 of 50 right. | Gave two old dates, because Mem0 dropped the emails that changed them. No sources. |

## What this means for WireCat

1. Fix Memo's search before any more paid runs: questions as typed, one ranked list across sources, meaning search
   for mail, meetings in `search all`. Then make it cheaper for agents. The plan is in cli-private,
   `plans/2026-11-02-memo-benchmark-fixes.md`.
2. Run Test 1 and the OpenClaw + WireCat answers again after the fixes.
3. Then run a large test with about 100,000 records over several years, with look-alike people and projects. That
   is where plain files should start to fail, and where a context layer either earns its place or does not.

## What was not measured

- Hermes + WireCat: it waits for memo's search fixes, so it measures the fixed memo.
- Hindsight (not installed).
- Real data. Everything here is invented, and the records are one line each.
- More than one answer run per setup. AI answers vary between runs; one run of 50 questions can move by a few points.
- How each tool does with weaker or local models.

## Run records

| Run | Date | Versions | Raw output |
|---|---|---|---|
| Memo search | 2026-11-02 | `@wirecat/cli-memo` 0.131.13, e5-small | not committed yet |
| OpenClaw search | 2026-11-02 | OpenClaw 2026.10.9 | not committed yet |
| Supermemory search, two loads | 2026-11-02 | v3/v4 API | not committed yet |
| Mem0 search | 2026-11-02 | v3 API | not committed yet |
| OpenClaw alone, Sonnet, 50 questions | 2026-11-02 | OpenClaw 2026.10.9, claude-sonnet-5-5 | not committed yet |
| OpenClaw + WireCat, Sonnet, 50 questions | 2026-11-02 | OpenClaw 2026.10.9, memo 0.131.13, claude-sonnet-5-5 | not committed yet; a restart cut it after question 21, questions 22–50 ran again and the two halves were joined by hand |
| Hermes alone, + Supermemory, + Mem0, Sonnet, 50 questions each | 2026-11-03 | Hermes 0.21.0 with the runner's API-key workaround, claude-sonnet-5-5 | not committed yet |
