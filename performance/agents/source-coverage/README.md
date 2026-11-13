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
- **Setup:** the local copy costs time once: 23 minutes for 10 chats at 20,000 messages each; one sync stopped at the
  default 5-minute timeout (tg-cli #871); preparing local search is refused under `TG_READ_ONLY` (tg-cli #872).

## What was not measured

- One account, one person's 10 questions, one run per contestant; Claude scored the answers against the expected
  ones.
- E (Telegram Desktop export, done by a script through telegram-mcp's session): the export of one large group was
  still running after 40 minutes, so E has no answers yet.
- WireCat with the full history of every chat (no 20,000 limit).
- Freshness (a new message seen without a manual step) and staying current over days.
- Cost of keeping a second Telegram session for M, and the risk of Telegram's limits on it.

## Cleanup

- M signs in as a new Telegram session. End it in Telegram (Settings → Devices) and delete
  `$run/m/telegram-mcp/.env`, which holds the session.
- `$run` holds copies of private chats. Delete it once the results are written.
