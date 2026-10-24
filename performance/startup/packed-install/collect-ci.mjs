import { execFileSync } from "node:child_process"
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const [runId, artifactDirectory, resultFile] = process.argv.slice(2)
if (!/^\d+$/.test(runId ?? "") || !artifactDirectory || !resultFile)
  throw new Error("Pass a completed run ID, a new artifact directory and an aggregate result path")
const repo = "WireCatLabs/cli-testing"
const run = JSON.parse(
  execFileSync("gh", ["run", "view", runId, "--repo", repo, "--json", "headSha,url,status,conclusion"], {
    encoding: "utf8",
  }),
)
if (run.status !== "completed" || run.conclusion !== "success") throw new Error("The matrix must pass in full")
mkdirSync(artifactDirectory, { recursive: false })
execFileSync(
  "gh",
  ["run", "download", runId, "--repo", repo, "--pattern", "installs-*", "--dir", resolve(artifactDirectory)],
  { stdio: "inherit" },
)
const reports = readdirSync(artifactDirectory)
  .sort()
  .map((artifact) => ({
    artifact,
    ...JSON.parse(readFileSync(join(artifactDirectory, artifact, "run/install.json"), "utf8")),
  }))
if (reports.length !== 6 || reports.some((report) => !report.passed || report.rows.length !== 18))
  throw new Error("Expected six passing reports with 18 rows each")
const summary = {
  reason: "Validate the packed install suite on all configured platforms after correcting Windows launcher handling",
  source: run,
  pins: reports[0].pins,
  tarballs: reports[0].tarballs,
  rows: reports.map((report) => {
    if (JSON.stringify(report.pins) !== JSON.stringify(reports[0].pins)) throw new Error("Toolchain pins differ")
    if (JSON.stringify(report.tarballs) !== JSON.stringify(reports[0].tarballs))
      throw new Error("Tarball hashes differ")
    if (report.rows.some((row) => !row.passed)) throw new Error("A row failed")
    return {
      artifact: report.artifact,
      platform: report.platform,
      arch: report.arch,
      node: report.node,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      passed: report.rows.length,
      warnings: report.rows.reduce((total, row) => total + row.warnings.length, 0),
    }
  }),
}
writeFileSync(resultFile, `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx" })
