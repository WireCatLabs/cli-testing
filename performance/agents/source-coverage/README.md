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

Scored blind, all five sheets of a set together ([score.sh](score.sh) with a rules file per set):

| | E | WF | WFH | WS | M |
| --- | --- | --- | --- | --- | --- |
| 20 questions | 16.5 | 14.08 | 13.67 | 7.67 | 5.5 |
| the same, bulk scored strictly | 15.33 | 13.42 | 13.17 | 7.0 | 5.5 |
| confidently wrong | 1 | 0 | 0 | 4 | 2 |
| 16 questions outside the 4 large groups | 13.0 | 12.75 | 12.33 | | |
| 12 variants (2 sets of 6) | 11 | 6 | 6.5 | 4 | 4 |

- **Setup.** WF's full history of the 4 large groups took about 9 hours to sync (one group of about 443,000
  messages: 7 hours). Vectors run at about 1 chunk a second on a busy 24-core machine; one group has 24,911 chunks,
  so the 4 groups would take more than a day. WF and WFH ran without them; 4 questions depend on those groups.
- **What the agent did.** With the default skill the agent rarely used meaning search: WF ran 71 searches on the 20
  questions, 55 of them limited to the local archive, 2 by meaning. Typed verbatim into `search conversations` on the
  same store, 6 of 7 questions the agent had missed in the first set put the right conversation in the top 10. The
  prompt line of WFH did not change this much (4 searches by meaning of 72), and its score is the same as WF's.
- A first set of 20 questions, all full sentences, scored E 19.0, WS 11.33, M 7.17. The form of the question cost
  E 2.5 points.

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
- **Round 3, questions as the owner asks them:** with the full history of the same 10 chats, WireCat and the export
  are close: 14.08 against 16.5 (strict 13.42 against 15.33), with 0 confidently wrong against 1; on the 16 questions
  where WireCat had its vectors, 12.75 against 13.0. The gap is in the variants: the export answered 11 of 12 forms of
  the same facts, WireCat 6. WireCat's answer depends on the wording because the agent searches by keywords and rarely
  by meaning. With the owner's everyday store WireCat scored 7.67: most of the history was not in it.
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
- A second run of round 3: one run per contestant, so 1 or 2 points of 20 are within noise.
- Freshness (a new message seen without a manual step) and staying current over days.
- Cost of keeping a second Telegram session for M, and the risk of Telegram's limits on it.

## Cleanup

- M signs in as a new Telegram session. End it in Telegram (Settings → Devices) and delete
  `$run/m/telegram-mcp/.env`, which holds the session.
- `$run` holds copies of private chats. Experiment B keeps it outside git to repeat the tests (the owner's decision,
  2026-11-13).
