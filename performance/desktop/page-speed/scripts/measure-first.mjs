// First request on a freshly started `memo commands --serve`, then the same request again. Timings only.
import { spawn } from "node:child_process"
import { createInterface } from "node:readline"

const bin = process.env.MEMO_BIN ?? "memo"
const asks = JSON.parse(process.argv[2])
const fresh = () =>
  new Promise((resolve) => {
    const t = performance.now()
    const child = spawn(bin, ["commands", "--serve"], { stdio: ["pipe", "pipe", "ignore"] })
    const lines = createInterface({ input: child.stdout })
    const waiting = new Map()
    let id = 0
    const send = (argv) =>
      new Promise((done) => {
        const n = ++id
        const t0 = performance.now()
        waiting.set(n, (v) => done({ ms: Math.round(performance.now() - t0), code: v.code }))
        child.stdin.write(`${JSON.stringify({ id: n, argv })}\n`)
      })
    lines.on("line", (l) => {
      const v = JSON.parse(l)
      if (v.ready) resolve({ child, ready: Math.round(performance.now() - t), send })
      else waiting.get(v.id)?.(v)
    })
  })
for (const argv of asks) {
  const xs = []
  for (let i = 0; i < 3; i++) {
    const s = await fresh()
    const first = await s.send(argv)
    const second = await s.send(argv)
    xs.push([s.ready, first.ms, second.ms, first.code])
    s.child.stdin.end()
    s.child.kill()
  }
  process.stdout.write(
    `${JSON.stringify({
      argv: argv.slice(0, 2).join(" "),
      runs: xs.map(([r, f, s, c]) => ({ ready: r, first: f, second: s, code: c })),
    })}\n`,
  )
}
