# Architecture

Published as `@leemour/cli-tasks`. The `tasks` commands are built in cli-messaging, which stores
tasks behind `TaskStore` and mounts the commands into tg-cli and max-cli.

## The modules

| File | What |
|---|---|
| [`src/model.ts`](../../src/model.ts) | `Task`, its kinds, states and origins, `closeTask` and `TaskError` |
| [`src/store.ts`](../../src/store.ts) | `TaskStore`, the host's side, and `matches`, the filter every store applies the same way |
| [`src/service.ts`](../../src/service.ts) | `createTaskService`: add, close, list, stats over a store — one method per command (`tasks close --as done\|dismissed`) |
| [`src/testing/`](../../src/testing/memory-store.ts) | `memoryTaskStore`, published as `/testing` |

## The two lines this package does not cross

1. **Storage is the host's.** `cli-messaging` keeps tasks in a file of its own, `tasks.db`, beside
   the message store and outside its migrations. This package has no SQLite and no filesystem; the
   lint rule in [`biome.json`](../../biome.json) refuses them under `src/`.
2. **A locator is a string.** `msg:…` today; an email or a note later. Resolving it to something a
   person can read is the host's job, so this package imports nothing from cli-messaging.

## Who consumes it

`cli-messaging` depends on an exact version, implements `TaskStore`, runs the rules that add and
close tasks, and mounts the commands. tg-cli and max-cli get them by pinning cli-messaging.
