// node score.mjs <cli-core dir> <in.json> <out.json> — scores pairs with cli-core's own scorer, as tasks related does:
// views are the task's own text, then that text with its source message; time is the message's send time.
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const [core, input, output] = process.argv.slice(2)
const { prepareTask, compareViews, compareTasks } = await import(join(core, "dist/search/task-similarity.js"))
const { tasks, pairs } = JSON.parse(readFileSync(input, "utf8"))
const byId = new Map(tasks.map((task) => [task.id, task]))

const viewsOf = (task) => {
  const base = {
    title: task.title,
    description: task.description ?? "",
    createdAt: new Date(task.sentMs),
    ...(task.person ? { person: task.person } : {}),
    ...(task.category ? { category: task.category } : {}),
  }
  const own = prepareTask(base)
  return task.message === undefined
    ? [own]
    : [own, prepareTask({ ...base, message: { text: task.message, sentAt: new Date(task.sentMs) } })]
}

const scored = pairs.map(({ a, b, ...rest }) => {
  const one = byId.get(a)
  const other = byId.get(b)
  const sameSource = one.messageId !== undefined && one.messageId === other.messageId
  const replyChain = !sameSource && other.messageId !== undefined && (one.chain ?? []).includes(other.messageId)
  const similarity = sameSource
    ? compareTasks(viewsOf(one)[0], viewsOf(other)[0])
    : compareViews(viewsOf(one), viewsOf(other), { replyChain })
  return { a, b, ...rest, ...similarity }
})
writeFileSync(output, `${JSON.stringify(scored, null, 1)}\n`, { mode: 0o600 })
