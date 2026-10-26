import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"

export async function checkPortal({ base, output, source, release, markers }) {
  assert.equal(new URL(base).protocol, "https:")
  assert.ok(output)
  assert.match(source, /^[a-f0-9]{40}$/)
  const checks = []
  for (const lang of ["en", "ru", "es"]) {
    for (const [page, required] of Object.entries(markers)) {
      for (const format of ["html", "markdown"]) {
        const slug = page === "index" ? "" : `/${page}`
        const path =
          format === "html"
            ? `/${lang}/docs/drive${slug}`
            : `/llms.mdx/docs/${lang === "en" ? "" : `${lang}/`}drive${slug}/content.md`
        const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(25000) })
        assert.equal(response.status, 200, path)
        const reader = response.body.getReader()
        const chunks = []
        let size = 0
        while (true) {
          const part = await reader.read()
          if (part.done) break
          size += part.value.byteLength
          if (size > 16 * 1024 * 1024) {
            await reader.cancel()
            throw new Error(`${path}: response exceeds the checker's size limit`)
          }
          chunks.push(part.value)
        }
        const body = Buffer.concat(chunks)
          .toString("utf8")
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
          .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "")
        const text = body.replace(/<[^>]*>/g, "").replace(/\s+/g, " ")
        const expected = Array.isArray(required) ? required : required[lang]
        for (const marker of expected)
          assert.ok(body.includes(marker) || text.includes(marker), `${path}: missing ${marker}`)
        if (page === "commands") assert.equal(text.includes("drive schema"), false, `${path}: retired schema hint`)
        checks.push({ path, format, passed: true })
      }
    }
  }
  writeFileSync(
    output,
    `${JSON.stringify({ release, docs_source_commit: source, base, node: process.version, checks, limits: ["Public HTTP content markers only; not browser interaction, accessibility or Google OAuth verification"] }, null, 2)}\n`,
  )
  process.stdout.write(`${checks.length} production HTML/Markdown checks passed\n`)
}
