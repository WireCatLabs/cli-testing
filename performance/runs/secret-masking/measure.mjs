import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const [packageDir, seedArg = "442", sizeArg = "5000"] = process.argv.slice(2)
if (!packageDir) {
  process.stderr.write("usage: node measure.mjs <unpacked @wirecat/cli-core package dir> [seed] [samples]\n")
  process.exit(2)
}
// The detector is not a public export of cli-core, so the published file is loaded by path; it imports nothing.
const { withoutSecrets, looksRandom } = await import(
  pathToFileURL(join(resolve(packageDir), "dist/runs/secrets.js")).href
)

const seed = Number(seedArg)
const samples = Number(sizeArg)
let state = seed >>> 0
const random = () => {
  state = (state + 0x6d2b79f5) >>> 0
  let t = state
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (length, alphabet) =>
  Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join("")

const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const lower = "abcdefghijklmnopqrstuvwxyz"
const digits = "0123456789"
const base62 = upper + lower + digits
const alphabets = {
  base62: base62,
  "base64url (`_-`)": `${base62}_-`,
  "base64 (`+/`)": `${base62}+/`,
  "hex, lower case": "0123456789abcdef",
  "hex, upper case": "0123456789ABCDEF",
  "base36, lower case": lower + digits,
}
const lengths = [20, 24, 32, 39, 40, 64]

const hidden = (text) => withoutSecrets(text) !== text
const inSentence = (value) => `the value ${value} was typed`
const percent = (count, total) => `${((100 * count) / total).toFixed(1)} %`

const out = (line = "") => process.stdout.write(`${line}\n`)
out(`seed ${seed}, ${samples} samples per cell, Node ${process.version}`)
out()
out("## Random strings, hidden inside a sentence (looksRandom alone in brackets)")
out()
out(`| alphabet | ${lengths.join(" | ")} |`)
out(`|---|${lengths.map(() => "---").join("|")}|`)
for (const [name, alphabet] of Object.entries(alphabets)) {
  const cells = lengths.map((length) => {
    let masked = 0
    let random_ = 0
    for (let at = 0; at < samples; at++) {
      const value = pick(length, alphabet)
      if (hidden(inSentence(value))) masked += 1
      if (looksRandom(value)) random_ += 1
    }
    return `${percent(masked, samples)} (${percent(random_, samples)})`
  })
  out(`| ${name} | ${cells.join(" | ")} |`)
}

const rate = (make) => {
  let masked = 0
  for (let at = 0; at < samples; at++) if (hidden(make())) masked += 1
  return percent(masked, samples)
}
const driveId = () => `1${pick(32, `${base62}_-`)}`
const hex = (length) => pick(length, "0123456789abcdef")
const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`

out()
out("## Generated ids and secrets of a known shape")
out()
out("| case | hidden |")
out("|---|---|")
const shaped = {
  "Drive file id, bare (33 chars)": () => inSentence(driveId()),
  "Drive file id in a drive.google.com URL": () => inSentence(`https://drive.google.com/file/d/${driveId()}/view`),
  "Drive file id in a path": () => inSentence(`/home/user/Downloads/${driveId()}.pdf`),
  "YouTube id, bare (11 chars)": () => inSentence(pick(11, `${base62}_-`)),
  "UUID v4": () => inSentence(uuid()),
  "WhatsApp message id (`3EB0` + 18 upper-case hex)": () => inSentence(`3EB0${pick(18, "0123456789ABCDEF")}`),
  "Run id (`<UTC time>-<command>-<6 hex>`)": () => inSentence(`20261026T120000Z-chats-list-${hex(6)}`),
  "GitHub token (`ghp_` + 36 base62)": () => inSentence(`ghp_${pick(36, base62)}`),
  "OpenAI-style key (`sk-` + 48 base62)": () => inSentence(`sk-${pick(48, base62)}`),
  "AWS access key id (`AKIA` + 16)": () => inSentence(`AKIA${pick(16, upper + digits)}`),
  "Telegram bot token (10 digits `:` 35)": () => inSentence(`${pick(10, digits)}:${pick(35, `${base62}_-`)}`),
  "Random key after `password=`": () => `password=${pick(12, base62)}`,
  "Random key after `--api-key `": () => `--api-key ${pick(12, base62)}`,
  "Random 12-char password, no name": () => inSentence(pick(12, base62)),
  "Random 32-char key in a URL query, unnamed (`?code=`)": () =>
    inSentence(`https://example.com/callback?code=${pick(32, base62)}`),
  "Random 32-char key in a URL query, named (`?token=`)": () =>
    inSentence(`https://example.com/callback?token=${pick(32, base62)}`),
  "Random 40-char hex key, no name": () => inSentence(hex(40)),
  "Random 40-char base64 key starting with `/`": () => inSentence(`/${pick(39, `${base62}+/`)}`),
}
for (const [name, make] of Object.entries(shaped)) out(`| ${name} | ${rate(make)} |`)

// Words people and tools write that a careless rule would hide. Each is checked once, as written.
const words = [
  "MESSAGING_LIMIT_TIER_0",
  "InlineQueryResultMpeg4Gif",
  "InlineQueryResultCachedMpeg4Gif",
  "SyntheticDocument_000123",
  "20260920T084431Z-chats-list-a81f2c",
  "onnx-community/embeddinggemma-300m-ONNX",
  "mmarco-mMiniLMv2-L12-H384-v1",
  "3EB0C767D26A1D8F5E2C6B",
  "X-Hub-Signature-256",
  "OnUnitInactiveSec=15min",
  "RestartPreventExitStatus=4",
  "2026-01-03T09:05:12.000Z",
  "550e8400-e29b-41d4-a716-446655440000",
  "getUpdatesWithTimeout2025",
  "PropertyList-1.0",
  "Release-v0.440.0-candidate",
  "feature-2026-10-26_Report",
  "useEffectHook_v2Final",
  "AbCdEf_document_2026_v3",
  "Q3-2026-Revenue-Forecast-v2",
  // biome-ignore lint/security/noSecrets: a product name; that it looks random to Biome is why it is here
  "iPhone15ProMax-256GB-Blue",
  "WireCatLabs-cli-core-pr-2036",
  // biome-ignore lint/security/noSecrets: a made-up video id
  "https://www.youtube.com/watch?v=aB3dE5fG7hI",
  "https://docs.google.com/document/d/1aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT1uV2wX3yZ4aB5c/edit",
  "/home/user/Projects/AI/cli-core/src/runs/secrets.ts",
  "~/Library/Application Support/WireCat/runs/index.jsonl",
  "Привет! Встреча перенесена на завтра, 10:00, переговорная Б-204",
  "Ключ_доступа_к_отчёту_за_третий_квартал",
  "🚀 Released v0.442.0 🎉 thanks everyone 🙌",
]
out()
out("## Ids, names, URLs and text that must stay")
out()
out("| text | outcome |")
out("|---|---|")
for (const word of words) out(`| \`${word}\` | ${hidden(inSentence(word)) ? "**hidden**" : "kept"} |`)
