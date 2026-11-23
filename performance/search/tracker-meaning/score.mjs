// node score.mjs results/<model>-<items>-<variant>.json ... — prints the README's tables for each result file.
import { readFileSync } from "node:fs"

const KINDS = ["exact", "forms", "typo", "paraphrase", "question"]
const pct = (x) => `${Math.round(x * 100)}%`
const two = (x) => x.toFixed(2)
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

const metrics = (rows, rank) => {
  const ranks = rows.map(rank)
  const hit = (k) => ranks.filter((r) => r !== null && r <= k).length / rows.length
  const mrr = ranks.reduce((sum, r) => sum + (r !== null && r <= 10 ? 1 / r : 0), 0) / rows.length
  return { n: rows.length, h1: hit(1), h3: hit(3), h10: hit(10), mrr }
}
const line = (label, m) => `| ${label} | ${m.n} | ${pct(m.h1)} | ${pct(m.h3)} | ${pct(m.h10)} | ${two(m.mrr)} |`
const head = "| | n | hit@1 | hit@3 | hit@10 | MRR@10 |\n|---|---:|---:|---:|---:|---:|"

for (const file of process.argv.slice(2)) {
  const r = JSON.parse(readFileSync(file, "utf8"))
  const out = []
  out.push(`## ${r.model}, ${r.items} items, comments ${r.variant} (cli-core ${r.core_version})`)
  for (const arm of ["words", "words+meaning"]) {
    const rows = r.queries.filter((q) => q.arm === arm)
    out.push(`\n### ${arm}, tracker lane\n\n${head}`)
    for (const kind of KINDS)
      out.push(
        line(
          kind,
          metrics(
            rows.filter((q) => q.kind === kind),
            (q) => q.lane_rank,
          ),
        ),
      )
    out.push(
      line(
        "**all**",
        metrics(rows, (q) => q.lane_rank),
      ),
    )
    for (const target of ["T", "C", "P"])
      out.push(
        line(
          { T: "issue targets", C: "comment targets", P: "project targets" }[target],
          metrics(
            rows.filter((q) => q.target.startsWith(target)),
            (q) => q.lane_rank,
          ),
        ),
      )
    const full = metrics(rows, (q) => q.full_rank)
    const recall = (field) => rows.reduce((sum, q) => sum + q[field] / r.accounts, 0) / rows.length
    out.push(
      `\nFull search all: hit@1 ${pct(full.h1)}, hit@10 ${pct(full.h10)}, MRR@10 ${two(full.mrr)}. ` +
        `Recall@10 (both account copies): lane ${pct(recall("lane_found"))}, full ${pct(recall("full_found"))}. ` +
        `Short comments in the lane's top 10: ${rows.reduce((s, q) => s + q.lane_short_comments, 0)} over ${rows.length} queries.`,
    )
  }
  const m = r.meaning
  const floorCut = m.filter((q) => q.raw_rank !== null && q.raw_rank <= 10 && q.rank_after_floor === null).length
  out.push(
    `\n### meaning alone (nearestTracker, warm model)\n\n${head}\n${line(
      "all",
      metrics(m, (q) => q.rank_after_floor),
    )}`,
  )
  out.push(
    line(
      "before the floor",
      metrics(m, (q) => q.raw_rank),
    ),
  )
  out.push(
    `\nTargets in the raw top 10 that the floor (${r.floor}) dropped: ${floorCut}. Median target cosine ` +
      `${median(m.map((q) => q.cosine).filter((c) => c !== null))}; short comments in the raw ` +
      `top 10 above the target: ${m.reduce((s, q) => s + q.short_in_raw_top10, 0)}.`,
  )
  const l = r.latency
  out.push(
    `\n### cost\n\nSeed ${r.seed_seconds} s. Embedded ${r.embed.chunks_embedded} chunk texts in ${r.embed.seconds} s ` +
      `(${(r.embed.chunks_embedded / r.embed.seconds).toFixed(1)}/s; ${(r.after.chunks / r.embed.seconds).toFixed(1)} chunks/s ` +
      `counting both accounts' chunks). Rows ${r.after.tracker_rows}, chunks ${r.after.chunks}, distinct texts ` +
      `${r.after.distinct_chunk_texts}, vectors ${r.after.vectors}; short-comment chunks ${r.after.short_comment_chunks}, ` +
      `their vectors ${r.after.short_comment_vectors}. Store ${(r.before.store_bytes / 1e6).toFixed(1)} → ` +
      `${(r.after.store_bytes / 1e6).toFixed(1)} MB.`,
  )
  out.push("\n| ms (n) | p50 | p95 |\n|---|---:|---:|")
  for (const [name, v] of Object.entries(l)) out.push(`| ${name} (${v.n}) | ${v.p50} | ${v.p95} |`)
  process.stdout.write(`${out.join("\n")}\n\n`)
}
