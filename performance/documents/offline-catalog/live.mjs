import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { checkFixture } from "./live-check.mjs"
import { initialize, releaseOf, validateManifest, workspaceEnvironment } from "./live-input.mjs"

let report
let stage = "preflight"
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    strict: true,
    options: Object.fromEntries([
      ...["workspace", "profile", "manifest", "drive", "output", "baseline"].map((key) => [key, { type: "string" }]),
      ...["refresh", "annotate"].map((key) => [key, { type: "boolean" }]),
    ]),
  })
  assert.equal(positionals.length, 1)
  const [mode] = positionals
  assert.ok(["plan", "init", "check"].includes(mode))
  if (mode === "plan") {
    assert.equal(Object.keys(values).length, 0)
    process.stdout.write(
      `${JSON.stringify({
        live_google: "not run",
        prerequisites: [
          "owner-selected dedicated test account/profile",
          "new isolated workspace",
          "synthetic Google fixture and private manifest",
        ],
        automated: [
          "selected root guard",
          "sync/idempotency",
          "hierarchy and stable refs",
          "all-tab cached text",
          "exact search",
          "Markdown export",
          "optional local annotations",
          "retired source visibility",
        ],
        manual: [
          "browser consent with shared app and own client",
          "Google fixture edits/moves/trash",
          "token refresh/revocation",
          "interrupted sync",
          "person/project links and memory staleness",
          "embeddings and AI extraction",
        ],
      })}\n`,
    )
  } else {
    assert.ok(values.workspace && values.profile)
    if (mode === "init") {
      assert.ok(Object.keys(values).every((key) => ["workspace", "profile"].includes(key)))
      process.stdout.write(
        `${JSON.stringify({ workspace: initialize(values.workspace, values.profile), connected: false })}\n`,
      )
    } else {
      assert.ok(values.manifest && values.drive && values.output)
      const manifest = validateManifest(JSON.parse(readFileSync(values.manifest, "utf8")))
      const env = workspaceEnvironment(values.workspace, values.profile)
      const pkg = JSON.parse(readFileSync(join(values.drive, "package.json"), "utf8"))
      assert.equal(pkg.name, "@wirecat/drive-cli")
      assert.equal(pkg.version, manifest.drive_version)
      const release = releaseOf(pkg.version)
      assert.equal(pkg.dependencies?.["@wirecat/cli-core"], release.core)
      assert.equal(pkg.dependencies?.["@wirecat/cli-base"], release.framework)
      const baseline = values.baseline ? JSON.parse(readFileSync(values.baseline, "utf8")) : undefined
      if (baseline) {
        assert.equal(baseline.passed, true)
        assert.equal(baseline.profile, values.profile)
        assert.equal(baseline.workspace, env.HOME)
        assert.equal(baseline.drive, pkg.version)
        assert.equal(baseline.folder_id, manifest.folder_id)
        assert.ok(Array.isArray(baseline.references))
      }
      report = openSync(values.output, "wx", 0o600)
      const invoke = (words, offline = true, error) => {
        stage = ["search", "sync", "status"].includes(words[0]) ? words[0] : words.slice(0, 2).join(" ")
        assert.ok(offline || words[0] === "sync", "only sync may contact Google")
        const result = spawnSync(
          process.execPath,
          [
            join(resolve(values.drive), "dist/bin/drive.js"),
            values.profile,
            ...(offline ? ["--offline"] : []),
            "--json",
            ...words,
          ],
          { env, encoding: "utf8", timeout: 120000, maxBuffer: 16 * 1024 * 1024 },
        )
        assert.equal(result.error, undefined, "CLI process failed")
        const answer = JSON.parse(result.stdout.trim() || result.stderr.trim())
        if (error) {
          assert.notEqual(result.status, 0)
          assert.equal(answer.error?.code, error)
        } else {
          assert.equal(result.status, 0, "CLI command failed; raw output is not recorded")
          assert.equal(answer.meta?.complete, true, "incomplete answer")
        }
        return answer
      }
      const result = checkFixture({
        manifest,
        invoke,
        workspace: env.HOME,
        refresh: values.refresh,
        annotate: values.annotate,
        baseline,
      })
      const answer = {
        schema_version: 1,
        passed: true,
        drive: pkg.version,
        node: process.version,
        core: pkg.dependencies?.["@wirecat/cli-core"],
        framework: pkg.dependencies?.["@wirecat/cli-base"],
        workspace: env.HOME,
        profile: values.profile,
        folder_id: manifest.folder_id,
        live_google: values.refresh === true,
        ...result,
      }
      writeFileSync(report, `${JSON.stringify(answer, null, 2)}\n`)
      process.stdout.write(
        `${JSON.stringify({ passed: true, checks: result.checks.length, live_google: answer.live_google })}\n`,
      )
    }
  }
} catch {
  if (report !== undefined)
    writeFileSync(
      report,
      `${JSON.stringify({ passed: false, error: "acceptance_failed", stage, raw_output_recorded: false })}\n`,
    )
  process.stderr.write("Drive acceptance failed; no credentials, CLI output or document bodies were logged.\n")
  process.exitCode = 1
} finally {
  if (report !== undefined) closeSync(report)
}
