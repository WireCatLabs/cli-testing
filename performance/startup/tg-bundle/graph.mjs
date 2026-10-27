// graph.mjs <bundle dir>: static and dynamic import edges between chunks, from the entry
import { readFileSync } from "node:fs"
import { join } from "node:path"

const say = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)

const dir = process.argv[2]
const edges = (file) => {
  const src = readFileSync(join(dir, file), "utf8")
  const stat = [...src.matchAll(/^import\s*(?:[^"';]*?from\s*)?["']([^"']+)["']/gm)].map((m) => m[1])
  const dyn = [...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1])
  return { stat, dyn, size: src.length }
}
const seen = new Map()
const walk = (file) => {
  if (seen.has(file)) return
  const e = edges(file)
  seen.set(file, e)
  for (const s of e.stat) if (s.startsWith("./")) walk(s.slice(2))
}
const entry = process.argv[3] ?? "tg.js"
walk(entry)
let total = 0
for (const [f, e] of seen) {
  total += e.size
  say(
    f,
    `${(e.size / 1024) | 0}KB`,
    "ext:",
    e.stat.filter((s) => !s.startsWith("./")).join(","),
    "dyn:",
    e.dyn.join(","),
  )
}
say("static from", entry, ":", seen.size, "files", (total / 1024) | 0, "KB")
