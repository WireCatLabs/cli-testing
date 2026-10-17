import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"

const [prefix, base, source, output] = process.argv.slice(2)
assert.equal(new URL(base).protocol, "https:")
assert.match(source, /^[a-f0-9]{40}$/)
assert.ok(output)
const client = createRequire(join(resolve(prefix), "package.json"))
const { chromium } = client("@playwright/test")
const version = client("@playwright/test/package.json").version
assert.equal(version, "1.63.0", "use the pinned browser client")
const browser = await chromium.launch({ headless: true })
const checks = []
try {
  for (const lang of ["en", "ru", "es"]) {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      try {
        const page = await context.newPage()
        page.setDefaultTimeout(15000)
        const recipe = `/${lang}/docs/drive/recipes#keep-notes-when-changing-databases`
        const recovery = `/${lang}/docs/drive/troubleshooting#the-store-upgrade-reports-existing-annotations`
        const response = await page.goto(new URL(`/${lang}/docs/drive/usage`, base).href)
        assert.equal(response.status(), 200)
        const link = page.locator(`main a[href="${recipe}"]`)
        assert.equal(await link.count(), 1, "storage guide has one direct copy-recipe link")
        await link.focus()
        await page.keyboard.press("Enter")
        await page.waitForURL(new URL(recipe, base).href)
        await page.locator("#keep-notes-when-changing-databases").waitFor({ state: "attached" })
        assert.equal(await page.locator("#keep-notes-when-changing-databases").count(), 1)
        const text = await page.locator("main").innerText()
        assert.ok(text.includes("drive personal store check SOURCE_DB --offline --json"))
        assert.ok(text.includes("drive personal store import SOURCE_DB --fingerprint FINGERPRINT --offline --json"))
        assert.ok(text.includes("checkpoint_updated") && text.includes("source_retained"))
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        const help = page.locator(`main a[href="${recovery}"]`)
        assert.equal(await help.count(), 1)
        await help.focus()
        await page.keyboard.press("Enter")
        await page.waitForURL(new URL(recovery, base).href)
        await page.locator("#the-store-upgrade-reports-existing-annotations").waitFor({ state: "attached" })
        assert.equal(await page.locator("#the-store-upgrade-reports-existing-annotations").count(), 1)
        assert.ok((await page.locator("main").innerText()).includes("store.checkpoint"))
        checks.push({
          locale: lang,
          width,
          keyboard_recipe_and_recovery: true,
          retained_commands: true,
          no_overflow: true,
        })
      } finally {
        await context.close()
      }
    }
  }
  writeFileSync(
    output,
    `${JSON.stringify({ base, docs_source_commit: source, playwright: version, browser: browser.version(), checks, limits: ["Published reader navigation only; no command, Google account, OAuth or database action"] }, null, 2)}\n`,
  )
  process.stdout.write(`${checks.length} production browser reader paths passed\n`)
} finally {
  await browser.close()
}
