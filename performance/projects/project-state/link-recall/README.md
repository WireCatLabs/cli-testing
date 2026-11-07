# Link proposal recall on a synthetic project

## Why

In the third PMED run (`project-state`), `memo relationships scan` recovered 4 of the project's 15 removed links
after two rounds (27 %), against a target of 80 %. It never proposed a Telegram chat. The question: why does the scan
stop at the first messenger, and does spreading within one run reach the rest without proposing wrong links? The
answer fed [cli-core#2639](https://github.com/WireCatLabs/cli-core/pull/2639).

## Setup

- Script: [`recall.test.ts`](https://github.com/WireCatLabs/cli-core/blob/fix/relationships-scan-recall/src/services/link-scorers/recall.test.ts)
  in cli-core. It builds an invented store with code; no real messages.
- The project is shaped like PMED. Its client groups are in MAX. The contractor and the 1C person have dialogs in
  Telegram, and three people are linked across both messengers by identity. Gold: 8 chats and 7 people. One gold
  link, a reminder bot's dialog, has no signal at all.
- Decoys: the owner's team chat, a 40-person market group the client people are in, the owner's dialogs with client
  people, a namesake of the 1C person in Telegram, and a partner who is in another project.
- Each round scans with `write: false`. The owner then confirms the proposals that are in the gold set, the way the
  PMED run emulated it.
- Command: `pnpm vitest run src/services/link-scorers/recall.test.ts --maxWorkers=1` in cli-core. The baseline is the
  same test against the scorers of cli-core origin/main `b26074120`.

## Results

| | Before (b26074120) | After (#2639) |
| --- | --- | --- |
| Recall after round 1 | 7 % | 93 % |
| Recall after round 2 | 27 % | 93 % (100 % of findable) |
| Precision | 100 % | 74 % |
| False proposals | 0 | 5 |
| Proposed by name only | 0 | 0 |
| Telegram links reached | 0 of 3 | 2 of 3 |

## What it showed

- The scan spread only from confirmed links, so it took one owner round per step. Telegram dialogs are three or four
  steps from the group that names the project, so two rounds never reached them.
- People who wrote 1 to 4 messages in a small group were never proposed, so the chats behind them were never reached.
- With spreading, precision fell to 74 %, inside the plan's limits (at least 60 %, at most 5 false proposals). The
  false proposals are the owner's dialogs with client people, the owner's team chat and one of its members, and the
  market group.

## Not measured

- The real store: agents may not read it. A contact reachable only by the project name in messages stays unfound.
  Inflected Russian forms of the name are not matched.
- Scan time on the 2 000-chat fixture. On this fixture, two scans take under 1 s.
