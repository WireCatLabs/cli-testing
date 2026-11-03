# Project status on an invented store

Measured 2026-11-03 with memo 0.131.21 (cli-core 0.560.0), for the e stream of TASK-834 (`projects status`).

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

- AMD Ryzen AI 9 HX 470, Linux 7.0, Node v24.19.0. memo 0.131.21 from npm in a scratch folder
  (`npm i --prefix <dir> @wirecat/cli-memo@0.131.21`), its cli-core 0.560.0.
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
  7 rounds each, with HOME, XDG_*, `WIRECAT_STATE_DIR` and `MESSAGING_STORE` in a temporary folder,
  `DBUS_SESSION_BUS_ADDRESS=disabled:` and `TZ=UTC`. The fixed end makes the answer the same on any day. No network,
  no keyring, no account.
- It checks the four claims on the JSON, counts message texts printed without their reference, and writes
  [`result.json`](result.json). Wall time is the median of 7 runs of the whole process, Node start included.
- Run: `node status.ts <folder whose node_modules holds @wirecat/cli-memo> 7`.

## Results

| Claim (e plan, section 7) | Expected | Observed | |
| --- | --- | --- | --- |
| 1. Money | `to_us` 1,200 EUR open since D, citing both asks | 1200.00 EUR open since 2026-10-19, both asks cited, `asks: 2` | pass |
| 2. Contractor chat | `next: YOU since D+9` | `next: owner` since 2026-10-21 (D+2) | **differs** |
| 3. Client group | "1C" quiet on their side since D−7 | quiet since 2026-10-12 (D−7), in JSON, compact and text | pass |
| 4. Contractor chat partial | flagged, with its sync line | `partial`, 3 held, `tg <profile> messages sync 555 --since-time 2026-09-03` | pass |

| Limit | Target | Observed |
| --- | ---: | ---: |
| JSON | ≤ 4,096 bytes | **11,169** |
| `--compact` | ≤ 1,536 bytes | **3,639** |
| Text (no target) | | 898 |
| Wall time, median of 7 | ≤ 2 s | 0.28 to 0.47 s by form; the answer's own `duration_ms` 56 to 108 |
| Message texts printed without their reference | 0 | 0 in every form |

Where the JSON bytes go (bytes of each field of `item`):

| Field | Bytes | What fills it on this store |
| --- | ---: | --- |
| `questions` | 2,963 | 7 open questions; 5 are visitors' requests in the leads group |
| `promises` | 1,861 | 4 promises by word pattern; 3 are "фото пришлю позже" in the client group's filler |
| `reply_next` | 1,577 | one row per chat |
| `last_message` | 1,226 | one row per chat |
| `chats` | 682 | |
| `amounts`, `topics`, `coverage` and the rest of `item` | 1,803 | |
| `next`, `missing`, `meta` | about 1,050 | |

## What it showed

- **Three of the four claims hold, with references, in under a second.** The money row cites both asks, the quiet
  topic carries its date, and the contractor chat is flagged partial with the command that syncs it.
- **"Whose move" dates from the first unanswered message, not the last.** The contractor wrote on D+2 ("I'll send it
  tomorrow") and again on D+9 (a question); the owner answered neither. The answer says the move has been the owner's
  since D+2. The plan expected D+9. Both readings are defensible; the plan and the code should pick one.
- **A topic is "quiet on their side" only after the owner has written about it.** Without the owner's D−5 message the
  JSON has the client's last mention but no `silent_since`, and the text prints no topic line at all. The plan's
  fixture did not say the owner must answer; this one adds that message.
- **Sizes are about 2.5 times the plan's limits.** The JSON is 11.2 KB against 4 KB and compact 3.6 KB against
  1.5 KB. Most of it is rows the owner would not call status: questions from the leads group, which has no role, and
  promises guessed from words in ordinary chatter. Folding a chat without a role into one line, and capping pattern
  promises, would cut most of the overage (inferred, not measured).

## Not measured

- The real project: the private 834.h rerun on the installed releases is a separate run; its counts go to the
  [project-state page](../README.md), its rows to cli-private.
- Accuracy beyond the four planted claims: the false positives in `promises` and `questions` are counted above, not
  scored against labels.
- Eight linked chats: cli-core's unit test checks compact size for eight chats; this store has four.
- A store with the `payments` table (NEED-2159 B) or recorded finance: `finance` is empty here.
- Run-to-run variance beyond the 7 timed rounds; one machine.
