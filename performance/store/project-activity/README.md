# Project activity: every project's linked chats in one read

## Why

The owner opened Analytics → Projects in WireCat Desktop and said there was almost nothing there, while work was going
on. The section counted only tasks and memories per project, and his projects have almost none; the activity is in
the chats linked to each project. The only read of those chats was `memo projects status`, one heavy call per project.

Question: can one call give every project's linked-chat count, messages in a period, last activity and busiest chats
fast enough for a dashboard card that reloads on every period switch? It fed the decision to add cli-core's
`projectActivity` (store read `MessagesStore.chatActivityCounts`) and `memo stats projects show`.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, Linux 7.0, Node 24.19.0, `node:sqlite`.
- cli-core: branch `feat/project-activity` (after 0.633.0), built with `pnpm build`.
- Data: synthetic only. The owner's store has about 412,000 messages, 2,632 chats, 5 projects and 22 linked chats
  (12 and 10); the bench builds that shape: 4 accounts, 2,632 chats (every sixth muted), 412,000 messages over two
  years with about 4% in the linked chats, projects 1 and 2 with 12 and 10 linked chats.
- Command: `node bench.mjs <cli-core checkout> [messages] [chats]` ([bench.mjs](bench.mjs)), 11 rounds per window,
  median and max.

## Results

| Window | Median | Max | Project 1 |
| --- | --- | --- | --- |
| 7 days | 1.2 ms | 5.5 ms | 12 chats (2 muted), 314 messages |
| 30 days | 2.3 ms | 3.0 ms | 12 chats (2 muted), 630 messages |
| All time | 30.6 ms | 33.9 ms | 12 chats (2 muted), 10,855 messages |

On the owner's own store, read-only with `sqlite3 -readonly` and totals only, the same chats hold 2,984 messages in
30 days for project 1 (12 chats) and 1,095 for project 2 (10 chats, 1 muted); a single SQL over them took 71 ms
including the `sqlite3` start.

## What it showed

One read per linked chat over the `(chat_id, sent_at)` index costs about what the chat holds in the window. A 30-day
card is a few milliseconds; all time is about 30 ms because it counts every message of the linked chats. No index or
cache is needed at this scale.

## Not measured

- Chats with millions of messages each: all time grows with the messages of the linked chats.
- The memo process start and JSON output around the read (the Desktop calls it through memo's command server).
- Many projects with thousands of links: the read is one statement per linked chat, so it grows with links.
