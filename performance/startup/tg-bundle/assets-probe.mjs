// assets-probe.mjs: run from inside an installed dist/bundle; checks every file path the rewrite produced exists
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const say = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)

const here = new URL(".", import.meta.url)
const seen = new Set()
for (const f of readdirSync(here)) {
  if (!f.endsWith(".js")) continue
  const src = readFileSync(new URL(f, here), "utf8")
  for (const m of src.matchAll(
    /new URL\("([^"]+)", new URL\("([^"]+)", (import\.meta\.url|import\.meta\.resolve\("([^"]+)"\))\)\.href\)/g,
  )) {
    const [, asset, place, , pkg] = m
    const base = pkg ? import.meta.resolve(pkg) : import.meta.url
    const file = fileURLToPath(new URL(asset, new URL(place, base)))
    const key = `${pkg ?? "tg"} ${place} -> ${asset}`
    if (seen.has(key)) continue
    seen.add(key)
    say(existsSync(file) ? "ok     " : "MISSING", key)
  }
  for (const m of src.matchAll(/new URL\("([^"]+)", import\.meta\.url\)\.href/g)) {
    const key = `tg place ${m[1]}`
    if (seen.has(key)) continue
    seen.add(key)
    say(existsSync(fileURLToPath(new URL(m[1], import.meta.url))) ? "ok     " : "absent ", key)
  }
}
