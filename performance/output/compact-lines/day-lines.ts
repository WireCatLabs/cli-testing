// `--compact` of the same JSON answers through two cli-core versions, to measure a renderer change before a messenger
// ships it, and the bytes floor: the message texts alone, which compact keeps whole.
//
//   node day-lines.ts <folder with node_modules/@wirecat/tg-cli> <cli-core dir before> <cli-core dir after>
//
// Writes day-lines.json beside this file. Results: README.md, "Day lines".
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const [prefix, beforeDir, afterDir] = process.argv.slice(2)
if (!prefix || !beforeDir || !afterDir)
  throw new Error("usage: node day-lines.ts <folder with tg-cli> <cli-core dir before> <cli-core dir after>")
const here = dirname(fileURLToPath(import.meta.url))
const tgDir = join(prefix, "node_modules/@wirecat/tg-cli")
const version = (dir: string) => JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version as string

const home = mkdtempSync(join(tmpdir(), "day-lines-"))
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
execFileSync(
  process.execPath,
  [join(here, "seed.ts"), join(prefix, "node_modules/@wirecat/cli-core"), env.MESSAGING_STORE, env.TG_STATE_DIR],
  { env },
)

const cases = [
  { label: "messages list 1 --limit 1000", shape: "message", args: ["messages", "list", "1", "--limit", "1000"] },
  { label: "messages list 1 --limit 50", shape: "message", args: ["messages", "list", "1", "--limit", "50"] },
  {
    label: "messages list 1 'date>=2026-09-10 date<2026-09-12'",
    shape: "message",
    args: ["messages", "list", "1", "date>=2026-09-10 date<2026-09-12", "--limit", "200"],
  },
  {
    label: "search messages счёт --limit 50",
    shape: "message.hit",
    args: ["search", "messages", "счёт", "--limit", "50"],
  },
]

const renderers = {
  before: await import(join(beforeDir, "dist/cli/compact.js")),
  after: await import(join(afterDir, "dist/cli/compact.js")),
}
const outputs = mkdtempSync(join(tmpdir(), "day-lines-out-"))
const measured = cases.map((one, at) => {
  const json = execFileSync(
    process.execPath,
    [join(tgDir, "dist/bin/tg.js"), "bench", ...one.args, "--offline", "--json"],
    {
      env,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    },
  )
  const body = JSON.parse(json)
  // The JSON answer's step towards --compact is not part of the compact answer.
  body.next = (body.next ?? []).filter((step: { step: string }) => step.step !== "output.compact")
  const files: Record<string, string> = { json: join(outputs, `${at}.json`) }
  writeFileSync(files.json as string, json)
  for (const [name, { compactText, SHARED_ROWS }] of Object.entries(renderers)) {
    files[name] = join(outputs, `${at}.${name}`)
    writeFileSync(files[name] as string, `${compactText(body, SHARED_ROWS[one.shape], { timezone: "UTC" })}\n`)
  }
  const texts = (body.items as { text?: string; excerpt?: string }[]).reduce(
    (sum, item) => sum + Buffer.byteLength(item.text ?? item.excerpt ?? ""),
    0,
  )
  return { label: one.label, files, texts }
})

const tokens = JSON.parse(
  execFileSync(
    "uv",
    [
      "run",
      "--quiet",
      "--no-project",
      "--with",
      "tiktoken==0.14.0",
      "python",
      "-I",
      join(here, "tokens.py"),
      ...measured.flatMap((one) => Object.values(one.files)),
    ],
    { encoding: "utf8" },
  ),
) as { encoding: string; tiktoken: string; tokens: Record<string, number> }

const share = (part: number, whole: number) => Math.round((part / whole) * 1000) / 10
const rows = measured.map(({ label, files, texts }) => {
  const bytes = (file: string) => readFileSync(file).byteLength
  const json = { bytes: bytes(files.json as string), tokens: tokens.tokens[files.json as string] as number }
  const form = (name: "before" | "after") => {
    const out = { bytes: bytes(files[name] as string), tokens: tokens.tokens[files[name] as string] as number }
    return { ...out, bytes_pct: share(out.bytes, json.bytes), tokens_pct: share(out.tokens, json.tokens) }
  }
  return {
    label,
    json,
    before: form("before"),
    after: form("after"),
    texts_bytes: texts,
    texts_pct: share(texts, json.bytes),
  }
})

const result = {
  date: new Date().toISOString().slice(0, 10),
  node: process.version,
  tg: version(tgDir),
  cli_core_before: version(beforeDir),
  cli_core_after: version(afterDir),
  tokens: { encoding: tokens.encoding, tiktoken: tokens.tiktoken },
  rows,
}
writeFileSync(join(here, "day-lines.json"), `${JSON.stringify(result, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`)
