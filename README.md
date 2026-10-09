# @leemour/cli-tasks

Things still waiting on you — an unanswered question, a request, a mention, a promise — kept as a list
an agent can read and close. It knows no messenger and no database: a task points at what it is about
by a locator, and the host stores the tasks.

Used by [`cli-messaging`](https://github.com/leemour/cli-messaging), which adds tasks from the
messages it reads and gives tg-cli and max-cli the same `tasks` commands. What changed in each
version is in [`CHANGELOG.md`](CHANGELOG.md).

```ts
import { createTaskService } from "@leemour/cli-tasks"
import { memoryTaskStore } from "@leemour/cli-tasks/testing"

const tasks = createTaskService({ store: memoryTaskStore() })
const question = {
  source: "msg:tg:chat-1:100",
  sourceKind: "message",
  account: "tg:owner",
  group: "chat-1",
  kind: "question",
  origin: "rule",
} as const

const { task } = await tasks.add(question)
await tasks.close(task.id, { as: "dismissed", by: "owner", reason: "no-reply-needed" })
await tasks.add(question) // { task: <the same task, still dismissed>, created: false }
```

## What is in it

| | |
|---|---|
| `Task` | the source locator, the account, a group key for listing, `kind`, `state`, `origin`, the times — never the text it points at |
| `closeTask` | the one state rule: an `open` task becomes `done` or `dismissed`, and a closed one stays closed |
| `TaskStore` | what the host implements: get, the tasks on one source, insert, update, list |
| `createTaskService` | `add`, `close`, `list`, `stats`. A rule makes at most one task per source in an account; a person or an agent may add one of another kind |
| `/testing` | `memoryTaskStore` |

## Releasing

`bin/release` on a clean `main` publishes the version in `package.json` through GitHub Actions and
tags it; `bin/release --local` publishes from this machine with the npm token from the keyring. When
npm already has the version, it commits the next free one and publishes that.

## Licence

MIT.
