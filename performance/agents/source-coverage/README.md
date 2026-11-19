# Source coverage: can an agent reach old Telegram chats? (Experiment B)

## Why it was run

WireCat's main promise is that an agent sees the whole history of the user's messengers, months back, with a link to
each message. The earlier memory benchmark ([knowledge-graph-memory](../knowledge-graph-memory/README.md)) gave every
setup the same prepared files, so it could not test that promise. This test asks the missing question: can an agent
get the history out of Telegram at all, how far back, and how much setup does it take?

The answer decides the launch claim. If a rival reaches the same history with a short setup, "the whole history" is not
a reason to choose WireCat. Plan and thresholds, written before any run:
[product experiment](https://github.com/WireCatLabs/product/blob/main/experiments/2026-11-12-experiment-b-source-coverage.md).

## Contestants

| Id | Contestant | How the agent gets Telegram | Setup script |
| --- | --- | --- | --- |
| W | WireCat `tg` and `memo` | syncs the chats into an empty, throwaway local store, then searches it (and Telegram's server search) | [w-setup.sh](w-setup.sh) |
| M | [chigwell/telegram-mcp](https://github.com/chigwell/telegram-mcp) at `6b3bd95` | a new Telegram session; asks Telegram live; read-only tools only | [m-setup.sh](m-setup.sh) |
| E | Telegram Desktop export | each chat exported to JSON (by hand, or by [e-export.py](e-export.py) through the M session); the agent reads the files | [e-setup.sh](e-setup.sh) |
| O | OpenClaw | not run: its docs describe only a Telegram bot, which cannot read a personal account's past chats | none |

Every contestant answers through the same agent and settings ([ask.sh](ask.sh)): Claude Code in print mode, Claude
Sonnet 5.5, the same instructions, project settings only, and only that contestant's tools.

## Setup

- One real personal Telegram account (the owner's), 10 chats: 5 private chats and 5 groups.
- 10 questions, one per chat, each about a message from 2020-06 to 2026-10. Claude drafted them from the owner's
  local archive and the owner approved them. Chats, questions and answers are private.
- W starts from an empty store: the owner's existing archive was used to write the questions.

```sh
run=~/.cache/wirecat-experiment-b
./w-setup.sh chats.txt "$run" && ./ask.sh w questions.txt "$run"
./m-setup.sh "$run"            # in your own terminal: the sign-in prints a session string
./ask.sh m questions.txt "$run"
./e-setup.sh ~/Downloads/experiment-b-export "$run" && ./ask.sh e questions.txt "$run" ~/Downloads/experiment-b-export
```

`chats.txt` holds one chat id per line, `questions.txt` the numbered questions; both stay private.

The other steps:

| Step | Script | What it does |
| --- | --- | --- |
| Export without clicks (E) | [e-export.py](e-export.py) | each chat's history as Telegram Desktop's JSON, through the M session; a rerun skips chats already exported |
| Variants | [ask.sh](ask.sh) | `w2`…`wf2`: the WireCat variants of the results below (store, `TG_READ_ONLY`, hint) |
| Check an indirect question | [overlap.py](overlap.py) | the question's words whose stem also occurs around the answer message; only names should remain |
| Score blind | [score.sh](score.sh) | gives each sheet a random letter and has a separate agent score it against the key |

```sh
./score.sh key.md "$run/score" w=w-answers.md m=m-answers.md   # the letters go to $run/score/blind-key.txt
```

Scored twice, the rerun's round 2 sheet got the same totals both times (9, 5.0, strict 3.67, 0 confidently wrong).

### Search checks without an agent

Free checks of the search itself, run before any paid agent run. They read the test store and a private
`private.json` beside it (the owner's chat ids, the export agent's grep patterns, the focus chat and words); per-query
rows stay in the private folder, only totals leave it.

| Check | Script | What it does |
| --- | --- | --- |
| First search finds the answer | [search-check/retrieval.py](search-check/retrieval.py) | rank of the key's messages in the first `search conversations`, local and OpenAI vectors |
| Deeper and in-chat | [search-check/diagnose.py](search-check/diagnose.py), [perchat.py](search-check/perchat.py), [chatpick.py](search-check/chatpick.py) | rank at depth 300, inside the answer's chat, and which chat wins the merge |
| Rare words | [search-check/rareword.py](search-check/rareword.py) | the question's rarest words and the chats that hold them |
| Grep parity | [search-check/parity.py](search-check/parity.py), [missed.py](search-check/missed.py) | `search messages` finds every message the export agent's grep finds; lists the word forms it misses |
| Two focus questions | [search-check/q2.py](search-check/q2.py), [msgs.py](search-check/msgs.py), [eval.py](search-check/eval.py) | rank of the answer for the focus pair, all chats and in chat, in both searches |
| Name to chat | [search-check/names.py](search-check/names.py) | how a word spreads over chats and how often it is capitalised |
| Time of one query | [search-check/prof.sh](search-check/prof.sh), [exit-time.mjs](search-check/exit-time.mjs) | one query with timestamps per stage |
| Local build | [search-check/sync.sh](search-check/sync.sh), [tg.sh](search-check/tg.sh), [m.sh](search-check/m.sh), [c.sh](search-check/c.sh) | build a cli-core worktree into tg and run one search |

## Results

### Round 1: 10 direct questions (the question shares words with the answer)

Correct with a source, of 10. One run each; a difference of 1 is within run-to-run noise.

| Contestant | Store | Telegram server search | Correct |
| --- | --- | --- | --- |
| M: telegram-mcp | none | every search | **9** |
| W: WireCat, fresh store, `TG_READ_ONLY` | 20,000 messages per chat | blocked by `TG_READ_ONLY` (tg-cli #874) | 6 |
| W2: same, prompt says "search the server too" | same | blocked | 6 |
| W3: fresh store, read commands allowed, no `TG_READ_ONLY` | same | allowed, never used (the skill points at the archive, tg-cli #873) | 6 |
| W4: as W3, prompt says "search the server too" | same | used 4 times | **8** |
| WS: the owner's long-kept store, `TG_READ_ONLY` | owner's | blocked | **10** |
| WS2: the owner's store, no `TG_READ_ONLY` | owner's | allowed | 9 |
| O: OpenClaw | n/a | n/a | 0 (its docs: a bot cannot read a personal account) |

Setup: W 23 minutes (sync), M 4 minutes (a new session by QR). WS needs none, but its store is the one the questions
were written from, so its score is an upper bound.

### Round 2: 10 indirect questions and 5 tasks that need many messages

Indirect: the question shares no distinctive word with the answer message. Tasks: "all the problems Nikita had in his
first weeks", scored as checklist points found. Scored blind by a separate agent that did not know which sheet was
whose. All three without `TG_READ_ONLY`, read commands only, no hint.

| Contestant | Indirect, of 10 | Tasks, of 5 (strict) | Confidently wrong | Time | Cost |
| --- | --- | --- | --- | --- | --- |
| WireCat, fresh store (20,000 per chat) | 8 | **5.0** (4.0) | 0 | 5.6 min | $1.53 |
| WireCat, the owner's store | **9** | **5.0** (3.8) | 0 | 3.9 min | $1.17 |
| telegram-mcp | 7.5 | 2.7 (1.3) | 1 | 3.6 min | $2.47 |

Strict: a checklist point counts only with every detail in it. No Telegram rate-limit error in any run.

Versions: tg 0.123.0 with cli-core 0.633.0, memo 0.131.87; telegram-mcp `6b3bd95`; Claude Code with Claude Sonnet 5.5.

### After the tg fixes (2026-11-13)

Both problems round 1 found were fixed: `TG_READ_ONLY` lets Telegram's search through
([cli-core #2907](https://github.com/WireCatLabs/cli-core/pull/2907)), and tg's skill searches the archive and the
server together ([tg-cli #879](https://github.com/WireCatLabs/tg-cli/pull/879)). Rerun with the first setup W: the
fresh store, `TG_READ_ONLY`, no hint in the prompt. tg built from main (0.124.0 on cli-core 0.650.0).

| | Round 1, of 10 | Round 2 indirect, of 10 | Round 2 tasks, of 5 (strict) | Confidently wrong | Time, round 1 |
| --- | --- | --- | --- | --- | --- |
| WireCat before the fixes (W) | 6 | 8 (W3) | 5.0 (4.0) (W3) | 0 | n/a |
| WireCat after the fixes | **9** | **9** | **5.0** (3.67) | 0 | 72 s, $0.72 |
| telegram-mcp | **9** | 7.5 | 2.7 (1.3) | 1 | 218 s, $2.47 |
| E: export, read with grep and Python | **10** | **10** | **5.0** (4.0) | 0 | 138 s, $0.78 |

The agent used the default search (archive and server together) without being told to: 20 search answers came from
both, 1 from the server only, no refusal. Round 2 was scored blind, as before.

### Contestant E (2026-11-13)

The full history of the 10 chats, exported by [e-export.py](e-export.py): 948,709 messages, 299 MB of JSON, about
2.7 hours of export, of which the two largest groups took 81 and 26 minutes. The agent got the files with `grep`, `jq`
and `python3 -I`. Two earlier tries are not counted, both because of the setup, not the approach: the files were
written as one line per chat, so a search returned a 100 MB line (1 of 10); then Python was not allowed, and the agent
could not filter by date (round 2: 0).

On round 1 question 6, E and telegram-mcp gave the same 2026 thread (the hosting company's own servers), not the 2022 message;
both are counted as right. WireCat's first run gave that answer too and was counted wrong; by the same rule it scores
7, not 6.

### Round 3: questions as the owner really asks (2026-11-13..14)

Rounds 1 and 2 used clean questions that named the chat. The owner disagreed with their conclusion, and the setup
was simpler than real use in five ways ([AGENT-TESTS.md](../../../docs/dev/AGENT-TESTS.md) lists them). Round 3 asks
20 questions the way the owner asks an agent: 11 name no chat, 5 carry a misspelled or misheard name, 3 a word with two
meanings, 4 a detail the owner misremembers, 4 need many messages, 3 have no answer. They come in mixed forms: 6
keyword queries, 4 sentences, 3 with two asks in one, 2 long dictations, 2 lists of fragments, 1 table request, 2 in
English. Six facts are also asked in two more forms each (12 variants, in separate sessions). The questions were
written by an agent that did not see the answer key; a first set, all full sentences, was replaced after the owner
read it. Plan: [product experiment](https://github.com/WireCatLabs/product/blob/main/experiments/2026-11-13-experiment-b-round3-realistic.md).

| Id | Contestant | Data |
| --- | --- | --- |
| E | export, `grep`, `jq`, `python3 -I` | full history of the 10 chats |
| WF | WireCat, default skill | full history of the 10 chats; vectors for the private chats and one group, not for the 4 large groups |
| WFH | WF plus one prompt line: meaning search first (tg-cli #884) | same as WF |
| WS | WireCat, default skill | the owner's everyday store: 1,421 chats, but 400 to 900 messages of each test chat out of 3,500 to 5,600 |
| M | telegram-mcp | Telegram live |

Scored blind ([score.sh](score.sh): a separate scorer agent per sheet, one rules file per set that names the
checklist points each question asks for):

| | E | WF | WFH | WS | M |
| --- | --- | --- | --- | --- | --- |
| 20 questions | 15.33 | 13.17 | 13.17 | 7.17 | 5.0 |
| the same, bulk scored strictly | 13.83 | 12.67 | 12.67 | 6.5 | 5.0 |
| confidently wrong | 2 | 0 | 1 | 4 | 1 |
| 16 questions outside the 4 large groups | 12.33 | 11.84 | 11.84 | | |
| 12 variants (2 sets of 6) | 11 | 6 | 6.5 | 4 | 4 |
| 20 questions: seconds, cost, tool calls | 358 s, $1.54, 54 | 236 s, $1.05, 83 | 467 s, $1.06, 81 | 289 s, $0.85, 79 | 68 s, $0.85, 39 |

- **Scoring noise.** A first scoring left the bulk checklist to each scorer, and the same unchanged sheets moved by up
  to 1.2 points between the two scoring runs (E 16.5, WF 14.08, M 5.5 in the first). One run and one scoring per sheet is
  noise at 1 or 2 points of 20.
- **Setup.** WF's full history of the 4 large groups took about 9 hours to sync (one group of about 443,000
  messages: 7 hours). Vectors run at about 1 chunk a second on a busy 24-core machine; one group has 24,911 chunks,
  so the 4 groups would take more than a day. WF and WFH ran without them; 4 questions depend on those groups.
- **What the agent did.** With the default skill the agent rarely used meaning search: WF ran 71 searches on the 20
  questions, 55 of them limited to the local archive, 1 by meaning. The prompt line of WFH did not change this (2 of
  72), and its score is the same as WF's.
- **What meaning search finds by itself.** The questions the agent missed, typed verbatim into `search conversations`
  on the full store, and counted a hit only when a returned chunk holds a source message: 2 of 6 in the top 10 across
  the whole store (ranks 1 and 8). Within the right chat, 3 of 6. On the whole store with the 4 large groups, 4 of 6
  of these long queries stopped at the search's 2-second time limit, three tries each.
- A first set of 20 questions, all full sentences, scored E 19.0, WS 11.33, M 7.17.

### Round 4: one question, one minute, 10 tool calls (2026-11-14..15)

The owner pointed out that round 3 is not the daily case: a person types one sentence, wants an answer in seconds and
has no export. Round 4 asks the same 20 questions and 12 variants, one question per new session, and stops each session
at 60 seconds or the 11th tool call ([budget.py](budget.py), [daily.sh](daily.sh)). No own scripts for anyone. Plan
and pass rule, written before the run:
[product experiment](https://github.com/WireCatLabs/product/blob/main/experiments/2026-11-14-experiment-b-round4-daily.md).
WF: tg 0.130.0 (cli-core 0.665.0, search fixes of cli-core #2959 and #2972), full history, OpenAI vectors for all 10
chats, skill installed. EG: the export with `grep` and `jq` only. EF: the export with Python, a ceiling outside the
score. Each sheet scored twice, blind; the mean counts.

| | WF | WS | M | EG | EF |
| --- | --- | --- | --- | --- | --- |
| 20 questions | 9.5 | 6.25 | about 6.0 | 12 | 11.1 |
| confidently wrong | 0 | 0 | 1 | 1 | 0 |
| 12 variants | 2 | 4.5 | 1 | 10.5 | 8 |
| out of budget, of 32 | 4 | 1 | 4 | 3 | 5 |
| median seconds, tool calls a question | 33 s, 5.6 | 28 s, 6.1 | 15 s, 6.7 | 18 s, 6.2 | 18 s, 6.8 |

- **By the pass rule this is a failure:** WF is more than 2 points below EG. WF is 3.5 above M.
- **Why.** In 29 of 32 WF sessions the agent began with `tg <profile> --help` and used the word search `search all`.
  It opened the installed skill once and ran the meaning search once. 17 calls failed on options that do not exist
  (`--chat`, `--around`, `--since`). Under a budget the agent follows the first help screen
  ([tg-cli #896](https://github.com/WireCatLabs/tg-cli/issues/896)), not the skill.
- **Harness fix found on the way:** `claude -p` inside a `while read` loop read the loop's stdin and saw the other
  questions. `daily.sh` passes `< /dev/null`. Answers are taken from the transcripts; a first scoring that split
  `answers.md` shifted numbered lists to the wrong question and is not used.

### Search output, rounds 10 and 11 (2026-11-18..19)

Free checks first, no agent, on a copy of the owner's store (954,027 messages, 220,180 chunks, OpenAI
`text-embedding-3-small` at 768 dimensions; per-question rows in cli-private):

- **Owner block** (cli-core #3119): up to 5 of the owner's own conversations nearest in meaning, in a block after the
  hits. Answers visible in the first call: 24 → 31 of 40 questions and variants, the main list unchanged on all 40,
  +0.24 s a query.
- **The old questions are skewed:** 12 of 17 are about small private dialogs. Five new ones were added, each answered
  by another person's message in a big group.
- **Searching with a guessed reply** (written by a model that saw only the question): the answer in the top 20 or the
  owner block for 8 of 10 with the question, 9 with the reply, 10 with both.

Agent rounds, same budget as round 4 (60 s, 10 tool calls, Sonnet 5.5), tg reading the copy only (`--offline`), two
blind scores per set that agreed. Round 10: the skill asked for a second search with a guessed reply. Round 11:
each hit carries up to 3 of its messages (`lines`, marked untrusted) and `--reply` searches with the guessed reply in
the same call. The 12 held-out questions were not used to design the change.

| | tg, round 10 | tg, round 11 | grep over the export |
| --- | --- | --- | --- |
| 10 questions (5 old, 5 new) | 5.33 | 7.17 | 6.5 |
| 12 held-out old questions | — | 6.67 | 3.5 |
| confidently wrong | 1 | 0 | 1 (held-out) |
| out of budget, held-out | — | 3 of 12 | 0 of 12 |
| median seconds, tool calls a held-out question | — | 26 s, 5 | 17 s, 6 |

- **Round 10 lost because the agent did not use what the search gave it:** it never ran the second search, read one
  or two hits and skipped the owner block that held the answer.
- **Round 11:** the agent passed `--reply` in 9 of 10 sessions, and the lines let it answer from the first call.
- grep on the 10 questions is round 10's run, one sample. The stand was broken three times before round 10 (wrong
  embedding model, the read-only lock refused the query's embedding, reads without the keyring failed); runs on it
  were not counted.

## What it showed

- **Questions that share words with the answer:** Telegram's own search is enough. telegram-mcp found 2020 messages in
  one call. WireCat matched it (8 against 9) only once the agent searched the server too; two tg problems kept it on
  the local copy: `TG_READ_ONLY` blocks server search (tg-cli #874), and the skill tells agents to search the local
  archive for agreements (tg-cli #873).
- **Tasks that need many messages:** WireCat found all the points and telegram-mcp about half. A keyword search
  returns hits, not the conversation around them; reading a month of a chat through it takes many calls and still
  misses points. This is the case a local copy is for.
- **Indirect questions:** a small edge for WireCat (8–9 against 7.5), less than expected. The agent with telegram-mcp
  guessed other words and often hit.
- **After the fixes:** WireCat equals telegram-mcp on direct questions (9 and 9), answers in a third of the time and
  cost, and keeps its lead on tasks that need many messages (5.0 against 2.7).
- **Round 3, questions as the owner asks them:** with the full history of the same 10 chats, WireCat scored 13.17
  and the export 15.33 (strict 12.67 against 13.83), with 0 confidently wrong against 2; on the 16 questions where
  WireCat had its vectors, 11.84 against 12.33. The wider gap is in the variants: the export answered 11 of 12 forms
  of the same facts, WireCat 6. The agent searches by keywords and rarely by meaning, and meaning search over the
  whole store often stops at its time limit. With the owner's everyday store WireCat scored 7.17: most of the history
  was not in it.
- **Round 4, one minute and 10 calls a question:** WireCat 9.5 of 20, telegram-mcp about 6, the export with grep 12.
  The search fixes help without an agent (14 of 29 sources in the top 10 against 11), but the agent under a budget
  reads `--help` and searches by words, so it does not reach them.
- **Rounds 1 and 2: a full local copy is what wins, not WireCat by itself.** The export gives the agent the whole history (WireCat's
  copy held at most 20,000 messages per chat), and with `grep` and Python the agent answered everything: 10, 10, 5.0.
  What WireCat adds is the work around the copy: no manual export, the copy stays current, one search across
  messengers, a link to each message. This test measured none of those.
- **Setup:** the local copy costs time once: 23 minutes for 10 chats at 20,000 messages each; one sync stopped at the
  default 5-minute timeout (tg-cli #871); preparing local search is refused under `TG_READ_ONLY` (tg-cli #872).

## What was not measured

- One account, one person's 10 questions, one run per contestant; Claude scored the answers against the expected
  ones.
- E by hand in Telegram Desktop: the export was done by a script through the same API; Desktop's own export time and
  clicks were not measured.
- The rerun used a tg build from main, not a version from npm, and one run per round.
- WireCat with the full history and vectors for the 4 large groups (round 3: more than a day to build).
- A rerun of round 4 after the help fix, and WS with vectors.
- A second run of round 3: one run per contestant, so 1 or 2 points of 20 are within noise.
- Freshness (a new message seen without a manual step) and staying current over days.
- Cost of keeping a second Telegram session for M, and the risk of Telegram's limits on it.

## Cleanup

- M signs in as a new Telegram session. End it in Telegram (Settings → Devices) and delete
  `$run/m/telegram-mcp/.env`, which holds the session.
- `$run` holds copies of private chats. Experiment B keeps it outside git to repeat the tests (the owner's decision,
  2026-11-13).
