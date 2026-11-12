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
| E | Telegram Desktop export | the user exports each chat to JSON by hand; the agent reads the files | [e-setup.sh](e-setup.sh) |
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

## Results (2026-11-13; E waits for the export)

| | W: WireCat | M: telegram-mcp | E: export | O: OpenClaw |
| --- | --- | --- | --- | --- |
| Correct with a source, of 10 | **6** | **9** | pending | 0 (docs) |
| Setup to first answer | 23 min | 4 min | pending | n/a |
| Answering the 10 questions | 10 min, $0.87 | 1.3 min, $1.56 | pending | n/a |

tg 0.123.0 with cli-core 0.633.0, memo 0.131.87; telegram-mcp `6b3bd95`; Claude Code with Claude Sonnet 5.5. One run each.

## What it showed

- **The rival reached the old history and WireCat did not.** telegram-mcp answers from Telegram's own server search,
  so a 2020 message cost it nothing. WireCat answered only from what it had synced: 20,000 messages per chat kept large
  groups to their last 8 to 12 months and one private chat to its last 3 years, so the three oldest answers (2020,
  2021, 2022) were not on the computer. The agent never used tg's server search (`--backend archive` every time).
- **WireCat's setup was 6 times longer.** 23 of its minutes went to syncing; one sync stopped at the default 5-minute
  command timeout with an error and had to be run again; preparing local search refused to run under `TG_READ_ONLY`.
- **Where WireCat won:** one question (a start date said in passing) that telegram-mcp could not find.

By the thresholds set before the run, the claim "WireCat reaches the whole history and rivals do not" is weakened: a
rival reached 10 of 10 chats with a setup under 30 minutes and more correct answers.

## What was not measured

- One account, one person's 10 questions, one run per contestant; Claude scored the answers against the expected
  ones.
- W with a deeper sync or with the agent told to use server search. Both would raise W; neither is what the agent did
  on its own.
- Freshness (a new message seen without a manual step) and staying current over days.
- Cost of keeping a second Telegram session for M, and the risk of Telegram's limits on it.

## Cleanup

- M signs in as a new Telegram session. End it in Telegram (Settings → Devices) and delete
  `$run/m/telegram-mcp/.env`, which holds the session.
- `$run` holds copies of private chats. Delete it once the results are written.
