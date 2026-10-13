// Runs the three HTML reader engines over fixtures/ and prints a table; writes results.json.
// Usage: node run.mjs [--runs 5]   (node sizes.mjs first, once, to refresh sizes.json)
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { parseHTML } from "linkedom"
import { engineA, engineB, engineC } from "./engines.mjs"
import { norm } from "./norm.mjs"

const RUNS = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 5
const ENGINES = { A: engineA, B: engineB, C: engineC }
const LABELS = { A: "A linkedom + defuddle", B: "B linkedom + readability + turndown", C: "C regex htmlText (current)" }
const FIELDS = ["description", "author", "published", "language", "site"]
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"))

const readable = (text) => ` ${norm(text.replace(/\]\([^)]*\)/g, "]"))} `
const has = (haystack, needle) => haystack.includes(` ${norm(needle)} `)
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)]
const p95 = (xs) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1]
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d

const referenceHeadings = (html) => {
  const { document } = parseHTML(html)
  const scope = document.querySelector("main, article, [role=main], #content, #bodyContent") ?? document.body
  return [...scope.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(
    (h) => h.textContent.trim() && !h.closest("nav, header, footer, aside, [role=navigation], script, style"),
  ).length
}

const pages = manifest.map((m) => ({
  ...m,
  html: readFileSync(m.file, "utf8"),
  reference: JSON.parse(readFileSync(`reference/${m.id}.json`, "utf8")),
}))
for (const p of pages) p.headings = referenceHeadings(p.html)

const results = {}
for (const [key, engine] of Object.entries(ENGINES)) {
  await engine(pages[0].html, pages[0].url)
  const per = []
  const times = []
  for (const p of pages) {
    let out
    const own = []
    for (let i = 0; i < RUNS; i++) {
      const t = performance.now()
      try {
        out = await engine(p.html, p.url)
      } catch (error) {
        out = { title: "", text: "", meta: {}, error: String(error) }
      }
      own.push(performance.now() - t)
    }
    times.push(...own)
    const text = readable(out.text)
    const found = p.reference.mustAppear.filter((s) => has(text, s)).length
    const noise = p.reference.mustNotAppear.filter((s) => has(text, s)).length
    const title = norm(out.title ?? "")
    per.push({
      id: p.id,
      kind: p.kind,
      lang: p.lang,
      found,
      expected: p.reference.mustAppear.length,
      noise,
      noiseChecked: p.reference.mustNotAppear.length,
      titleOk: has(` ${title} `, p.reference.title),
      titleExact: title === norm(p.reference.title),
      title: out.title,
      meta: Object.fromEntries(FIELDS.map((f) => [f, Boolean(out.meta?.[f])])),
      langOk: norm(out.meta?.language ?? "").split(" ")[0] === p.lang,
      headingsOut: out.text.split("\n").filter((l) => /^#{1,6}\s/.test(l)).length,
      headingsRef: p.headings,
      chars: out.text.length,
      medianMs: round(median(own), 1),
      error: out.error,
    })
  }
  const sum = (f) => per.reduce((a, r) => a + f(r), 0)
  results[key] = {
    label: LABELS[key],
    recall: round(sum((r) => r.found) / sum((r) => r.expected)),
    pagesFullRecall: per.filter((r) => r.found === r.expected).length,
    noise: round(sum((r) => r.noise) / sum((r) => r.noiseChecked)),
    titleOk: per.filter((r) => r.titleOk).length,
    titleExact: per.filter((r) => r.titleExact).length,
    metadata: Object.fromEntries(FIELDS.map((f) => [f, per.filter((r) => r.meta[f]).length])),
    langOk: per.filter((r) => r.langOk).length,
    headingsOut: sum((r) => r.headingsOut),
    headingsRef: sum((r) => r.headingsRef),
    medianMs: round(median(times), 1),
    p95Ms: round(p95(times), 1),
    meanChars: Math.round(sum((r) => r.chars) / per.length),
    errors: per.filter((r) => r.error).length,
    pages: per,
  }
}

const sizes = existsSync("sizes.json") ? JSON.parse(readFileSync("sizes.json", "utf8")) : {}
const out = {
  ran: new Date().toISOString(),
  node: process.version,
  runsPerPage: RUNS,
  pages: pages.length,
  sizes,
  engines: results,
}
writeFileSync("results.json", `${JSON.stringify(out, null, 2)}\n`)

const row = (key) => {
  const r = results[key]
  const s = sizes[key]
  return {
    engine: key,
    recall: r.recall,
    "full pages": `${r.pagesFullRecall}/${pages.length}`,
    noise: r.noise,
    title: `${r.titleOk}/${pages.length}`,
    "title exact": `${r.titleExact}/${pages.length}`,
    "meta d/a/p/l/s": FIELDS.map((f) => r.metadata[f]).join("/"),
    "# lines": `${r.headingsOut}/${r.headingsRef}`,
    "median ms": r.medianMs,
    "p95 ms": r.p95Ms,
    MB: s ? round(s.kb / 1024, 1) : "-",
    pkgs: s ? s.packages : "-",
  }
}
console.table(Object.keys(ENGINES).map(row))
const byKind = {}
for (const [key, r] of Object.entries(results))
  for (const p of r.pages) {
    byKind[p.kind] ||= {}
    const k = byKind[p.kind]
    k[key] ||= { found: 0, expected: 0, noise: 0, checked: 0 }
    const a = k[key]
    a.found += p.found
    a.expected += p.expected
    a.noise += p.noise
    a.checked += p.noiseChecked
  }
console.table(
  Object.fromEntries(
    Object.entries(byKind).map(([kind, v]) => [
      kind,
      Object.fromEntries(
        Object.entries(v).map(([e, a]) => [e, `${a.found}/${a.expected}  noise ${a.noise}/${a.checked}`]),
      ),
    ]),
  ),
)
