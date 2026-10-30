// Usage: node swap-driver.mjs <gcal checkout> <cli-core checkout, built>
// Replaces the checkout's installed cli-core node:sqlite driver with the compiled one from a cli-core build, so a sync
// measures cli-core's real change rather than the text patch in statement-cache.mjs. The file is rewritten, not edited
// in place: pnpm hard-links it to its global store.
import { copyFileSync, existsSync, readFileSync, realpathSync, unlinkSync } from "node:fs"
import { join } from "node:path"

const [gcalDir, coreDir] = process.argv.slice(2)
const installed = realpathSync(join(gcalDir, "node_modules/@wirecat/cli-core"))
const target = join(installed, "dist/store/drivers/node-sqlite.js")
const source = join(coreDir, "dist/store/drivers/node-sqlite.js")
for (const imported of readFileSync(source, "utf8").matchAll(/from "(\.\.?\/[^"]+)"/g)) {
  if (!existsSync(join(installed, "dist/store/drivers", imported[1])))
    throw new Error(`the installed cli-core has no ${imported[1]}`)
}
unlinkSync(target)
copyFileSync(source, target)
process.stdout.write(`swapped: ${target}\n`)
