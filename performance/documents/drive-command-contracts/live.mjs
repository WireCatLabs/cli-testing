import { spawnSync } from "node:child_process"
import { mkdtempSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const entry = resolve(process.argv[2] ?? "")
const profile = process.argv[3]
if (!process.argv[2] || !profile || process.argv[4] !== "--live") {
  process.stderr.write("Pass a built binary, an explicit profile and --live after owner approval.\n")
  process.exit(2)
}
let stage = "configuration"
let calls = 0
const run = (args, expected = 0) => {
  const result = spawnSync(process.execPath, [entry, profile, ...args, "--json"], {
    encoding: "utf8",
    timeout: 150000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, CI: "1" },
  })
  calls++
  if (result.status !== expected) {
    let code = "command_failed"
    try {
      code = JSON.parse(result.stderr).error?.code ?? code
    } catch {}
    throw Object.assign(new Error("Live command failed"), { code })
  }
  return JSON.parse((expected ? result.stderr : result.stdout).trim())
}
try {
  const config = run(["config", "show"])
  const roots = config.item?.profiles?.[profile]?.roots
  if (!Array.isArray(roots) || !roots.length) throw Object.assign(new Error(), { code: "no_selected_folders" })
  const candidates = []
  const queue = [...roots]
  const visited = new Set()
  while (
    queue.length &&
    visited.size < 12 &&
    !(
      candidates.some((f) => f.mime_type === "application/vnd.google-apps.document") &&
      candidates.some((f) => !f.mime_type?.startsWith("application/vnd.google-apps."))
    )
  ) {
    const id = queue.shift()
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(id) || visited.has(id)) continue
    visited.add(id)
    stage = "inventory"
    const result = run([
      "api",
      "drive-files-list",
      "--q",
      `'${id}' in parents and trashed = false`,
      "--page-size",
      "100",
      "--fields",
      "files(id,mimeType,size,capabilities(canDownload)),nextPageToken",
      "--supports-all-drives",
      "true",
      "--include-items-from-all-drives",
      "true",
    ])
    for (const file of result.item?.files ?? []) {
      if (file.mime_type === "application/vnd.google-apps.folder") queue.push(file.id)
      else if (file.capabilities?.can_download !== false && (!file.size || Number(file.size) <= 5 * 1024 * 1024))
        candidates.push(file)
    }
  }
  const blob = candidates.find((f) => f.mime_type && !f.mime_type.startsWith("application/vnd.google-apps."))
  const doc = candidates.find((f) => f.mime_type === "application/vnd.google-apps.document")
  if (!blob || !doc) throw Object.assign(new Error(), { code: "representative_files_not_found" })
  const scratch = mkdtempSync(join(tmpdir(), "drive-approved-live-"))
  const results = []
  for (const test of [
    { kind: "download", id: blob.id, extra: [] },
    { kind: "export", id: doc.id, extra: ["--format", "pdf"] },
    { kind: "export", id: doc.id, extra: ["--format", "docx"] },
  ]) {
    stage = `${test.kind}_${results.length + 1}`
    const path = join(scratch, `artifact-${results.length}`)
    const result = run(["files", test.kind, test.id, "--out", path, ...test.extra])
    const bytes = statSync(path).size
    if (result.item?.bytes !== bytes || bytes === 0) throw Object.assign(new Error(), { code: "byte_count_mismatch" })
    results.push({ kind: test.kind, ...(test.extra.length ? { format: test.extra[1] } : {}), bytes })
  }
  stage = "overwrite_refusal"
  const refused = run(["files", "download", blob.id, "--out", join(scratch, "artifact-0")], 2)
  if (refused.error?.reason !== "download.exists") throw Object.assign(new Error(), { code: "overwrite_not_refused" })
  process.stdout.write(
    `${JSON.stringify({ passed: true, folders_checked: visited.size, files_tested: results.length, results, overwrite_refused: true, commands: calls })}\n`,
  )
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({ passed: false, stage, code: error.code ?? "invalid_result", commands: calls })}\n`,
  )
  process.exitCode = 1
}
