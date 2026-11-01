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
