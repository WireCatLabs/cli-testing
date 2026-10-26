// A vitest reporter: run with --experimental.importDurations.limit=100000 --reporter=<this file>.
// Sums each module's import time across all test files; prints the top 40 by self time: self ms, total ms, files, ext, module.
export default class ImportReporter {
  onTestRunEnd(modules) {
    const total = new Map()
    for (const m of modules) {
      const d = m.diagnostic().importDurations ?? {}
      for (const [id, v] of Object.entries(d)) {
        const key = id.replace(/.*node_modules\/\.pnpm\/[^/]+\/node_modules\//, "nm:").replace(`${process.cwd()}/`, "")
        const t = total.get(key) ?? { self: 0, total: 0, n: 0, external: v.external }
        t.self += v.selfTime ?? 0
        t.total += v.totalTime ?? 0
        t.n++
        total.set(key, t)
      }
    }
    const rows = [...total].sort((a, b) => b[1].self - a[1].self).slice(0, 40)
    for (const [k, v] of rows)
      process.stdout.write(`${[Math.round(v.self), Math.round(v.total), v.n, v.external ? "ext" : "", k].join(" ")}\n`)
  }
}
