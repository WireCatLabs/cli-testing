// node --import ./trace.mjs <script>: counts loaded modules per package and prints them at exit.

import { statSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath } from "node:url"

const seen = new Map()
const packageOf = (url) => {
  if (!url.startsWith("file:")) return url.startsWith("node:") ? "node:" : "other"
  const path = fileURLToPath(url)
  const at = path.lastIndexOf("/node_modules/")
  if (at < 0) return "(the tool itself)"
  const rest = path.slice(at + 14).split("/")
  return rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0]
}
registerHooks({
  load(url, context, next) {
    const result = next(url, context)
    if (!seen.has(url)) {
      let bytes = 0
      try {
        bytes = url.startsWith("file:") ? statSync(fileURLToPath(url)).size : 0
      } catch {}
      seen.set(url, bytes)
    }
    return result
  },
})
process.on("exit", () => {
  const byPackage = new Map()
  for (const [url, bytes] of seen) {
    const name = packageOf(url)
    const one = byPackage.get(name) ?? { files: 0, kb: 0 }
    one.files++
    one.kb += bytes / 1024
    byPackage.set(name, one)
  }
  const rows = [...byPackage].sort((a, b) => b[1].kb - a[1].kb)
  process.stderr.write(
    `${JSON.stringify({ files: seen.size, packages: Object.fromEntries(rows.map(([n, v]) => [n, { files: v.files, kb: Math.round(v.kb) }])) })}\n`,
  )
})
