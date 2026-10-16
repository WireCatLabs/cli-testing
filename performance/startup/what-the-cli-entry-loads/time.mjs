// usage: node time.mjs <runs> "<ENV=v,ENV2=v|-> <command…>" … — runs the variants alternately, prints median and min ms.
import { spawnSync } from "node:child_process"

const [, , runs, ...variants] = process.argv
const res = Object.fromEntries(variants.map((v) => [v, []]))
const med = (a) => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]
}
for (let i = 0; i < Number(runs); i++)
  for (const v of variants) {
    const [envs, ...cmd] = v.split(" ")
    const env = { ...process.env }
    for (const kv of envs === "-" ? [] : envs.split(",")) {
      const [k, val] = kv.split("=")
      env[k] = val
    }
    const t = process.hrtime.bigint()
    spawnSync(cmd[0], cmd.slice(1), { env, stdio: "ignore" })
    res[v].push(Number(process.hrtime.bigint() - t) / 1e6)
  }
for (const v of variants)
  process.stdout.write(`${Math.round(med(res[v]))} ms  min ${Math.round(Math.min(...res[v]))}  ${v}\n`)
