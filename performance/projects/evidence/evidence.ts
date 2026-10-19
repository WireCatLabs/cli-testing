// Project evidence against a frozen baseline: a synthetic store seeded through a build's store module, then the
// built memo binary's `projects evidence --json`, scored against baseline.json: first with --no-catch-up on the
// fresh store, then by default, which fills the search index before reading.
//
//   node evidence.ts <cli-memo checkout with dist/ and node_modules/>
//
// Results: README.md. Nothing here opens the owner's store.
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { seedProjectStore } from "../fixture.ts"

const [memo] = process.argv.slice(2)
if (!memo) throw new Error("usage: node evidence.ts <cli-memo checkout with dist/>")
const baseline = JSON.parse(readFileSync(new URL("baseline.json", import.meta.url), "utf8"))

const { env, refs, folder } = await seedProjectStore(memo)

const evidence = (...args: string[]) =>
  JSON.parse(
    execFileSync(process.execPath, [join(memo, "dist/bin/memo.js"), "projects", "evidence", "HBB", ...args, "--json"], {
      env,
      encoding: "utf8",
      timeout: 60_000,
    }),
  ).item
const source = `telegram:100,email:me@example.com,notes:${folder.id}`
const ask = ["--source", source, "--context-query", "bank tracker", "--contact", "Rita Example"]

const keyOf = Object.fromEntries(Object.entries(refs).map(([key, ref]) => [ref, key]))
const labels = baseline.labels as Record<string, { label: string }>
const score = (
  run: {
    items: { ref: string; lanes: string[]; context: string; time_kind: string; around?: { ref: string }[] | null }[]
  },
  window: number,
) => {
  const found = run.items.map((item) => keyOf[item.ref] ?? `unknown:${item.ref}`)
  const inWindow = (key: string) => key !== "t-old" || window > 200
  const relevant = Object.keys(labels).filter((key) => labels[key]?.label === "relevant" && inWindow(key))
  const reachable = relevant.filter((key) => !baseline.expect.unreachable.includes(key))
  const hits = found.filter((key) => labels[key]?.label === "relevant")
  const byKey = Object.fromEntries(run.items.map((item) => [keyOf[item.ref], item]))
  return {
    found: found.length,
    relevant_found: hits.length,
    irrelevant_found: found.filter((key) => labels[key]?.label === "irrelevant"),
    precision: +(hits.length / Math.max(1, found.length)).toFixed(2),
    precision_project_context: +(
      run.items.filter((item) => item.context === "project" && labels[keyOf[item.ref] ?? ""]?.label === "relevant")
        .length / Math.max(1, run.items.filter((item) => item.context === "project").length)
    ).toFixed(2),
    recall_all: +(hits.length / relevant.length).toFixed(2),
    recall_reachable: +(hits.length / reachable.length).toFixed(2),
    missed: relevant.filter((key) => !found.includes(key)),
    in_context_only: [
      ...new Set(run.items.flatMap((item) => (item.around ?? []).map((one) => keyOf[one.ref] ?? one.ref))),
    ].filter((key) => !found.includes(key)),
    person_only_ok: baseline.expect.person_only.every((key: string) => byKey[key]?.context === "person-only"),
    two_searches_ok: baseline.expect.two_searches.every((key: string) => (byKey[key]?.lanes.length ?? 0) >= 2),
    document_time: byKey["d-method"]?.time_kind ?? null,
    items: run.items.map((item) => `${keyOf[item.ref] ?? item.ref} ${item.context} ${item.lanes.join("+")}`),
  }
}

const fresh = evidence(...ask, "--no-catch-up")
const pending = fresh.units.filter((unit: { issue: string | null }) => unit.issue === "index-pending").length
const sixty = evidence(...ask)
const year = evidence(...ask, "--since-time", "365d")
const withKey = evidence(...ask, "--context-query", "HBB")
const all = evidence("--source", "all", "--context-query", "bank tracker", "--contact", "Rita Example")
const pages: string[][] = []
let step = evidence(...ask, "--max-pages", "2")
let resumes = 0
pages.push(step.items.map((item: { ref: string }) => item.ref))
while (step.checkpoint && resumes < 20) {
  step = evidence(...ask, "--max-pages", "2", "--cursor", step.checkpoint)
  pages.push(step.items.map((item: { ref: string }) => item.ref))
  resumes++
}
const resumed = pages.flat()

console.log(
  JSON.stringify(
    {
      memo: execFileSync(process.execPath, [join(memo, "dist/bin/memo.js"), "--version"], {
        env,
        encoding: "utf8",
      }).trim(),
      node: process.version,
      searches: sixty.lanes.map(
        (lane: { query: string; kinds: string[] }) => `${lane.query} (${lane.kinds.join(",")})`,
      ),
      fresh_store_no_catch_up: { ...score(fresh, 60), units_index_pending: pending, units: fresh.units.length },
      sixty_days: {
        ...score(sixty, 60),
        reads: sixty.usage.reads,
        read_bytes: sixty.usage.read_bytes,
        around_bytes: sixty.usage.around_bytes,
        index: sixty.index,
        units: sixty.units.length,
      },
      year: score(year, 365),
      key_as_search: score(withKey, 60),
      all_sources: {
        sources: all.scope.sources.length,
        unread: all.unread_sources.map((one: { kind: string }) => one.kind),
      },
      resume_two_pages: {
        invocations: resumes + 1,
        references: resumed.length,
        duplicates: resumed.length - new Set(resumed).size,
        same_as_one_run:
          [...new Set(resumed)].sort().join() ===
          sixty.items
            .map((item: { ref: string }) => item.ref)
            .sort()
            .join(),
      },
    },
    null,
    2,
  ),
)
