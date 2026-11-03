// Bytes and tokens of one answer as `--json`, `--json=<fields>`, `--json --brief` and `--compact`, on the invented
// store of seed.ts. tg and memo are read offline, each from its own fresh store seeded by its own cli-core.
//
//   node run.ts <folder whose node_modules holds @wirecat/tg-cli and @wirecat/cli-memo>
//
// Tokens: tokens.py through uv with a pinned tiktoken. Writes result.json beside this file. Results: README.md.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const [prefix] = process.argv.slice(2)
if (!prefix) throw new Error("usage: node run.ts <folder with node_modules/@wirecat/tg-cli and cli-memo>")
const here = dirname(fileURLToPath(import.meta.url))
const tgDir = join(prefix, "node_modules/@wirecat/tg-cli")
const memoDir = join(prefix, "node_modules/@wirecat/cli-memo")
const coreOf = (cli: string) => {
  const nested = join(cli, "node_modules/@wirecat/cli-core")
  try {
    readFileSync(join(nested, "package.json"))
    return nested
  } catch {
    return join(prefix, "node_modules/@wirecat/cli-core")
  }
}
const version = (dir: string) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version as string

const freshHome = (cli: string) => {
  const home = mkdtempSync(join(tmpdir(), "compact-lines-"))
  const env = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_CACHE_HOME: join(home, "cache"),
    XDG_STATE_HOME: join(home, "state"),
    WIRECAT_STATE_DIR: join(home, "wirecat"),
    MESSAGING_STORE: join(home, "store.db"),
    TG_STATE_DIR: join(home, "data", "tg-cli"),
    DBUS_SESSION_BUS_ADDRESS: "disabled:",
    NO_COLOR: "1",
    TZ: "UTC",
  }
  execFileSync(process.execPath, [join(here, "seed.ts"), coreOf(cli), env.MESSAGING_STORE, env.TG_STATE_DIR], { env })
  return env
}
const tgEnv = freshHome(tgDir)
const memoEnv = freshHome(memoDir)

const outputs = mkdtempSync(join(tmpdir(), "compact-lines-out-"))
const run = (env: NodeJS.ProcessEnv, bin: string, args: string[]) => {
  try {
    return execFileSync(process.execPath, [bin, ...args], {
      env,
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    return { refused: String((error as { stderr?: string }).stderr ?? "").split("\n")[0] }
  }
}

interface Case {
  label: string
  tool: "tg" | "memo"
  args: string[]
  fields: string
}
const tg = (label: string, fields: string, ...args: string[]): Case => ({
  label: `tg ${label}`,
  tool: "tg",
  args: ["bench", ...args, "--offline"],
  fields,
})
const memo = (label: string, fields: string, ...args: string[]): Case => ({
  label: `memo ${label}`,
  tool: "memo",
  args,
  fields,
})
const MESSAGE = "ref,timestamp,sender_name,text"
const HIT = "ref,timestamp,sender_name,excerpt"
const cases: Case[] = [
  tg("messages list 1 --limit 1000", MESSAGE, "messages", "list", "1", "--limit", "1000"),
  tg("messages list 1 --limit 50", MESSAGE, "messages", "list", "1", "--limit", "50"),
  tg(
    "messages list 1 'date>=2026-09-10 date<2026-09-12' --limit 200",
    MESSAGE,
    "messages",
    "list",
    "1",
    "date>=2026-09-10 date<2026-09-12",
    "--limit",
    "200",
  ),
  tg("search messages счёт --limit 50", HIT, "search", "messages", "счёт", "--limit", "50"),
  tg("chats list", "ref,title", "chats", "list"),
  memo("search messages счёт --limit 50", HIT, "search", "messages", "счёт", "--limit", "50"),
]
const VARIANTS = [
  ["json", ["--json"]],
  ["json=fields", []],
  ["json --brief", ["--json", "--brief"]],
  ["compact", ["--compact"]],
] as const

const measured = cases.map((one, at) => {
  const bin = one.tool === "tg" ? join(tgDir, "dist/bin/tg.js") : join(memoDir, "dist/bin/memo.js")
  const env = one.tool === "tg" ? tgEnv : memoEnv
  const variants = Object.fromEntries(
    VARIANTS.map(([name, extra]) => {
      const out = run(env, bin, [...one.args, ...(name === "json=fields" ? [`--json=${one.fields}`] : extra)])
      if (typeof out !== "string") return [name, out]
      const file = join(outputs, `${at}-${name.replace(/\W+/g, "_")}.txt`)
      writeFileSync(file, out)
      return [name, { bytes: Buffer.byteLength(out), file }]
    }),
  )
  return { ...one, variants }
})

const files = measured.flatMap((one) =>
  Object.values(one.variants).flatMap((variant) => ("file" in variant ? [variant.file] : [])),
)
const tokens = JSON.parse(
  execFileSync(
    "uv",
    ["run", "--quiet", "--no-project", "--with", "tiktoken==0.14.0", "python", "-I", join(here, "tokens.py"), ...files],
    {
      encoding: "utf8",
    },
  ),
) as { encoding: string; tiktoken: string; tokens: Record<string, number> }

// F1's acceptance: every ref and every text of the JSON answer is in the compact one.
const fileOf = (at: number, variant: string) => {
  const found = measured[at]?.variants[variant]
  if (!found || !("file" in found)) throw new Error(`${cases[at]?.label} ${variant} was refused`)
  return found.file as string
}
const items = JSON.parse(readFileSync(fileOf(0, "json"), "utf8")).items as { id: string; text: string }[]
const listCompact = readFileSync(fileOf(0, "compact"), "utf8")
const rows = new Set(listCompact.split("\n").flatMap((line) => /^#(\d+) · /.exec(line)?.[1] ?? []))
const window = JSON.parse(readFileSync(fileOf(2, "json"), "utf8")).items as { timestamp: string }[]

const result = {
  date: new Date().toISOString().slice(0, 10),
  node: process.version,
  tg: version(tgDir),
  tg_cli_core: version(coreOf(tgDir)),
  memo: version(memoDir),
  memo_cli_core: version(coreOf(memoDir)),
  tokenizer: { tiktoken: tokens.tiktoken, encoding: tokens.encoding },
  average_text_chars: Math.round(items.reduce((sum, one) => sum + one.text.length, 0) / items.length),
  cases: measured.map(({ label, fields, variants }) => ({
    command: label,
    fields,
    variants: Object.fromEntries(
      Object.entries(variants).map(([name, variant]) => [
        name,
        "file" in variant ? { bytes: variant.bytes, tokens: tokens.tokens[variant.file] } : variant,
      ]),
    ),
  })),
  f1_check: {
    json_items: items.length,
    compact_rows: rows.size,
    refs_kept: items.every((one) => rows.has(one.id)),
    texts_kept: items.filter((one) => listCompact.includes(one.text)).length,
  },
  f3_window: {
    messages: window.length,
    oldest_first: window.every(
      (one, at) => at === 0 || (window[at - 1] as { timestamp: string }).timestamp <= one.timestamp,
    ),
    inside: window.every((one) => one.timestamp >= "2026-09-10" && one.timestamp < "2026-09-12"),
  },
}
mkdirSync(here, { recursive: true })
writeFileSync(join(here, "result.json"), `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
