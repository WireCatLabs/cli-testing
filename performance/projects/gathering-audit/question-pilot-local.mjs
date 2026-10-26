import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs"
import { performance } from "node:perf_hooks"

const [consent, casePath, output, binary] = process.argv.slice(2)
assert.equal(consent, "--live-local")
assert.ok(binary)
const bytes = readFileSync(casePath)
const scenario = JSON.parse(bytes)
const sha = (value) => createHash("sha256").update(value).digest("hex")
const fd = openSync(output, "wx", 0o600)
try {
  const runs = []
  const methods = scenario.max_profile
    ? ["literal_question", "curated_keywords", "lexical_discovery"]
    : ["literal_question", "curated_keywords"]
  for (const question of scenario.questions)
    for (const method of methods) {
      const text = method === "curated_keywords" ? `(${question.keywords})` : question.query
      const query = `chat:"${scenario.scope.chat}" ${text} date:["${scenario.scope.since}" TO "${scenario.scope.before}"]`
      const args = [
        ...(scenario.max_profile ? [scenario.max_profile] : []),
        "search",
        "messages",
        query,
        "--limit",
        String(scenario.k),
        "--timezone",
        scenario.scope.timezone,
        "--json",
        ...(scenario.max_profile ? ["--backend", "archive", "--offline", "--context", "0"] : []),
        ...(method === "lexical_discovery" ? ["--discover"] : []),
      ]
      const start = performance.now()
      let raw
      try {
        raw = execFileSync(binary, args, {
          encoding: "utf8",
          maxBuffer: 4 * 1024 * 1024,
          timeout: 60000,
          stdio: ["ignore", "pipe", "pipe"],
        })
      } catch (error) {
        throw new Error(`search failed ${error.status ?? "unknown"}; output withheld`)
      }
      const wall = +(performance.now() - start).toFixed(2)
      const response = JSON.parse(raw)
      const rows = (response.items ?? []).map((item, index) => ({
        ref: item.ref,
        rank: index + 1,
        excerpt_sha256: sha(item.excerpt ?? item.text ?? ""),
        excerpt_bytes: Buffer.byteLength(item.excerpt ?? item.text ?? ""),
      }))
      const found = rows.filter((item) => question.anchors.some((id) => item.ref.endsWith(`/${id}`)))
      const matched = question.anchors.filter((id) => found.some((row) => row.ref.endsWith(`/${id}`)))
      runs.push({
        question: question.id,
        method,
        args,
        wall_ms: wall,
        meta: response.meta,
        page: response.page,
        rows,
        anchor_hit_at_k: found.length > 0,
        first_anchor_rank: found[0]?.rank ?? null,
        matched_anchors: matched.length,
        required_anchors: question.anchors.length,
        all_required_anchors_at_k: matched.length === question.anchors.length,
      })
      process.stdout.write(
        `${JSON.stringify({
          question: question.id,
          method,
          hits: rows.length,
          wall_ms: wall,
          known_anchors_found: matched.length,
          items: response.items?.map((item) => ({ ref: item.ref, excerpt: item.excerpt })),
        })}\n`,
      )
    }
  writeFileSync(
    fd,
    `${JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        case_sha256: sha(bytes),
        runner_sha256: sha(readFileSync(new URL(import.meta.url))),
        runs,
        qualification:
          "Known-anchor diagnostic, not exhaustive relevance or a held-out benchmark. Keyword queries are manually curated. Source bodies printed for in-memory review only.",
      },
      null,
      2,
    )}\n`,
  )
} finally {
  closeSync(fd)
}
