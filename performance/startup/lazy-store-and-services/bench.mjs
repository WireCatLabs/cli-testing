// node bench.mjs <rounds> <label=[setup;;]cmd>...  runs each case once per round, alternating, after WARM untimed runs
// (default 1) and an untimed setup (e.g. swapping the dist under test); prints medians in ms
import { execFileSync } from "node:child_process"

const print = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)
const rounds = +process.argv[2]
const cases = process.argv.slice(3).map((a) => {
  const i = a.indexOf("=")
  return [a.slice(0, i), a.slice(i + 1)]
})
const times = Object.fromEntries(cases.map(([k]) => [k, []]))
for (let r = 0; r < rounds; r++)
  for (const [k, cmd] of cases) {
    const [setup, run] = cmd.includes(";;") ? cmd.split(";;") : ["", cmd]
    if (setup) execFileSync("sh", ["-c", setup], { stdio: "inherit" })
    for (let w = 0; w < +(process.env.WARM ?? 1); w++)
      execFileSync("sh", ["-c", run], { stdio: ["ignore", "ignore", "ignore"] })
    const t = process.hrtime.bigint()
    execFileSync("sh", ["-c", run], { stdio: ["ignore", "ignore", "inherit"] })
    times[k].push(Number(process.hrtime.bigint() - t) / 1e6)
  }
const med = (a) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
for (const [k, a] of Object.entries(times))
  print(
    `${k.padEnd(14)} median ${med(a).toFixed(0)} ms  min ${Math.min(...a).toFixed(0)}  max ${Math.max(...a).toFixed(0)}  n=${a.length}`,
  )
