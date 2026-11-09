// node write-events.mjs --base <cli-core checkout> --events <cli-core checkout> [--tx N] [--rounds R] [--dir D]
// The cost of the store.write run events (cli-core S5): the same write-heavy loops inside a recorded run, on a
// cli-core without the events (--base) and with them (--events), alternated, each in a fresh process and store.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { ACCOUNT, args, messages } from "./lib.mjs"

const opts = args(process.argv.slice(2))
const tx = Number(opts.tx ?? 2000)

const one = async () => {
  const core = (path) => import(pathToFileURL(join(opts.core, "dist", path)).href)
  const { openStore } = await core("store/index.js")
  const { openStoreContext } = await core("store/sqlite/open-store.js")
  const { write } = await core("store/sqlite/transaction.js")
  const { recorded } = await core("runs/recording.js")
  const root = mkdtempSync(join(opts.dir, "run-"))
  const app = { command: "bench", appName: "bench-cli", envPrefix: "BENCH", description: "bench", version: "0.0.0" }
  const inRecordedRun = (work) =>
    recorded(
      {
        app,
        command: "bench",
        record: true,
        keepFailed: true,
        trace: false,
        format: "json",
        runsDir: join(root, "runs"),
        env: { BENCH_STATE_DIR: join(root, "state") },
      },
      work,
    )
  const timed = async (work) => {
    const started = process.hrtime.bigint()
    await inRecordedRun(work)
    return Number(process.hrtime.bigint() - started) / 1e6
  }

  const context = await openStoreContext({ path: join(root, "rows.db"), command: "bench", warn: () => {} })
  const insert = context.database.prepare(
    "INSERT INTO accounts (provider, external_id, created_at, updated_at) VALUES ('bench', ?, 0, 0)",
  )
  const rowPerTx = await timed(async () => {
    for (let i = 0; i < tx; i++) write(context.database, () => insert.run(String(i)))
  })
  context.database.close()

  const store = await openStore({ path: join(root, "messages.db"), command: "bench", warn: () => {} })
  await store.accounts.saveAccount(ACCOUNT, { name: "Bench" })
  const messagePerTx = await timed(async () => {
    for (let i = 1; i <= tx; i++)
      await store.messages.saveMessages(ACCOUNT, "c1", messages("c1", i, 1, 600), { via: "bench" })
  })
  const batched = await timed(async () => {
    for (let from = tx + 1; from <= tx * 2; from += 50)
      await store.messages.saveMessages(ACCOUNT, "c2", messages("c2", from, 50, 600), { via: "bench" })
  })
  await store.close()
  rmSync(root, { recursive: true, force: true })
  process.stdout.write(`${JSON.stringify({ rowPerTx, messagePerTx, batched })}\n`)
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

const main = () => {
  const rounds = Number(opts.rounds ?? 5)
  const dir = mkdtempSync(join(opts.dir ?? "/var/tmp/claude", "write-events-"))
  mkdirSync(dir, { recursive: true })
  const runs = { base: [], events: [] }
  for (let round = 0; round < rounds; round++)
    for (const side of round % 2 ? ["events", "base"] : ["base", "events"]) {
      const out = execFileSync(
        process.execPath,
        [process.argv[1], "--one", "yes", "--core", opts[side], "--tx", String(tx), "--dir", dir],
        { env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: "disabled:" }, encoding: "utf8" },
      )
      runs[side].push(JSON.parse(out.trim().split("\n").at(-1)))
    }
  rmSync(dir, { recursive: true, force: true })
  const result = {}
  const percent = (base, events) => `${(((events - base) / base) * 100).toFixed(1)}%`
  for (const loop of ["rowPerTx", "messagePerTx", "batched"]) {
    const of = (side, pick) => pick(runs[side].map((run) => run[loop]))
    const fastest = (values) => Math.min(...values)
    result[loop] = {
      baseMs: { fastest: Math.round(of("base", fastest)), median: Math.round(of("base", median)) },
      eventsMs: { fastest: Math.round(of("events", fastest)), median: Math.round(of("events", median)) },
      overhead: {
        fastest: percent(of("base", fastest), of("events", fastest)),
        median: percent(of("base", median), of("events", median)),
      },
    }
  }
  process.stdout.write(`${JSON.stringify({ tx, rounds, node: process.version, result }, null, 2)}\n`)
}

if (opts.one === "yes") await one()
else main()
