import { appendFileSync, mkdtempSync } from "node:fs"
import { loadavg } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { it } from "vitest"
import type { TrackerRecords } from "../domain/tracker.js"
import { type MessageStore, openStore } from "../store/store.js"
import { api, definitions, MANIFEST } from "../testing/tracker-graphql.js"
import type { TrackerSource } from "./source.js"
import { syncTracker } from "./sync.js"
import { trackerManifestFixture } from "./testing/manifest-fake.js"
import { exampleTrackerRows, fakeTrackerSource } from "./testing/source.js"

const OUT = process.env.BENCH_OUT
const DIR = process.env.BENCH_DIR ?? "/var/tmp"
const RUNS = Number(process.env.BENCH_RUNS ?? 3)
const ISSUES = Number(process.env.BENCH_ISSUES ?? 2_000)
const SYNCHRONOUS = process.env.BENCH_SYNCHRONOUS
const account = { provider: "linear", account: "user-1" }

// Counted on the driver, so the count does not depend on how the store groups its writes.
let commits = 0
let synchronous = ""
const exec = DatabaseSync.prototype.exec
DatabaseSync.prototype.exec = function (this: DatabaseSync, sql: string) {
  if (/^\s*COMMIT\b/i.test(sql)) commits += 1
  const done = exec.call(this, sql)
  if (sql.includes("journal_mode = WAL")) {
    if (SYNCHRONOUS) exec.call(this, `PRAGMA synchronous = ${SYNCHRONOUS}`)
    synchronous = String(Object.values(this.prepare("PRAGMA synchronous").get() ?? {})[0])
  }
  return done
}

const counted = (store: MessageStore, by: Map<string, number>) => {
  const wrap = (target: Record<string, unknown>, name: string, label: string) => {
    const call = target[name] as (...args: unknown[]) => Promise<unknown>
    target[name] = async (...args: unknown[]) => {
      const before = commits
      try {
        return await call.apply(target, args)
      } finally {
        by.set(label, (by.get(label) ?? 0) + commits - before)
      }
    }
  }
  const tracker = store.tracker as unknown as Record<string, unknown>
  const sync = store.sync as unknown as Record<string, unknown>
  for (const name of ["save", "removeUnlisted"]) wrap(tracker, name, `tracker.${name}`)
  for (const name of ["setSyncState", "applyDelta"]) wrap(sync, name, `sync.${name}`)
}

const bench = async (label: string, sourceOf: () => TrackerSource) => {
  const times: number[] = []
  for (let run = 1; run <= RUNS; run += 1) {
    const store = await openStore({ path: join(mkdtempSync(join(DIR, "bench-sync-writes-")), "store.db") })
    const by = new Map<string, number>()
    counted(store, by)
    const source = sourceOf()
    commits = 0
    const started = performance.now()
    await syncTracker(source, store, account, { now: Date.UTC(2026, 10, 25) })
    const ms = performance.now() - started
    const total = commits
    await store.close()
    times.push(ms)
    const split = [...by].map(([name, n]) => `${name} ${n}`).join(", ")
    appendFileSync(
      OUT as string,
      `${label} run ${run}: ${ms.toFixed(0)} ms, ${total} commits (${split}; rest ${total - [...by.values()].reduce((a, b) => a + b, 0)}), ` +
        `synchronous ${synchronous}, load ${loadavg()[0]?.toFixed(1)}\n`,
    )
  }
  const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)] ?? 0
  appendFileSync(OUT as string, `${label} median: ${median.toFixed(0)} ms\n`)
}

it.skipIf(!OUT)("small: the strict fake, 8 kinds of 3 rows, 2 per page", { timeout: 1_800_000 }, async () => {
  await bench("small", () => trackerManifestFixture(MANIFEST, { api, definitions }).source)
})

it.skipIf(!OUT)(`large: ${ISSUES} issues, 100 per page`, { timeout: 3_600_000 }, async () => {
  const rows = exampleTrackerRows()
  const base = rows.issue[0] as TrackerRecords["issue"]
  rows.issue = Array.from({ length: ISSUES }, (_, n) => ({
    ...base,
    externalId: `issue-${n + 1}`,
    key: `ENG-${n + 1}`,
    title: `Issue ${n + 1} about invoices and the migration`,
    description: `Step ${n} of the billing work, see ENG-${n} for context`,
    updatedAt: Date.UTC(2026, 10, 1) + n * 1000,
  }))
  rows.comment = []
  await bench("large", () => fakeTrackerSource({ rows, pageSize: 100 }))
})
