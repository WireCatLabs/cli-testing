// Checks that every reference string really occurs in its fixture's visible text, so a typo cannot pass as a miss.
import { readdirSync, readFileSync } from "node:fs"
import { parseHTML } from "linkedom"
import { norm, pageText } from "./norm.mjs"

let bad = 0
for (const file of readdirSync("fixtures").sort()) {
  const id = file.replace(/\.html$/, "")
  const ref = JSON.parse(readFileSync(`reference/${id}.json`, "utf8"))
  const { document } = parseHTML(readFileSync(`fixtures/${file}`, "utf8"))
  const text = ` ${norm(pageText(document))} `
  for (const s of [ref.title, ...ref.mustAppear, ...ref.mustNotAppear]) {
    if (!text.includes(` ${norm(s)} `)) {
      bad++
      console.log(`${id}: not in page: ${s}`)
    }
  }
}
console.log(bad ? `${bad} problems` : "reference ok")
process.exit(bad ? 1 : 0)
