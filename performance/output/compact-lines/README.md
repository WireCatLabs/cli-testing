# Compact lines: bytes and tokens of `--compact` against JSON

Measured 2026-11-03 with tg 0.115.0 (cli-core 0.553.0) and memo 0.131.21 (cli-core 0.560.0), for the f stream of
TASK-834 (`--compact`).

## Why this was run

In the [project-state rerun](../../projects/project-state/README.md) the largest answer an agent read was a 731 KB
`messages list` in JSON, and both agents wrote their own Python to turn such answers into readable lines. The f plan
added `--compact`: one line per message with its reference, a footer for paging and gaps. Its estimate was about 2.2
times fewer bytes than JSON and "a bit more on tokens", and its acceptance for cli-core's renderer (F1) was compact at
most 45 % of JSON's bytes on 1,000 Cyrillic messages, with every reference and text kept. Nobody had counted tokens:
the earlier [output-size page](../../agents/output-size/README.md) used bytes / 4.

The questions: how many bytes and tokens does `--compact` save against `--json` and `--json=<fields>` on the commands
agents read most, does it keep every reference and text, and does `--brief` change a JSON answer (FIND-2135)? The
answer feeds the skill lines of F5 and F6 (which form an agent is told to read) and the budget step of F2.

## Setup

- AMD Ryzen AI 9 HX 470, Linux 7.0, Node v24.19.0. tg 0.115.0 and memo 0.131.21 from npm in a scratch folder
  (`npm i --prefix <dir> @wirecat/tg-cli@0.115.0 @wirecat/cli-memo@0.131.21`).
- [`seed.ts`](seed.ts): one Telegram group of 1,000 invented Cyrillic messages (147 characters on average) and four
  chats of 50, profile `bench`, account 100. Names and texts are made up.
- [`run.ts`](run.ts) seeds two fresh stores, one with each tool's own cli-core, so neither tool migrates the other's
  store. It runs each command offline as `--json`, `--json=<fields>`, `--json --brief` and `--compact`, with HOME,
  XDG_*, `WIRECAT_STATE_DIR`, `MESSAGING_STORE` and `TG_STATE_DIR` in a temporary folder,
  `DBUS_SESSION_BUS_ADDRESS=disabled:` and `TZ=UTC`. No network, no keyring, no account.
- Tokens: [`tokens.py`](tokens.py), run by `run.ts` as `uv run --with tiktoken==0.14.0`, encoding `o200k_base`, the
  same pin as the [knowledge-graph page](../../agents/knowledge-graph-memory/README.md). It is a public proxy, not
  the count Claude bills: Anthropic's tokenizer is not available offline.
- Run: `node run.ts <folder whose node_modules holds @wirecat/tg-cli and @wirecat/cli-memo>`. Output:
  [`result.json`](result.json). The answers are the same on every run; one round each.

## Results

Bytes, then tokens; the percentage is of the same command's `--json`.

| Command | `--json` | `--json=<fields>` | `--json --brief` | `--compact` |
| --- | ---: | ---: | ---: | ---: |
| tg messages list 1 --limit 1000 | 594,387 · 143,547 | 386,494 (65 %) · 86,545 (60 %) | 594,387 (100 %) · 143,547 | **315,252 (53 %) · 62,241 (43 %)** |
| tg messages list 1 --limit 50 | 30,499 · 7,384 | 20,098 (66 %) · 4,534 (61 %) | 30,499 (100 %) · 7,384 | 16,117 (53 %) · 3,217 (44 %) |
| tg messages list 1 'date>=2026-09-10 date<2026-09-12' | 37,398 · 9,036 | 24,502 (66 %) · 5,502 (61 %) | 37,398 (100 %) · 9,035 | 19,859 (53 %) · 3,944 (44 %) |
| tg search messages счёт --limit 50 | 33,523 · 7,972 | 19,223 (57 %) · 4,424 (55 %) | 22,623 (67 %) · 5,421 | 15,081 (45 %) · 3,088 (39 %) |
| memo search messages счёт --limit 50 | 33,037 · 7,846 | 18,737 (57 %) · 4,294 (55 %) | 22,137 (67 %) · 5,295 | 14,926 (45 %) · 3,048 (39 %) |
| tg chats list | 891 · 259 | 454 (51 %) · 133 | 891 (100 %) · 261 | 210 (24 %) · 61 (24 %) |

Fields: `ref,timestamp,sender_name,text` for `messages list`, `ref,timestamp,sender_name,excerpt` for searches,
`ref,title` for `chats list`.

Checks on the 1,000-message list:

| Check | Result |
| --- | --- |
| Compact rows against JSON items | 1,000 of 1,000, every `#id` present |
| Texts kept whole (all under the 400-character cap) | 1,000 of 1,000 |
| Footer | `missing` and `next` as in JSON; `complete: false` |
| Two-sided window (F3), `date>=2026-09-10 date<2026-09-12` | 62 messages, all inside, oldest first |
| JSON answer over 256 KiB names `--compact` as a next step (F2) | no: its only step is `messages sync` |

## What it showed

- **On tokens, compact meets the plan; on bytes, `messages list` misses it.** A 1,000-message list in compact is 43 %
  of JSON's tokens but 53 % of its bytes, against F1's 45 % bytes target. Searches meet it (45 %). The plan guessed
  tokens would save more than bytes, and they do: keys, quotes and ids cost more tokens per byte than Cyrillic text.
  For an agent the token number is the one that counts, so the 45 % target is met where it matters, by a margin of
  2 points.
- **Compact beats trimmed JSON by about a third.** Against `--json=ref,timestamp,sender_name,text` it saves another
  28 % of tokens on lists and 30 % on searches. A skill line that says "read with `--compact`" is worth more than one
  that lists fields.
- **The text itself is now most of what is left.** A 147-character Cyrillic text is about 44 tokens; the compact row
  around it adds about 18. Reading less (a window, a digest, `projects status`) is the next lever, as the plan says
  (FIND-2134).
- **`--brief` does nothing to `tg messages list`** (same bytes as `--json`), so FIND-2135 still holds there in tg
  0.115.0. It does cut searches by a third.
- **The 594 KB answer carries no step towards `--compact`.** That is F2's budget step, open in cli-core#2460, not yet
  in a tg release.

## Not measured

- Claude's own token count: `o200k_base` is a proxy, and the ratio between forms is what to read, not the totals.
- `projects status` and `projects evidence`: the status sizes are on [the status fixture page](../../projects/project-state/status-fixture/README.md);
  `projects evidence --compact` needs the F4 release.
- Long texts over the 400-character cap, attachments, forwarded messages, voice transcripts: none in this store.
- max, wa and drive: they share cli-core's renderer (F1) but were not run.
- An agent's whole session: the 834.h rerun measures that on the real project.
