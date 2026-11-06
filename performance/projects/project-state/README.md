# Project state through the CLIs — rerun after the coverage release

## Why this was run

On 2026-10-28 an agent was asked where one of the owner's real client projects stands (open tasks, payments, who
replies next), using only memo, tg, max and drive. The CLIs answered from a store that held about a third of one
group chat and from a five-day-old document copy, and nothing said so. The plan that followed (TASK-834) made "every
answer says how much it saw" its first stream. That stream shipped on 2026-10-31 and 2026-11-01: cli-core 0.504.0 and
0.511.0, memo 0.128.0 and later, tg 0.110.0, max 0.94.0, drive 0.49.0.

The question: on the same scenario, do the answers now name the chats read only in part, and does that cut the agent's
manual work, failed commands and tokens? The answer decides whether the next stream should be the project status
command and compact output (TASK-834 e and f) or more coverage work.

## Setup

- Linux 7.0.0, AMD Ryzen AI 9 HX 470, Node 24.19.0, Claude Code 2.1.316.
- Installed: memo 0.130.0, tg 0.110.0, max 0.94.0, drive 0.49.0. Baseline: memo 0.117.0, tg 0.102.0, max 0.83.0.
- Data: the owner's live store, read only, plus the message syncs the original run also did. 8 chats are linked to
  the project. Profiles: the ones the original run used.
- The scenario was an interactive session, not a script. It was rebuilt from that session's transcript:
  1. The main agent runs the coverage reads and syncs the same 6 chats as before.
  2. Two background subagents (Claude Code `general-purpose`, Sonnet) get the original prompts word for word, with only
     the date changed. One reads the client's messenger chats, one reads the contractor chat, memo and drive. Each
     returns findings and a log of every command it ran.
- Phase 1 of the original run (linking the project to chats and people) wrote relationships. It was not repeated:
  this rerun is read only, and the links exist now. Its failing read commands were re-run instead.
- The prompts, the commands with chat ids, the per-command table and the findings are private (cli-private
  `reports/2026-11-01-pmed-project-state-rerun.md`).

Totals come from the subagent transcripts:

```sh
python3 -I performance/projects/project-state/transcript-totals.py ~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl
```

`subagent_tokens` is the whole context of the agent's last turn. It is the number Claude Code reports when a subagent
ends, and the script reproduces it exactly for all four agents.

## Results

| | Baseline 2026-10-28 | Rerun 2026-11-01 |
| --- | --- | --- |
| State gathered through the CLIs (judgment) | ~40 % | ~45 % |
| Linking through the CLIs (judgment) | ~70 % | not repeated (writes) |
| Subagent tokens, both agents | 269 163 | 279 834 (+4 %) |
| Subagent tool calls | 53 | 58 |
| Subagent wall time | 141 s + 155 s | 129 s + 204 s |
| Command-log rows / marked failed or confusing | 16 / 13 | of the 13: 1 fixed, 2 improved, 9 unchanged, 1 not concluded |
| New failed or confusing commands | — | 15 (7 on the new coverage paths, 8 in the agents' logs) |
| Agents that formatted messages with their own script | 2 of 2 | 2 of 2 |
| Agents that ran `projects evidence` | 0 of 2 | 0 of 2 |

The coverage targets of the plan:

| Target | Baseline | Rerun |
| --- | --- | --- |
| Linked chats shown with no items and no reason | all | 0 (each has a state and its held range) |
| Answer claims to be complete while coverage is unknown | 1 | 0 |
| Stale document copy used without a warning | 1 | 0 |
| Extra commands to learn a chat is partial | by hand | 0 in human output; JSON names the gap but not the command |
| A long sync runs silently | 10+ min | a progress line every ~8 s; the sync stopped at the CLI's 300 s limit |
| The client group flagged partial before any sync | no | not testable: that chat has been complete since the first run |

## What it showed

- The coverage release works where it was aimed. The answers no longer present a partial store as whole, and drive
  flags an old copy. The contractor agent saw the 8-day-old copy and read the live document instead, which the
  baseline agent did not.
- It did not reduce the work. Tokens rose 4 %, and both agents again read every message and did all the analysis
  themselves. Neither used `projects evidence`: the prompts point them at the message lists. Coverage tells an agent
  what is missing; it does not answer "who owes what". That needs the project status command and compact output.
- The new paths add their own failures. The command that syncs linked chats first could not sync any MAX chat,
  because two local profiles share the account and the message says none is signed in. The JSON answer names no
  sync command. A partial answer exits 1. Progress lines reach the owner as raw JSON in one place and with an epoch
  number instead of a date in another.

## Not measured

- Accuracy of the answers: no labelled answer set exists for this scenario. The percentages are judgments, as in the
  baseline.
- The linking phase and reading agent-proposed links.
- The client-group check on a fresh store (a fixture test covers it in cli-memo).
- Run-to-run variance: one run on each side.
- memo 0.131.1, released after the installed 0.130.0.

## Run 3 (2026-11-06): status first, scored against an answer key

### Why

Run 2 could not say whether the agents' answers were right. Since then the owner checked a set of 16 questions with
expected answers for the same project (open tasks, money, who replies next, decisions, people, growth proposals),
and `memo projects status` and `--compact` output shipped. The question: does an agent that starts from
`projects status` give more right answers with fewer tokens? The answer decides whether the next work is more status
signals or better search and reading.

### Setup

- Installed: memo 0.131.43, tg 0.116.0, max 0.102.0, drive 0.60.0. Same machine and store as run 2, read only, plus
  the same six syncs.
- Two arms, each the same two Sonnet subagents. Arm A: the 28.10 prompts word for word, date changed. Arm B: the same
  plus one line, "start with `memo projects status`, use `--compact`, read in full only the chats it names in
  `next`". Both arms also got one paragraph of safety rules (read only, explicit profiles).
- Scoring: each arm's answers against the 16 expected answers, using each question's "must say" and "wrong" lines.
- Store checks that need old data (a chat flagged partial before sync; link proposals recovering removed links) ran
  on a copy of the store in a temporary folder with the keyring unreachable.

### Results

| | Run 2 (01.11) | Run 3 arm A | Run 3 arm B |
| --- | --- | --- | --- |
| Right / partly / wrong / not answered (of 16) | not scored | 8 / 4 / 2 / 2 | 11 / 3 / 1 / 1 |
| Share right | — | 50 % | 69 % |
| State through the CLIs (judgment) | ~45 % | ~45 % | ~60 % |
| Subagent tokens, both agents | 279 834 | 267 957 | 259 550 |
| Cache reads summed over turns | — | 5.34 M | 3.09 M |
| Tool calls | 58 | 62 | 36 |
| Wall time | 129 s + 204 s | 114 s + 229 s | 98 s + 204 s |
| Agents that ran `projects status` | 0 of 2 | 0 of 2 | 2 of 2 |
| Agents that wrote message text to scratch files | 2 of 2 | 2 of 2 | 2 of 2 |

Of the 4 wrong answers, 2 came from a search gap (a reply that never names its topic; an amount kept only in a
document whose local copy was 13 days old), 2 from an agent that rebuilt a debt from an old reminder instead of
reading the confirmed books.

Re-run of the earlier failing commands: of the 13 rows failing on 28.10, 4 more are fixed (12 → 8 failing or
confusing). Of the run 2 bugs, the profile choice for the sync, the exit code on a partial answer and the raw date in
progress lines are fixed. A cross-store search got slower (4.3 s → 56 s).

Store checks on the copy:

| Target | Result |
| --- | --- |
| A chat holding only part of its history is named partial before any sync | met: the chat's line says from which date it is held, with the sync command |
| Link proposals recover removed links, recall after two rounds ≥ 80 % | 27 % (4 of 15); 47 % after three rounds; links in the second messenger are never reached |
| False proposals ≤ 5, precision ≥ 60 % | 0 after two rounds, 2 after three (78 %) |
| Agent's own decisions accepted | 0 (refused: agent decisions are off) |

### What it showed

- Starting from `projects status` gave 3 more right answers out of 16, all on money: the confirmed books answer
  "who owes what", raw chats lead to a debt that was already paid.
- It did not cut tokens much (−3 % against arm A, −7 % against run 2): both status-first agents still read every
  message of their chats.
- The remaining wrong answers need search that ties a reply to its topic, and a document read that does not miss
  a staleness signal.

### Not measured

Run-to-run variance (one run per arm); voice messages (no agent transcribed them); the 2 000-chat scan timing and
re-proposal of rejected links.

The `projects status` command that followed is measured on an invented store in
[status-fixture](status-fixture/README.md).
