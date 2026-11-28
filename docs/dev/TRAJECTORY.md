# Checking the path an agent took

A check of the final answer shows what the agent said. It does not show how the agent got there: a right answer
after fifteen calls instead of two, a raw `api` call where `review` was the tool to use, or a write the user had not
yet confirmed. Trajectory checks read the agent's transcript and check its tool calls: which tools it called, with
what input, in what order, in which turn of the conversation and how many calls in all.

The idea came from a scenario test in the Sparrow6 task-check style, which checks the lines of a conversation block by
block. Our agents call tools with JSON input, so the checks match calls and their input fields, not lines of text.

## What is read

A Claude Code transcript, written by `claude -p --output-format stream-json --verbose`, one JSON event per line. The
reader takes three things from it, and nothing else:

- **Calls:** each `tool_use` block of an `assistant` event, with its name, input and id.
- **Status:** `ok` when its `tool_result` came back, `error` when that result has `is_error`, `denied` when the host
  refused it (a `permission_denied` system event or an entry in any `result` event's `permission_denials`),
  `unanswered` when no result came back.
- **Turns:** every user message ends with its own `result` event, so a call belongs to the turn numbered by the
  results before it, from 0. A one-prompt run is turn 0 only. A conversation sent with `--input-format stream-json`
  has a turn for each user message.

A transcript whose last event is not a `result` is refused: the run was cut off, and a check that there was no write
would otherwise pass on missing evidence. Events with a `parent_tool_use_id` are calls a subagent made, and they are
left out: the path checked is the main agent's.

The format was checked on Claude Code 2.1.332 with a one-prompt run and a two-message run; reduced copies are the test
fixtures in [`src/cases/trajectory/`](../../src/cases/trajectory/).

## The checks

A list of checks in JSON. Each one has exactly one of `called`, `sequence` or `calls`. A **matcher** names one kind
of call:

| Field | Matches | Default |
| --- | --- | --- |
| `tool` | The tool name, exact or with `*` for any text: `*_read`, `mcp__tg__*` | required |
| `input` | A subset of the input's fields. Strings, numbers and booleans are equal, objects need the named keys, arrays need the same length | any input |
| `status` | `ok`, `error`, `denied` or `unanswered` | any status |
| `turn` | The turn number, from 0 | any turn |

A denied call is still a call. With no `status`, a matcher counts the writes the host refused, so a check that there
were no writes fails on an attempt.

| Check | Passes when |
| --- | --- |
| `{"called": <matcher>, "min": 1, "max": 3}` | The number of matching calls is within `min` and `max`. With neither, at least one. `"max": 0` means none |
| `{"sequence": [<matcher>, ...]}` | The matchers match calls in this order. Other calls may come between them |
| `{"sequence": [...], "exact": true}` | The calls are exactly these, one for one, and no more |
| `{"calls": {"min": 1, "max": 6}}` | The number of all tool calls is within the bounds |

For the WireCat MCP servers, the tool is one of `<cli>_read`, `<cli>_write` and `<cli>_tools_search`. The command
the agent ran is the `command` field of the input and its options are `arguments`, so the path is matched on input.

The tg scenario "what did I promise in the last three days, then remind Bob and send it after I say yes":

```json
[
  { "called": { "tool": "*_read", "input": { "command": "review" } } },
  { "sequence": [{ "tool": "*_read", "input": { "command": "review" } }, { "tool": "*_write", "turn": 1 }] },
  { "called": { "tool": "*_write", "turn": 0 }, "max": 0 },
  { "calls": { "max": 6 } }
]
```

The agent must use `review`, write only after it, write nothing in the first turn before the user answered, and take
at most six calls.

## Running it

On any transcript, for example a run of an agent test in [`performance/agents/`](../../performance/agents/README.md):

```sh
cli-testing agent trajectory <transcript.jsonl> <checks.json>
```

It prints one JSON report and exits 0 when every check passed, 1 when one failed and 2 when the transcript or the
checks cannot be read, or the transcript has no final result. The report gives the number of turns and calls and, for each failed check, a reason built from
the check itself: the matcher, the expected count and the count found. It never copies a call's input or the agent's
text, so a report from a run on real data shows no query or message.

In the live agent suite, a case takes the checks as `trajectory` in its plan
([the agent test](../security/AGENT-TEST.md#run-the-agent-command)). The runner checks every model's transcript of
that case, writes `<case>.trajectory.json` into the private run folder, and records the case as an observation when
one transcript fails. A case with checks and no transcript, or one that cannot be read, leaves the run incomplete.
The canary takes no checks: it is the check of the host itself.

From code, `readTranscript`, `parseTrajectoryChecks` and `checkTrajectory` are exported by `@wirecat/cli-testing`.

## What it does not check

- **The answer.** Whether the agent was right is the job of the expected fragment in the live suite and of blind
  scoring in [agent tests on real data](AGENT-TESTS.md).
- **A confirmation in the live suite.** `scripts/agent/run-agent` sends one prompt, so all calls are in turn 0, and
  the suite passes a case only when the agent attempted no write. A turn-based check of "write only after yes" works
  on a transcript of a conversation with two or more user messages, offline. In the live suite it also needs a new
  pass rule, since there the confirmed write is the right behaviour.
- **Subagents.** Calls made inside a subagent are not counted or matched.
- **Other agents.** Only the Claude Code transcript format is read. An agent with another format needs its own
  reader to the same list of calls.
