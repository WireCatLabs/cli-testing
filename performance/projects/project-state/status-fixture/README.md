# Project status on an invented store

First run 2026-11-03 with memo 0.131.21 (cli-core 0.560.0), for the e stream of TASK-834 (`projects status`).
Second run 2026-11-05 with memo 0.131.34 (cli-core 0.578.0), after PERF-75 shrank the answer. "Before" below is the
first run, "after" is the second. Third run 2026-11-06 with memo 0.131.40 (cli-core 0.583.0), for headroom under the
limits: see "Headroom" below.

## Why this was run

In the [project-state rerun](../README.md) two agents spent 279,834 tokens to learn where one of the owner's real
projects stands: who owes what, whose move it is, what went quiet. They read every message and did the analysis by
hand. The answer was a command that says it directly: `projects status`, shipped in cli-core 0.551.0 and in memo
across every linked account (cli-memo#572). Its plan set four claims the first answer must make, with references, and
size and time limits, on an invented store shaped like the real project by its totals only.

The question: on that store, does `memo projects status` make the four claims, within 4 KB of JSON, 1.5 KB compact and
2 s? The answer decides whether the private rerun on the real project (834.h) is worth running now, and what to fix in
cli-core first.

## Setup

- AMD Ryzen AI 9 HX 470, Linux 7.0, Node v24.19.0. memo from npm in a scratch folder
  (`npm i --prefix <dir> @wirecat/cli-memo@<version>`). Before: 0.131.21 with cli-core 0.560.0. After: 0.131.34 with
  cli-core 0.578.0.
- [`fixture.ts`](fixture.ts) builds the store through cli-core's store API: project HRB "Harbour site" and 4 linked
  chats, 1,006 messages, every name and text invented.
  - Client group (MAX account 11, role `client`): 801 messages from D−55 to D+8, D = 2026-10-19. Planted among
    them: the client's "1C" question on D−7, the owner's answer naming 1C on D−5, the owner's ask for 1,200 € on D and a
    reminder on D+7, no "paid" message after.
  - The owner's dialog with the client lead (role `client`), 2 messages.
  - A contractor dialog in a second account (Telegram account 22, role `contractor`), held only from D+1: the owner's
    question on D+1, the contractor's promise on D+2, the contractor's question on D+9.
  - A leads group with no role: 200 visitor requests.
- [`status.ts`](status.ts) seeds a fresh temporary store and runs
  `memo projects status HRB --context-query 1C --before-time 2026-11-02T10:00:00Z` as text, `--json` and `--compact`,
  7 rounds each (3 in the second run), with HOME, XDG_*, `WIRECAT_STATE_DIR` and `MESSAGING_STORE` in a temporary folder,
  `DBUS_SESSION_BUS_ADDRESS=disabled:` and `TZ=UTC`. The fixed end makes the answer the same on any day. No network,
  no keyring, no account.
- It checks the four claims on the JSON, counts message texts printed without their reference, and writes
  [`result.json`](result.json). Wall time is the median of the rounds of the whole process, Node start included.
- Run: `node status.ts <folder whose node_modules holds @wirecat/cli-memo> <rounds>`.

## Results

Before is memo 0.131.21. After is memo 0.131.34 (cli-core 0.578.0, PERF-75). All four claims pass after.

| Claim (e plan, section 7) | Expected | Before | After |
| --- | --- | --- | --- |
| 1. Money | `to_us` 1,200 EUR open since D, citing both asks | pass | pass: 1200.00 EUR open since 2026-10-19, both asks cited |
| 2. Contractor chat | `next: YOU since D+2` (was D+9 in the plan) | **differs**: owner since 2026-10-21 (D+2) | pass: owner since 2026-10-21 (D+2) |
| 3. Client group | "1C" quiet on their side since D−7 | pass | pass: quiet since 2026-10-12 (D−7), in JSON, compact and text |
| 4. Contractor chat partial | flagged, with its sync line | pass | pass: `partial`, `tg <profile> messages sync 555 --since-time 2026-09-03` |

Claim 2 passes because the expectation changed, not the output. The owner decided (NEED-2210 A) that "your move
since" counts from the first unanswered message. The answer was already D+2 in the first run. The plan said D+9. The
check in [`status.ts`](status.ts) now expects D+2. In the new JSON the claim reads from the chat row (`next`,
`waiting_since`), not from the old `reply_next` list.

| Limit | Target | Before | After |
| --- | ---: | ---: | ---: |
| JSON | ≤ 4,096 bytes | 11,169 | **3,998** |
| `--compact` | ≤ 1,536 bytes | 3,639 | **1,511** |
| Text (no target) | | 898 | 898 |
| Wall time, median | ≤ 2 s | 0.28 to 0.47 s by form (7 rounds) | text 0.44 s, JSON 0.32 s, compact 0.36 s (3 rounds) |
| The answer's own `duration_ms` | | 56 to 108 | 57 |
| Message texts printed without their reference | 0 | 0 | 0 in every form |

Both margins are thin. JSON has 98 bytes of room and compact has 25. One more field per chat row, or a few longer
names, can break a limit. Any change to the answer should rerun this page.

Where the JSON bytes go after (bytes of each top-level field of the answer):

| Field | Bytes |
| --- | ---: |
| `chats` | 1,260 |
| `questions` | 492 |
| `amounts` | 361 |
| `topics` | 307 |
| `promises` | 292 |
| `signals` | 105 |
| `window` | 71 |
| `money` | 68 |
| `name`, `project`, `purposes`, `key` | 38 |
| Keys of the answer's other parts, quotes, commas | about 1,000 |

The last row is the remainder to 3,998, not a measured field. The first run broke down the fields of `item`, the new
one breaks down the whole answer, so the two tables do not line up row by row.

## What was cut

- **Chat rows carry what three lists carried.** `last_message`, `reply_next` and `coverage` are gone as lists. Each
  chat row now has `last`, `next`, `waiting_since`, `addressed`, `overdue`, `held` and `sync_command`. Before, these
  three lists were 1,226 + 1,577 bytes and part of the 1,803 in the first run's remainder.
- **Unlisted counts instead of rows.** Others' questions in a group with no role, and others' promises found by word
  pattern in a group, are counted on the chat row as `unlisted`. They are no longer listed. These were the 5 visitor
  requests in `questions` and the 3 "фото пришлю позже" in `promises`.
- **Items are lighter.** They lost `signal`, `chat_title` and memo's per-item `title`. `finance` is left out when empty.
- **Compact hides more.** It leaves out project, window, purposes and signals.

## What it showed

- **All four claims hold, with references, in under half a second, within both size limits.** JSON is 3,998 bytes and
  compact is 1,511.
- **"Whose move" counts from the first unanswered message.** The contractor wrote on D+2 ("I'll send it tomorrow") and
  again on D+9 (a question). The owner answered neither, so the move has been the owner's since D+2. The plan said
  D+9. The owner chose D+2 (NEED-2210 A) and the plan and code now agree.
- **A topic is "quiet on their side" only after the owner has written about it.** Without the owner's D−5 message the
  JSON has the client's last mention but no `silent_since`, and the text prints no topic line at all. The plan's
  fixture did not say the owner must answer. This one adds that message.
- **The size cut came from dropping rows, not from squeezing fields.** The cuts above removed lists and per-item
  fields. The planted claims did not need any of them.

## Corrections

- **Correction, 2026-11-05.** Old claim: "Three of the four claims hold." It is now four of four. Claim 2 was a
  disagreement between plan and code, and the owner settled it.
- **Correction, 2026-11-05.** Old claim: "'Whose move' dates from the first unanswered message, not the last ... The
  plan expected D+9. Both readings are defensible; the plan and the code should pick one." The pick is made: first
  unanswered message (NEED-2210 A).
- **Correction, 2026-11-05.** Old claim: "Sizes are about 2.5 times the plan's limits. The JSON is 11.2 KB against
  4 KB and compact 3.6 KB against 1.5 KB." That held for memo 0.131.21. On 0.131.34 the JSON is 3,998 bytes and
  compact is 1,511, both inside the limits. The old guess that folding no-role chats and dropping pattern promises
  would cut most of the overage (inferred, not measured) was right in direction. The measured result is above.
- **Correction, 2026-11-05.** Old claim: the field table with `questions` at 2,963 bytes, `promises` at 1,861,
  `reply_next` at 1,577 and `last_message` at 1,226. Those fields no longer exist in that form. See the new table.

## Headroom (third run)

The second run left 98 bytes of room in JSON and 25 in compact, so the next field would break a limit. The third run
checks that removing what the answer says twice gives real room, without raising the limits. Same fixture, same
command, memo 0.131.40 with cli-core 0.583.0 ([cli-core#2527](https://github.com/WireCatLabs/cli-core/pull/2527),
[cli-memo#649](https://github.com/WireCatLabs/cli-memo/pull/649)), 3 rounds.

| Limit | Target | Second run | Third run | Room |
| --- | ---: | ---: | ---: | ---: |
| JSON | ≤ 4,096 bytes | 3,998 | **3,644** | 452 (11 %) |
| `--compact` | ≤ 1,536 bytes | 1,511 | **1,363** | 173 (11 %) |
| Text (no target) | | 898 | 898 | |
| Wall time, median | ≤ 2 s | 0.32 to 0.44 s | 0.30 to 0.42 s | |

All four claims pass, and no message text is printed without its reference, in every form.

What was removed:

- **JSON, said twice:** `item.window` (it is `meta.window`); a listed item's `chat` when its `ref` is a message of
  that chat; `basis` when it is `store`; a promise's `data.source`, which equals its `basis`; `who.name: null` and a
  chat row's `role: null`.
- **memo:** the `next_command` gaps, one per messenger with no signed-in profile, are one `missing` entry.
- **Compact:** each section header repeated the days and zone (`· 2026-10-12…2026-10-28 · UTC`). They are printed once,
  above the first section.

The largest saving is the `chat` field: 138 bytes on five listed items. The fixture's two `next_command` gaps exist
because no profile is signed in here. On a machine with profiles they are absent, so the real answer has more room.

## Not measured

- The real project: the private 834.h rerun on the installed releases is a separate run. Its counts go to the
  [project-state page](../README.md), its rows to cli-private.
- Accuracy beyond the four planted claims. The `unlisted` counts are not scored against labels, so we do not know how
  many real promises or questions the cut hides.
- Eight linked chats: cli-core's unit test checks compact size for eight chats. This store has four. After the third
  run the margins are 452 and 173 bytes, room for probably one or two more chat rows (inferred from row sizes, not
  measured).
- A store with the `payments` table (NEED-2159 B) or recorded finance. `finance` is empty here.
- Run-to-run variance: the second run has 3 timed rounds, the first 7. One machine.
