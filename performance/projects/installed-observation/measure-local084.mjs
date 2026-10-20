import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { closeSync, openSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { performance } from "node:perf_hooks"
import { fileURLToPath } from "node:url"

const [consent, casePath, output, binaryPath] = process.argv.slice(2)
assert.equal(
  consent,
  "--live-local",
  "explicit --live-local is required; uses the owner's installed CLI and local archive",
)
assert.ok(output, "provide a new aggregate-result JSON path")
assert.ok(casePath && binaryPath, "provide private case, new output and installed binary paths")
const scenario = JSON.parse(readFileSync(resolve(casePath), "utf8"))
const binary = realpathSync(binaryPath)
const packageRoot = resolve(dirname(realpathSync(binary)), "../..")
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"))
assert.equal(manifest.version, "0.84.0", "this measured protocol pins published Memo 0.84.0")
assert.equal(manifest.dependencies["@wirecat/cli-core"], "0.377.0")
const sha = (value) => createHash("sha256").update(value).digest("hex")
const textMeta = (item) => ({
  ref: item.ref,
  fingerprint: item.fingerprint ?? null,
  kind: item.kind ?? null,
  time_kind: item.time_kind ?? null,
  context: typeof item.context === "string" ? item.context : null,
  text_truncated: item.text_truncated ?? null,
  around_issue: item.around_issue ?? null,
  lanes: item.lanes ?? [],
  text_sha256: sha(item.text ?? ""),
  text_utf8_bytes: Buffer.byteLength(item.text ?? ""),
  around: (item.around ?? []).map((one) => ({
    ref: one.ref,
    found: one.found ?? null,
    text_sha256: sha(one.text ?? ""),
    text_utf8_bytes: Buffer.byteLength(one.text ?? ""),
  })),
})
const invoke = (args) => {
  const start = performance.now()
  let raw
  try {
    raw = execFileSync(binary, args, {
      env: process.env,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    const safe = new Error(
      `installed Memo failed (exit ${error.status ?? "none"}, signal ${error.signal ?? "none"}); captured output is withheld`,
    )
    throw safe
  }
  const envelope = JSON.parse(raw)
  assert.ok(envelope.item && envelope.meta, "expected a complete item envelope")
  return {
    envelope,
    wall_ms: +(performance.now() - start).toFixed(2),
    stdout_utf8_bytes: Buffer.byteLength(raw),
  }
}
const contextSnapshot = () => {
  const { envelope } = invoke(["projects", "context", scenario.project, "--json"])
  const value = envelope.item
  return {
    project: value.project.ref,
    key_documents: value.key_documents.map((item) => ({
      ref: item.ref,
      confirmed: item.confirmed,
    })),
    relationships: value.relationships.map((item) => ({
      id: item.id,
      confirmed: item.confirmed,
    })),
    facts: value.review.facts.items.map((item) => ({
      ref: item.ref,
      status: item.status,
    })),
    findings_batches: value.review.meeting_actions.items.map((item) => item.id),
    open_tasks: value.open_tasks.items.map((item) => item.ref),
    partial_view: true,
  }
}
const report = {
  case_id: scenario.case_id,
  started_at: new Date().toISOString(),
  node: process.version,
  memo: manifest.version,
  dependencies: {
    core: manifest.dependencies["@wirecat/cli-core"],
    base: manifest.dependencies["@wirecat/cli-base"],
  },
  case_sha256: sha(readFileSync(resolve(casePath))),
  runner_sha256: sha(readFileSync(fileURLToPath(import.meta.url))),
  request: scenario,
  runs: [],
  llm_tokens: null,
  remote_fetches_requested: 0,
  qualification:
    "Live local observation; no raw source text saved, no project reset, no knowledge proposals. Default catch-up may update local indexes. Time is CLI wall time, not agent analysis time. Owner archive is mutable; references and hashes detect drift but are not an offline corpus snapshot.",
}
const outputFd = openSync(resolve(output), "wx", 0o600)
try {
  const before = contextSnapshot()
  for (const [name, catchUp] of [
    ["index_as_is", false],
    ["default_first", true],
    ["default_repeat", true],
  ]) {
    const args = [
      "projects",
      "evidence",
      scenario.project,
      "--source",
      scenario.source,
      "--since-time",
      scenario.since_time,
      "--before-time",
      scenario.before_time,
      "--limit",
      String(scenario.limit),
      "--max-pages",
      String(scenario.max_pages),
      ...(!catchUp ? ["--no-catch-up"] : []),
      ...(scenario.aliases ?? []).flatMap((value) => ["--alias", value]),
      ...(scenario.contacts ?? []).flatMap((value) => ["--contact", value]),
      "--json",
    ]
    const run = {
      name,
      args,
      pages: [],
      items: [],
      stagnation_detected: false,
    }
    let cursor
    let previousProgress
    for (let page = 0; page < scenario.max_invocations; page++) {
      const { envelope, wall_ms, stdout_utf8_bytes } = invoke([...args, ...(cursor ? ["--cursor", cursor] : [])])
      const value = envelope.item
      assert.equal(value.window.before, Date.parse(scenario.before_time), "all phases must use the fixed exclusive end")
      run.pages.push({
        wall_ms,
        stdout_utf8_bytes,
        meta: { duration_ms: envelope.meta.duration_ms },
        window: value.window,
        scope: value.scope,
        lanes: value.lanes,
        usage: value.usage,
        totals: value.totals,
        index: value.index,
        stopped: value.stopped ?? null,
        complete: value.complete,
        resumed: value.resumed,
        completeness: value.completeness,
        units: value.units,
        unread_sources: value.unread_sources,
        oversized: (value.oversized ?? []).map(({ ref, bytes, lanes, source }) => ({ ref, bytes, lanes, source })),
        matched_again: (value.matchedAgain ?? value.matched_again ?? []).map(({ ref, lanes }) => ({ ref, lanes })),
        checkpoint_present: Boolean(value.checkpoint),
      })
      run.items.push(...value.items.map(textMeta))
      cursor = value.checkpoint
      const progress = JSON.stringify(
        value.units.map(({ lane, source, state, pages, issue }) => ({
          lane,
          source,
          state,
          pages,
          issue,
        })),
      )
      if (cursor && value.items.length === 0 && progress === previousProgress) {
        run.stagnation_detected = true
        break
      }
      previousProgress = progress
      if (!cursor) break
    }
    run.finished_pagination = !cursor
    run.wall_ms = +run.pages.reduce((sum, page) => sum + page.wall_ms, 0).toFixed(2)
    run.unique_refs = new Set(run.items.map((item) => item.ref)).size
    run.duplicate_refs = run.items.length - run.unique_refs
    run.by_kind = Object.fromEntries(
      [...new Set(run.items.map((item) => item.kind))].map((kind) => [
        kind,
        run.items.filter((item) => item.kind === kind).length,
      ]),
    )
    const direct = new Set(run.items.map((item) => item.ref))
    const context = new Set(run.items.flatMap((item) => item.around.map((one) => one.ref)))
    run.anchor_checks = (scenario.questions ?? []).map((question) => ({
      id: question.id,
      anchors: question.anchors.map((ref) => ({
        ref,
        direct: direct.has(ref),
        around: context.has(ref),
      })),
    }))
    run.ref_set_sha256 = sha([...direct].sort().join("\n"))
    run.content_set_sha256 = sha(
      run.items
        .map((item) => `${item.ref}:${item.text_sha256}`)
        .sort()
        .join("\n"),
    )
    report.runs.push(run)
    process.stdout.write(
      `${name}: ${run.unique_refs} unique references, ${run.wall_ms} ms, pagination ${run.finished_pagination ? "finished" : "capped"}\n`,
    )
  }
  const after = contextSnapshot()
  report.project_review_view_unchanged = JSON.stringify(before) === JSON.stringify(after)
  report.project_review_snapshot = before
  report.finished_at = new Date().toISOString()
  writeFileSync(outputFd, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`Saved aggregate metadata only: ${resolve(output)}\n`)
} finally {
  closeSync(outputFd)
}
