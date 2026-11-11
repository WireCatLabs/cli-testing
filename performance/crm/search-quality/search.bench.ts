import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { performance } from "node:perf_hooks"
import { DatabaseSync } from "node:sqlite"
import { expect, test } from "vitest"
import { build, type Item } from "./data.ts"

const HERE = import.meta.dirname
const REPO = process.env.B24_REPO ?? ""
const RUN = process.env.BENCH_RUN ?? ""
if (!isAbsolute(REPO) || !isAbsolute(RUN)) throw new Error("set B24_REPO and BENCH_RUN to absolute paths")
const REPEAT = Number(process.env.BENCH_REPEAT ?? 3)

const env = {
  HOME: join(RUN, "home"),
  XDG_CONFIG_HOME: join(RUN, "xdg-config"),
  XDG_DATA_HOME: join(RUN, "xdg-data"),
  XDG_STATE_HOME: join(RUN, "xdg-state"),
  XDG_CACHE_HOME: join(RUN, "xdg-cache"),
  MESSAGING_STORE: join(RUN, "store.db"),
  B24_CONFIG_DIR: join(RUN, "config"),
  B24_STATE_DIR: join(RUN, "state"),
  TMPDIR: join(RUN, "tmp"),
  B24_NO_UPDATE_CHECK: "1",
  DBUS_SESSION_BUS_ADDRESS: "disabled:",
}
Object.assign(process.env, env)
for (const key of ["B24_PROFILE", "B24_READ_ONLY", "AI_AGENT", "CLAUDECODE"]) delete process.env[key]
for (const dir of ["home", "xdg-config", "xdg-data", "xdg-state", "xdg-cache", "config", "state", "tmp"])
  mkdirSync(join(RUN, dir), { recursive: true })

const { memoryKeyring } = await import("@wirecat/cli-base")
const { run } = await import(`${REPO}/src/program.ts`)
const { fakeCrm } = await import(`${REPO}/src/testing/fake-crm.ts`)
const { FAKE_HOOK } = await import(`${REPO}/src/testing/fake-portal.ts`)
const { openB24Store } = await import(`${REPO}/src/store.ts`)
const { openCache } = await import("@wirecat/cli-core/store")

type Query = { id: string; class: string; q: string; expect: Record<string, unknown>; note?: string }

test("CRM search quality on synthetic data", async () => {
  if (process.env.MESSAGING_STORE !== env.MESSAGING_STORE) throw new Error("store variable moved")
  const { companies, contacts, items } = build()
  const portal = fakeCrm()
  const ids = new Map<string, number>()
  for (const one of companies) ids.set(one.key, portal.put("company", { title: one.title }))
  for (const one of contacts)
    ids.set(
      one.key,
      portal.put("contact", {
        name: one.name,
        lastName: one.lastName,
        email: [{ valueTypeId: "WORK", value: one.email }],
        companiesId: [ids.get(one.company)],
      }),
    )
  for (const one of items) {
    const common = {
      title: one.title,
      stageId: one.stage,
      opportunity: one.amount,
      currencyId: one.currency,
      ...(one.company ? { companyId: ids.get(one.company) } : {}),
      ...(one.contacts.length ? { contactsId: one.contacts.map((key) => ids.get(key)) } : {}),
    }
    ids.set(
      one.key,
      one.kind === "deal"
        ? portal.put("deal", { ...common, categoryId: one.categoryId ?? 0 })
        : portal.put("lead", {
            ...common,
            ...(one.person ? { name: one.person.name, lastName: one.person.lastName } : {}),
            ...(one.companyTitle ? { companyTitle: one.companyTitle } : {}),
          }),
    )
  }

  const keyring = memoryKeyring({ "bitrix24-cli:token:work": FAKE_HOOK })
  const b24 = async (argv: string[]) => {
    const out: string[] = []
    const err: string[] = []
    const code = await run(argv, {
      streams: { data: (text: string) => out.push(text), diagnostic: (text: string) => err.push(text) },
      tty: false,
      keyring,
      fetch: portal.fetch,
      sleep: async () => {},
    })
    return { code, out: out.join(""), err: err.join("") }
  }

  await (await openB24Store(process.env)).close()
  const cache = await openCache(env.MESSAGING_STORE)
  cache
    .prepare("INSERT INTO store_settings (key, value, at) VALUES (?, ?, 1)")
    .run("crm.bitrix24:example.bitrix24.test.unassigned", JSON.stringify(["7"]))
  cache.close()

  const syncs: { seconds: number; complete: unknown }[] = []
  for (let round = 0; round < 20; round++) {
    const began = performance.now()
    const ran = await b24(["work", "sync", "--json"])
    if (ran.code !== 0) throw new Error(`sync failed: ${ran.err}`)
    const body = JSON.parse(ran.out)
    syncs.push({ seconds: (performance.now() - began) / 1000, complete: body.complete })
    if (body.complete !== false) break
  }

  const db = new DatabaseSync(env.MESSAGING_STORE, { readOnly: true })
  const refOf = new Map<number, string>()
  const counts: Record<string, number> = {}
  for (const kind of ["deal", "lead"]) {
    const rows = db.prepare(`SELECT id, external_id FROM ${kind}s WHERE deleted_at IS NULL`).all() as {
      id: number
      external_id: string
    }[]
    counts[kind] = rows.length
    for (const row of rows) refOf.set(Number(row.external_id), `${kind}:${row.id}`)
  }
  db.close()
  const ref = (one: Item) => {
    const found = refOf.get(ids.get(one.key) as number)
    if (!found) throw new Error(`not stored: ${one.key}`)
    return found
  }
  expect(counts.deal).toBe(items.filter((one) => one.kind === "deal").length)
  expect(counts.lead).toBe(items.filter((one) => one.kind === "lead").length)

  const byCompany = (key: string) => items.filter((one) => one.company === key)
  const background = companies
    .slice(2)
    // A name inside another company's name ("Монолит" in "Монолит Групп") has no single right answer: left out.
    .filter((one, _, all) =>
      all.every((other) => other === one || !other.short.toLowerCase().includes(one.short.toLowerCase())),
    )
    .map((one) => ({ one, n: byCompany(one.key).length }))
    .sort((a, b) => b.n - a.n || a.one.key.localeCompare(b.one.key))
  const companyAt = (spec: string) => (background[Number(spec.slice(1))] as { one: (typeof companies)[number] }).one
  const queries = (JSON.parse(readFileSync(join(HERE, "queries.json"), "utf8")) as Query[]).map((query) => {
    const text = query.q
      .replace(/^@companyfull:(\d+)$/, (_, n) => companyAt(`@${n}`).title)
      .replace(/^@company:(\d+)$/, (_, n) => companyAt(`@${n}`).short)
    const e = query.expect
    const company = typeof e.company === "string" && e.company.startsWith("@") ? companyAt(e.company).key : e.company
    const wanted = e.none
      ? []
      : items.filter((one) =>
          e.items
            ? (e.items as string[]).includes(one.key)
            : company
              ? one.company === company
              : e.contact
                ? one.contacts.includes(e.contact as string)
                : e.stage
                  ? one.stage === e.stage && one.kind === e.kind
                  : e.category !== undefined
                    ? one.categoryId === e.category
                    : false,
        )
    return { ...query, q: text, relevant: wanted.map(ref) }
  })

  const titleOf = new Map(items.map((one) => [ref(one), one.title]))
  const results = []
  const warm: number[] = []
  for (const query of queries) {
    const times: number[] = []
    let last = { code: 0, out: "", err: "" }
    for (let n = 0; n < REPEAT; n++) {
      const began = performance.now()
      last = await b24(["work", "search", "all", query.q, "--json", "--limit", "10"])
      times.push(performance.now() - began)
    }
    warm.push(...times.slice(1))
    let body: Record<string, unknown> = {}
    try {
      body = JSON.parse(last.out || "{}")
    } catch {
      body = { unparsed: last.out.slice(0, 300) }
    }
    const hits = ((body.items ?? []) as { kind: string; ref: string; title?: string }[]).slice(0, 10)
    const crm = hits.filter((hit) => hit.kind === "deal" || hit.kind === "lead").map((hit) => hit.ref)
    const relevant = new Set(query.relevant)
    const rank = crm.findIndex((one) => relevant.has(one))
    const got = crm.filter((one) => relevant.has(one)).length
    results.push({
      id: query.id,
      class: query.class,
      q: query.q,
      note: query.note,
      relevant: relevant.size,
      recall10: relevant.size ? got / Math.min(10, relevant.size) : null,
      rr10: relevant.size ? (rank < 0 ? 0 : 1 / (rank + 1)) : null,
      falseHits: relevant.size ? null : crm.length,
      top: crm.slice(0, 5).map((one) => `${relevant.has(one) ? "+" : "-"} ${titleOf.get(one) ?? one}`),
      code: last.code,
      err: last.err.trim().slice(0, 400),
      skipped: body.skipped,
      msMedian: [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)],
      msFirst: times[0],
    })
  }
  const pct = (list: number[], p: number) => [...list].sort((a, b) => a - b)[Math.floor((list.length - 1) * p)]
  writeFileSync(
    join(RUN, "results.json"),
    JSON.stringify(
      {
        run: process.env.BENCH_LABEL ?? RUN,
        counts: { ...counts, companies: companies.length, contacts: contacts.length },
        syncs,
        latencyMs: { p50: pct(warm, 0.5), p95: pct(warm, 0.95), samples: warm.length },
        sample: queries[0]?.q,
        results,
      },
      null,
      2,
    ),
  )
})
