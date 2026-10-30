import { readFileSync } from "node:fs"

const rows = readFileSync(process.argv[2], "utf8")
  .trim()
  .split("\n")
  .filter((l) => l.startsWith("{"))
  .map((l) => JSON.parse(l))
const rt = (r) => r.runtime.split(" ")[0]
for (const r of rows.filter((r) => r.step && !r.step.startsWith("write")))
  console.log(
    rt(r),
    r.step,
    r.ms ?? "",
    r.extraBytes ? `${(r.extraBytes / 1e6).toFixed(1)}MB` : "",
    r.textBytes ? `${(r.textBytes / 1e6).toFixed(1)}MB text` : "",
  )
console.log("\n# query summary")
for (const r of rows.filter((r) => r.summary)) console.log(rt(r), r.phase, "p50", r.p50, "p95", r.p95)
console.log("\n# writes")
for (const r of rows.filter((r) => r.step?.startsWith("write")))
  console.log(rt(r), r.phase, r.step, r.insertMsPerRow, r.updateMsPerRow)
console.log("\n# per query (node | bun p50 ms, counts notes/docs)")
const qs = rows.filter((r) => r.query)
for (const ph of [...new Set(qs.map((r) => r.phase))]) {
  console.log("##", ph)
  for (const q of [...new Set(qs.map((r) => r.query))]) {
    const n = qs.find((r) => r.phase === ph && r.query === q && rt(r) === "node")
    const b = qs.find((r) => r.phase === ph && r.query === q && rt(r) === "bun")
    console.log(
      `  ${q.padEnd(26)} ${String(n?.p50).padStart(8)} | ${String(b?.p50).padStart(8)}  ${n?.counts?.notes}/${n?.counts?.documents} ${n?.err ?? ""}`,
    )
  }
}
