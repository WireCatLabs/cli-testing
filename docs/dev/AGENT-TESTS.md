# Testing agents on real data

How to test an AI agent that answers from the owner's messages, mail or notes, with WireCat or with a rival. Read it
before you design such a test, and check the list again before you score one.

## Why this page exists

Experiment B ([source-coverage](../../performance/agents/source-coverage/README.md), 2026-11-12..13) compared WireCat,
a Telegram MCP server and a plain Telegram export on one real account. Its first two rounds concluded "a plain export
read with grep answers as well as WireCat". The owner disagreed, and the setup proved him right: the test was simpler
than real use in five ways, and four of them worked against WireCat.

| What the test did | What real use looks like |
| --- | --- |
| Clean questions written by Claude, with exact names and keywords | A dictated sentence, unsure ("кажется, я ему скидывал…"), a misspelled name, a speech-to-text error |
| Every question named the chat | The owner often does not remember where it was |
| 10 hand-picked chats | The whole account: 1,421 chats in the owner's store |
| WireCat without vectors: 0 chunks embedded | Search by meaning is part of WireCat |
| No question needed typo-tolerant search (`--discover`) | Typos are the normal case |

A result is only as wide as its questions and data. Each rule below comes from one of these mistakes.

## Questions

- **Write them the way the user asks.** Take the style from the user's real prompts (for the owner: Claude Code
  sessions), not from the source message: a full sentence, often unsure, often asking for a judgement on top of the
  fact.
- **Keep the key writer's words out.** One agent picks the source message and writes the key; a second agent, which
  sees only the source message and the style samples, writes the question; a third adds errors. The owner rejects any
  that do not sound like him.
- **Cover the hard cases on purpose.** In every set:
  - questions that do not name the chat, the person or the source;
  - typos and speech-to-text errors, above all in proper names: a name close to another one in the data (two
    Sergeys, Стёпа and Степан) and a name mangled beyond resemblance;
  - words with two meanings, where the wrong meaning also occurs in the data;
  - a detail the user misremembers (the wrong month or person);
  - tasks that need many messages, across chats;
  - questions with no answer in the data, so a made-up answer shows as confidently wrong.
- **Never only direct questions.** A question that shares its rare words with the answer measures keyword search, and
  every rival has one.

## Data

- **Use the scope the user has.** The whole account, or say which part and why. A small scope favours plain files and
  grep; write who the scope favours next to the result.
- **Do not reduce the data to make the run cheaper without saying so.** WireCat's store had at most 20,000 messages per
  chat in Experiment B; the export had all of them.
- **Keep the data for the next test.** Real data stays outside git, in a private run folder (Experiment B:
  `~/.cache/wirecat-experiment-b/`, described in its `notes/README.md`). Reuse it instead of exporting or syncing
  again.

## Every contestant at its best

- **WireCat with what it ships:** vectors built for the chats in scope (`tg <profile> conversations status`: `current`
  above 0), conversations built, the default skill, no hint in the prompt.
- **A rival with the tools a real user would allow it:** an export in its real format (Telegram Desktop writes JSON
  with one field per line), `grep`, `jq` and Python for an agent that reads files.
- **Read two transcripts of every contestant before you score.** Look for refused commands, permission prompts, a tool
  that returned nothing. A run that failed on the setup is reported and rerun, never scored.

## Scoring

- **Blind**, with [score.sh](../../performance/agents/source-coverage/score.sh): a random letter per sheet, a separate
  agent, the key, and one rule for every contestant. When one answer is scored for one contestant, score the same
  answer the same way for all.
- Count correct with source, confidently wrong, time, cost and tool calls.
- **Write the thresholds before the run**, and the decision for each outcome.
- One run on one account is noise at 1 or 2 answers of 20. Say so instead of drawing a claim.

## Conclusions

- State the scope with every conclusion: "on clean questions naming the chat, over 10 chats…", not "an export answers
  as well".
- When the owner's experience contradicts the result, check the setup against this page first.
- Real data publishes totals only; queries, names and per-question rows go to cli-private.
