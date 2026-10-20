// Project evidence on large imported documents, scored against baseline.json (written before the first run):
// one document above the 64 KiB page, one above the 256 KiB single-record limit, six medium ones that need several
// pages, and decoys. Measures which paragraphs are found, which show in `around`, pages, charged bytes, `oversized`
// and `--max-pages` + `--cursor`. The frozen performance/projects/evidence test cannot reach any of this.
//
//   node evidence-large-document.ts <cli-memo checkout with dist/ and node_modules/>
//
// Run it with HOME, XDG_*, MESSAGING_STORE, WIRECAT_STATE_DIR and TMPDIR inside one fresh /var/tmp directory
// (see README.md). Results: README.md. Nothing here opens the owner's store.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const [memo] = process.argv.slice(2)
if (!memo) throw new Error("usage: node evidence-large-document.ts <cli-memo checkout with dist/>")
const baseline = JSON.parse(readFileSync(new URL("baseline.json", import.meta.url), "utf8"))

const home = realpathSync(process.env.HOME ?? "")
if (!home.startsWith("/var/tmp/")) throw new Error("run with HOME inside a fresh /var/tmp directory")
for (const key of [
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_CACHE_HOME",
  "MESSAGING_STORE",
  "WIRECAT_STATE_DIR",
  "TMPDIR",
])
  if (!process.env[key]?.startsWith(home)) throw new Error(`${key} must stay inside HOME`)
if (existsSync(process.env.MESSAGING_STORE as string)) throw new Error("refuse an existing store")
const env = { ...process.env, PATH: process.env.PATH ?? "" }

const filler = [
  "The harbour crane was inspected on schedule and the report was filed without remarks.",
  "Quarterly figures were compared with the plan and the difference was explained in the appendix.",
  "A short note on vendor invoices: three were paid, two wait for a signature, one was disputed.",
  "The meeting room was booked for Thursday and the agenda was sent to all attendees in advance.",
  "Weather delays moved the delivery by two days, which the schedule absorbed without further changes.",
  "Training material was revised after feedback and the new version replaces the earlier handout.",
  "Open questions were collected in a list; each has an owner and a date for the next update.",
]
const paragraph = (index: number, hit?: string) => {
  const id = `p${String(index).padStart(3, "0")}`
  const body = Array.from({ length: 7 }, (_, i) => filler[(index + i) % filler.length]).join(" ")
  return hit ? `${id} ${hit} ${body.slice(0, 420)}` : `${id} ${body}`
}
const document = (paragraphs: number, hits: Record<number, string> = {}) =>
  Array.from({ length: paragraphs }, (_, i) => paragraph(i + 1, hits[i + 1])).join("\n\n")

const NAME = "Lantern Works"
const KEY = "LNW"
const ALIAS = "Beacon Desk"
const said = {
  name: `${NAME} confirmed the review.`,
  key: `${KEY} review is confirmed.`,
  alias: `${ALIAS} confirmed the review.`,
}
const texts: Record<string, string> = {
  large: document(220, { 4: said.name, 60: said.key, 150: said.alias, 215: said.name }),
  huge: document(430, { 10: said.name }),
  small: "p001 Notes.\n\np002 The Beacon Desk call is on Friday.\n\np003 Bring the folder.",
  "decoy-lantern": document(45).replace(
    "p020",
    "p020 A lantern festival is held in the square and the town works late that night.",
  ),
  "decoy-garden": document(45).replace("p020", "p020 Garden plan: beds, water and compost for the spring."),
}
for (const key of ["m1", "m2", "m3", "m4", "m5", "m6"]) texts[key] = document(65, { 30: said.name })

const { openStore } = await import(pathToFileURL(join(memo, "node_modules/@wirecat/cli-core/dist/store/index.js")).href)
const store = await openStore({ env })
const project = await store.knowledge.addProject({ name: NAME, key: KEY })
await store.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, ALIAS)
const folder = await store.notes.addFolder({ name: "Large documents" })
const keyOf: Record<string, string> = {}
for (const [key, text] of Object.entries(texts)) {
  const saved = await store.notes.saveFileNote({ folderId: folder.id, path: `${key}.md`, title: key, text })
  keyOf[saved.note.ref] = key
}
await store.fillSearchIndex?.()
await store.close()
const size = (key: string) => Buffer.byteLength(texts[key] as string)

const memoBin = join(memo, "dist/bin/memo.js")
const guard = new URL("../../documents/drive-shared-store/guard.mjs", import.meta.url).pathname
const evidence = (...args: string[]) =>
  JSON.parse(
    execFileSync(
      process.execPath,
      ["--import", guard, memoBin, "projects", "evidence", KEY, "--source", `notes:${folder.id}`, ...args, "--json"],
      { env, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
    ),
  ).item

type Item = {
  ref: string
  lanes: string[]
  text: string
  around?: { ref: string; text: string; found?: boolean }[] | null
}
const marker = (text: string) => Number(/^p(\d{3})/.exec(text)?.[1] ?? Number.NaN)
const summarise = (run: {
  items: Item[]
  oversized: { ref: string; bytes: number; lanes: string[] }[]
  units: { state: string; pages: number; issue: string | null; [k: string]: unknown }[]
  usage: Record<string, number>
  totals: Record<string, number>
  complete: boolean
  checkpoint: string | null
  stopped: string | null
  matched_again: unknown[]
}) => {
  const found = run.items.map((item) => keyOf[item.ref] ?? `unknown:${item.ref}`)
  const around = Object.fromEntries(
    run.items.map((item) => [
      keyOf[item.ref],
      {
        paragraphs: (item.around ?? []).map((one) => marker(one.text)),
        found_marked: (item.around ?? []).filter((one) => one.found).map((one) => marker(one.text)),
        in_other_document: (item.around ?? []).filter((one) => one.ref !== item.ref).length,
      },
    ]),
  )
  return {
    found,
    lanes_per_document: Object.fromEntries(run.items.map((item) => [keyOf[item.ref], item.lanes])),
    around,
    oversized: run.oversized.map((one) => ({
      document: keyOf[one.ref] ?? one.ref,
      bytes: one.bytes,
      lanes: one.lanes,
    })),
    units: run.units.map(({ state, pages, issue, ...rest }) => ({ ...rest, state, pages, issue })),
    pages_total: run.units.reduce((sum, unit) => sum + unit.pages, 0),
    usage: run.usage,
    totals: run.totals,
    complete: run.complete,
    has_checkpoint: run.checkpoint !== null,
    stopped: run.stopped,
    matched_again: run.matched_again.length,
  }
}

const expect = baseline.expect
const docs = baseline.documents as Record<
  string,
  { hit_paragraphs?: Record<string, string>; around_default?: number[] }
>
const sameSet = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join()

const one = evidence()
const base = summarise(one)
const wide = summarise(evidence("--before-n", "5", "--after-n", "5"))
const readable = expect.found as string[]
const bytesRead = base.found.reduce((sum, key) => sum + size(key), 0)

const aroundOk = Object.fromEntries(
  readable.map((key) => [
    key,
    sameSet((base.around[key]?.paragraphs ?? []).map(String), (docs[key]?.around_default ?? []).map(String)),
  ]),
)
const relevantParagraphs = Object.entries(docs).flatMap(([key, doc]) =>
  Object.keys(doc.hit_paragraphs ?? {}).map((index) => ({ key, index: Number(index) })),
)
const surfaced = relevantParagraphs.filter(({ key, index }) => base.around[key]?.paragraphs.includes(index))

const pages: { new_refs: number; pages: number; charged_bytes: number; complete: boolean }[] = []
const refs: string[] = []
let stalled = false
let step = evidence("--max-pages", "2")
for (let resumes = 0; ; resumes++) {
  refs.push(...step.items.map((item: Item) => item.ref))
  pages.push({
    new_refs: step.items.length,
    pages: step.units.reduce((sum: number, unit: { pages: number }) => sum + unit.pages, 0),
    charged_bytes: step.usage.read_bytes,
    complete: step.complete,
  })
  if (!step.checkpoint || resumes >= 40) break
  if (resumes > 0 && step.usage.reads === 0 && step.items.length === 0) {
    stalled = true
    break
  }
  step = evidence("--max-pages", "2", "--cursor", step.checkpoint)
}

process.stdout.write(
  `${JSON.stringify(
    {
      memo: execFileSync(process.execPath, [memoBin, "--version"], { env, encoding: "utf8" }).trim(),
      node: process.version,
      document_bytes: Object.fromEntries(Object.keys(texts).map((key) => [key, size(key)])),
      default_run: {
        ...base,
        found_all_readable: sameSet(base.found, readable),
        unexpected_found: base.found.filter((key) => !readable.includes(key)),
        charged_bytes: base.usage.read_bytes,
        found_document_bytes: bytesRead,
        charged_per_document_byte: +(base.usage.read_bytes / bytesRead).toFixed(2),
        oversized_ok: sameSet(
          base.oversized.map((one) => one.document),
          expect.oversized,
        ),
        around_matches_label: aroundOk,
        relevant_paragraphs: relevantParagraphs.length,
        relevant_paragraphs_in_around: surfaced.length,
        relevant_paragraphs_not_surfaced: relevantParagraphs
          .filter((one) => !surfaced.includes(one) && !base.oversized.some((over) => over.document === one.key))
          .map(({ key, index }) => `${key}:p${index}`),
      },
      around_five_each_side: {
        large: wide.around.large,
        expected_large: baseline.documents.large.around_five,
        around_bytes: wide.usage.around_bytes,
      },
      resume_two_pages: {
        invocations: pages.length,
        per_invocation: pages,
        references: refs.length,
        duplicates: refs.length - new Set(refs).size,
        same_references_as_one_run: sameSet(
          [...new Set(refs)].map((ref) => keyOf[ref] ?? ref),
          base.found,
        ),
        cumulative_charged_bytes: pages.reduce((sum, one) => sum + one.charged_bytes, 0),
        completed: pages.at(-1)?.complete ?? false,
        stalled_without_a_read: stalled,
      },
    },
    null,
    2,
  )}\n`,
)
