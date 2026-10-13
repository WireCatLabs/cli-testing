import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const [dist, runsDir, label = ""] = process.argv.slice(2)
const load = (file) => import(pathToFileURL(join(resolve(dist), file)).href)
const { listRuns, findRun, readEvents } = await load("cli/runs/run.js")
const { searchRuns } = await load("cli/runs/search.js")

const all = listRuns(runsDir)
const someId = all[Math.floor(all.length / 2)]?.runId
const cases = {
  "runs list (20)": () => listRuns(runsDir, { atLeast: 21 }).slice(0, 20),
  "runs show <id>": () => readEvents(findRun(runsDir, someId).dir),
  "search --status failed --error-code timeout": () => searchRuns(runsDir, { status: "failed", errorCode: "timeout" }),
  "search --error-code rate_limited": () => searchRuns(runsDir, { errorCode: "rate_limited" }),
  "search --operation messages.send": () => searchRuns(runsDir, { operation: "messages.send" }),
  "search --since-time 1d --status failed": () => searchRuns(runsDir, { since: "1d", status: "failed" }),
  "search --error-code no_such_code (miss)": () => searchRuns(runsDir, { errorCode: "no_such_code" }),
  "search no-such-text (miss)": () => searchRuns(runsDir, { query: "no-such-text" }),
}
const rounds = 11
for (const [name, body] of Object.entries(cases)) {
  const times = []
  for (let r = 0; r < rounds; r++) {
    const start = performance.now()
    body()
    times.push(performance.now() - start)
  }
  times.sort((a, b) => a - b)
  process.stdout.write(`${label}\t${name}\t${times[Math.floor(rounds / 2)].toFixed(1)} ms` + "\n")
}
