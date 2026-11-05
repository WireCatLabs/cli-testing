// `memo projects status HRB --context-query 1C` on the invented store of fixture.ts: the four acceptance claims of
// the e plan (section 7), answer sizes and wall time. Fresh temporary state, no keyring, no network.
//
//   node status.ts <folder whose node_modules holds @wirecat/cli-memo> [rounds]
//
// Writes result.json beside this file. Results: README.md.
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BEFORE, CHATS, D, seed } from "./fixture.ts"

const [prefix, roundsArg] = process.argv.slice(2)
if (!prefix) throw new Error("usage: node status.ts <folder with node_modules/@wirecat/cli-memo> [rounds]")
const rounds = Number(roundsArg ?? 5)
const memoDir = join(prefix, "node_modules/@wirecat/cli-memo")
const coreDir = join(prefix, "node_modules/@wirecat/cli-core")
const version = (dir: string) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version as string

const home = mkdtempSync(join(tmpdir(), "project-status-"))
const env = {
  PATH: process.env.PATH ?? "",
  HOME: home,
  XDG_CONFIG_HOME: join(home, "config"),
  XDG_DATA_HOME: join(home, "data"),
  XDG_CACHE_HOME: join(home, "cache"),
  XDG_STATE_HOME: join(home, "state"),
  WIRECAT_STATE_DIR: join(home, "wirecat"),
  MESSAGING_STORE: join(home, "store.db"),
  DBUS_SESSION_BUS_ADDRESS: "disabled:",
  NO_COLOR: "1",
  TZ: "UTC",
}
const seeded = await seed(coreDir, env.MESSAGING_STORE)

const args = ["projects", "status", "HRB", "--context-query", "1C", "--before-time", BEFORE]
const run = (...extra: string[]) => {
  const started = performance.now()
  const out = execFileSync(process.execPath, [join(memoDir, "dist/bin/memo.js"), ...args, ...extra], {
    env,
    encoding: "utf8",
    timeout: 60_000,
    stdio: ["ignore", "pipe", "pipe"],
  })
  return { out, ms: performance.now() - started }
}
const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] as number
const measure = (...extra: string[]) => {
  const runs = Array.from({ length: rounds }, () => run(...extra))
  return {
    out: runs[0]?.out ?? "",
    bytes: Buffer.byteLength(runs[0]?.out ?? ""),
    wall_ms: median(runs.map((r) => r.ms)),
  }
}

const text = measure()
const json = measure("--json")
const compact = measure("--compact")
const answer = JSON.parse(json.out)
const day = (iso: string | null | undefined) => iso?.slice(0, 10) ?? null
const plus = (days: number) => new Date(Date.parse(`${D}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

interface Signal {
  chat: string
  ref: string
  evidence?: string[]
  data: Record<string, unknown>
}
interface ChatRow {
  chat: string
  next?: string
  waiting_since?: string | null
  coverage: string
  sync_command?: string | null
}
const group = CHATS[0]
const asks = group.said.filter((one) => one.from === "me" && one.text.includes("1 200"))
const askRefs = asks.map((one) => `msg:max/11/-900/${one.id}`)
const money = (answer.item.amounts as Signal[]).find((one) => one.data.direction === "to_us")
const contractor = (answer.item.chats as ChatRow[]).find((one) => one.chat === "chat:telegram/22/555")
const topic = (answer.item.topics as Signal[]).find((one) => one.data.query === "1C")

const claims = {
  money: {
    expected: `to_us 1200.00 EUR open since ${D}, citing ${askRefs.join(" and ")}`,
    observed: money && {
      amount: money.data.amount,
      currency: money.data.currency,
      state: money.data.state,
      since: day(money.data.since as string),
      evidence: money.evidence ?? [money.ref],
    },
    pass:
      money?.data.amount === "1200.00" &&
      money.data.currency === "EUR" &&
      money.data.state === "open" &&
      day(money.data.since as string) === D &&
      askRefs.every((ref) => (money.evidence ?? [money.ref]).includes(ref)),
  },
  // NEED-2210 A: the move is the owner's since the contractor's first unanswered message, how long they have waited.
  contractor_next: {
    expected: `next: YOU (owner) since ${plus(2)}`,
    observed: contractor && { next: contractor.next, since: day(contractor.waiting_since) },
    pass: contractor?.next === "owner" && day(contractor.waiting_since) === plus(2),
  },
  topic_quiet: {
    expected: `"1C" quiet on their side since ${plus(-7)}`,
    observed: topic && { theirs_last: day(topic.data.theirs_last as string), silent_since: topic.data.silent_since },
    pass: day(topic?.data.silent_since as string) === plus(-7),
    in_text: /"1C" quiet/.test(text.out),
  },
  contractor_partial: {
    expected: "chat:telegram/22/555 partial, with its sync command",
    observed: contractor && { state: contractor.coverage, sync_command: contractor.sync_command },
    pass: contractor?.coverage === "partial" && /messages sync 555/.test(contractor.sync_command ?? ""),
  },
}

const refsByText = new Map<string, string[]>()
for (const chat of CHATS)
  for (const one of chat.said)
    refsByText.set(one.text, [
      ...(refsByText.get(one.text) ?? []),
      `msg:${chat.account.provider}/${chat.account.account}/${chat.id}/${one.id}`,
    ])
// Filler texts repeat, so a text counts as cited when any message carrying it is.
const leaks = (out: string) =>
  [...refsByText].filter(([said, refs]) => out.includes(said) && !refs.some((ref) => out.includes(ref))).length

const result = {
  date: new Date().toISOString().slice(0, 10),
  node: process.version,
  memo: version(memoDir),
  cli_core: version(coreDir),
  seeded_messages: seeded,
  command: `memo ${args.join(" ")}`,
  rounds,
  claims,
  claims_passed: Object.values(claims).filter((one) => one.pass).length,
  sizes: {
    json_bytes: json.bytes,
    json_target: 4096,
    compact_bytes: compact.bytes,
    compact_target: 1536,
    text_bytes: text.bytes,
    json_by_field: Object.fromEntries(
      Object.entries(answer.item).map(([key, value]) => [key, Buffer.byteLength(JSON.stringify(value))]),
    ),
  },
  wall_ms: { text: Math.round(text.wall_ms), json: Math.round(json.wall_ms), compact: Math.round(compact.wall_ms) },
  answer_duration_ms: answer.meta.duration_ms,
  texts_shown_without_their_ref: { json: leaks(json.out), compact: leaks(compact.out), text: leaks(text.out) },
}
writeFileSync(new URL("result.json", import.meta.url), `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(
  `${JSON.stringify({ claims_passed: result.claims_passed, sizes: result.sizes, wall_ms: result.wall_ms }, null, 2)}\n`,
)
