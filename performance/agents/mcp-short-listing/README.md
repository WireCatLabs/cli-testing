# A short answer schema in the MCP tool listing (2026-11-09)

## Why this was run

cli-base 0.94.0 added `meta.ranking` to the answer format, so WireCat Desktop can read the result of
`search all --harder` as data. Every WireCat CLI serves three MCP tools (`<app>_tools_search`, `<app>_read`,
`<app>_write`), and `_read` and `_write` each declared the full answer envelope as their `outputSchema`. With the new
block, the listing a client loads on every connect grew from 14,430 to 17,278 characters. `meta.ranking` alone took
2,848 of them: 701 characters, four times.

The owner asked for a short listing for the agent and the full schema kept for reference, with proof that nothing
regresses. cli-core now lists only what an agent acts on: `items` or `item`, `page.has_more`, `next`, `missing`, and
`meta` as an open object that points at `<app>_tools_search`, whose match still gives each command's full answer. The
server still checks every answer against the full envelope.

The question here: **does an agent succeed as often with the short listing as with the full one?** The short listing
was to be accepted only if success is not lower.

## Setup

- **Model:** `claude-haiku-5-5` through the Messages API directly (not an agent framework), no extended thinking. The
  model refuses `temperature` (400, "deprecated for this model"), so sampling is the default; each arm ran twice.
- **Server:** memo 0.131.71 (`memo mcp serve`) over stdio on a copy of the synthetic v3 knowledge-graph fixture store
  (`kg-fixture-v3`, made by [knowledge-graph-memory](../knowledge-graph-memory/README.md)). No real account. One fresh
  store copy per arm and run, so a write in one arm is not seen by the other.
- **Arms:** both take memo's own `listTools`: the same three tools, descriptions and input schemas. They differ only
  in the output schema of `memo_read` and `memo_write`, taken from cli-core's listing on cli-base 0.94.0:
  - **full:** the full envelope, 7,488 characters for each tool;
  - **short:** 648 characters for `memo_read`, 373 for `memo_write` ([listings.json](listings.json)).
- **How the schema reaches the model:** the Messages API tool object has `name`, `description` and `input_schema`, and
  no output-schema field ([tool definition](https://platform.claude.com/docs/en/api/messages)). Each arm puts its
  schema at the end of the tool description. This models a client that shows `outputSchema` to the model. A client
  that drops it sees no difference in the model's context. The listing on the wire is smaller for every client.
- **Tasks:** 21 in [tasks.json](tasks.json): 14 questions from the fixture's oracle (prices, payments, meeting times,
  dates, people, venues, counts), 2 that page through `notes list` 5 at a time, 2 whose answer is in the `missing`
  part of a `search all` answer, and 3 that ask the agent to propose a write (`actions add`, `facts add`,
  `memories add`).
- **Scoring is exact, with no model as judge:** the agent's last `ANSWER:` line must contain the oracle's answer; a
  write task passes when `memo_write` was called with the expected command and arguments.
- **Limits:** 8 model turns per task, each tool result cut to 12,000 characters in both arms, and a cost cap of
  $1.00. The total spend was $0.83.

```sh
node eval.mjs --memo <memo>/dist/bin/memo.js --store <copy of the v3 store root> \
  --mcp-client <node_modules>/@modelcontextprotocol/client --arms short --max-usd 0.5 > results/short.json
```

The Anthropic key is read in the script's process from the system keyring (`cli-memo` / `anthropic`) and never
printed.

## Results

| Arm | Passed (2 runs × 21 tasks) | Tool calls | Input tokens | Output tokens |
|---|---|---|---|---|
| short | **39 / 42** | 320 | **2,491,703** | 49,436 |
| full | 39 / 42 | 340 | 5,294,663 | 48,107 |

| Task | Kind | Short, run 1 / 2 | Full, run 1 / 2 | Tool calls, short / full | Input tokens, short / full |
|---|---|---|---|---|---|
| q01 | search | pass / pass | fail / fail | 15 / 23 | 97,818 / 406,066 |
| q05 | search | pass / fail | fail / pass | 36 / 28 | 242,752 / 326,007 |
| q07 | search | pass / fail | pass / pass | 30 / 28 | 153,155 / 334,706 |
| q10 | search | pass / pass | pass / pass | 21 / 18 | 182,881 / 282,712 |
| q12 | search | pass / pass | pass / pass | 11 / 15 | 104,590 / 211,791 |
| q15 | search | pass / pass | pass / pass | 19 / 17 | 167,016 / 295,942 |
| q20 | search | pass / pass | pass / pass | 15 / 16 | 120,447 / 310,866 |
| q23 | search | pass / pass | pass / pass | 13 / 18 | 106,464 / 296,865 |
| q28 | search | pass / pass | pass / pass | 15 / 23 | 136,524 / 339,669 |
| q30 | search | pass / pass | pass / pass | 12 / 12 | 95,113 / 214,475 |
| q32 | search | pass / pass | pass / pass | 11 / 12 | 113,819 / 212,129 |
| q36 | search | pass / pass | pass / pass | 8 / 18 | 62,837 / 238,910 |
| q39 | search | pass / pass | pass / pass | 16 / 14 | 87,252 / 222,361 |
| q44 | search | pass / pass | pass / pass | 15 / 14 | 91,679 / 227,879 |
| page-12 | page | pass / pass | pass / pass | 7 / 7 | 35,189 / 111,617 |
| page-14 | page | pass / pass | pass / pass | 6 / 6 | 25,823 / 83,489 |
| missing-kind | missing | pass / pass | pass / pass | 9 / 4 | 68,814 / 93,827 |
| missing-fix | missing | pass / pass | pass / pass | 4 / 4 | 36,103 / 93,652 |
| write-reply | write | pass / pass | pass / pass | 22 / 26 | 201,770 / 325,230 |
| write-fact | write | pass / pass | pass / pass | 16 / 19 | 171,518 / 372,136 |
| write-memory | write | fail / pass | pass / pass | 19 / 18 | 190,139 / 294,334 |

Raw runs: [results/](results/) (`short.json`, `full.json`, and `-2` for the second run).

## What it showed

- **Success is the same: 39 of 42 in each arm.** Paging, `missing` and writes pass in both. The failures are spread
  across tasks and runs: a full-arm run of q01 and q05 used all 8 turns without an answer, and a short-arm run of
  write-memory chose not to save a memory without evidence.
- **The short listing more than halves the input tokens** (2.49 M against 5.29 M) and uses 6% fewer tool calls. The
  saving repeats on every turn, because the listing is part of every request.
- So the short listing is accepted: success is not lower.

## What was not measured

- Clients that do not show `outputSchema` to the model. There, the context is the same in both arms, and only the
  bytes sent on each connect change.
- Other models, thinking on, and other CLIs' catalogues. memo's three tools are the same shape as every CLI's, but the
  tasks are memo's.
- Two runs per arm is little. A difference of one or two tasks is within the noise seen here: q05 passed in one run
  and failed in the other in both arms.
