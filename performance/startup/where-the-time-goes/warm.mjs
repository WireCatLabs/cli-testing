// usage: node warm.mjs <tool root> <n> <args...>: what an in-process request costs once the code is loaded,
// as serve's relay and the MCP server pay it: run() rebuilds the program for each request.
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const log = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)

const [root, n, ...args] = process.argv.slice(2)
const program = await import(pathToFileURL(join(root, "dist/program.js")).href)
const { createProgram } = await import(
  pathToFileURL(join(root, "node_modules/@wirecat/cli-core/dist/cli/index.js")).href
)
const write = process.stdout.write.bind(process.stdout)
const ewrite = process.stderr.write.bind(process.stderr)
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const time = async (f) => {
  const times = []
  for (let i = 0; i < 5; i++) await f()
  for (let i = 0; i < Number(n); i++) {
    const t = performance.now()
    await f()
    times.push(performance.now() - t)
  }
  return Math.round(median(times) * 10) / 10
}
const build = await time(() => createProgram(program.definition, { out: () => {}, err: () => {} }))
process.stdout.write = () => true
process.stderr.write = () => true
const request = await time(() => program.run(args))
process.stdout.write = write
process.stderr.write = ewrite
log(JSON.stringify({ args, build_program_ms: build, whole_request_ms: request }))
process.exit(0)
