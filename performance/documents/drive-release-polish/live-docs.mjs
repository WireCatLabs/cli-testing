import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"

const checks = []
const markers = {
  index: "SQLite",
  installation: "npm install -g @wirecat/drive-cli",
  usage: "MESSAGING_STORE",
  search: "budget AND tag:follow-up",
  recipes: "drive personal sync",
  configuration: "MESSAGING_STORE",
  troubleshooting: "MESSAGING_STORE",
  security: "MESSAGING_STORE",
  commands: "--offline",
  changelog: "0.15.1",
}
for (const lang of ["en", "ru", "es"]) {
  for (const [page, marker] of Object.entries(markers)) {
    for (const format of ["html", "markdown"]) {
      const slug = page === "index" ? "" : `/${page}`
      const path =
        format === "html"
          ? `/${lang}/docs/drive${slug}`
          : `/llms.mdx/docs/${lang === "en" ? "" : `${lang}/`}drive${slug}/content.md`
      const body = execFileSync(
        "curl",
        ["--fail", "--silent", "--show-error", "--max-time", "25", `https://wirecat.dev${path}`],
        { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
      )
      const text = body
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
      assert.ok(text.includes(marker), `${path}: missing ${marker}`)
      if (page === "index") {
        const boundary = { en: "editing their cells", ru: "редактирование ячеек", es: "celdas, fórmulas" }[lang]
        assert.ok(text.includes(boundary), `${path}: missing Sheets boundary`)
      }
      checks.push({ path, passed: true })
    }
  }
}
writeFileSync("/var/tmp/drive-0151-live-results.json", `${JSON.stringify({ version: "0.15.1", checks }, null, 2)}\n`)
process.stdout.write(`${checks.length} live release HTML/Markdown checks passed\n`)
