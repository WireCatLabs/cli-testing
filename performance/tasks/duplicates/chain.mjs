// The duplicate chain's text and signature steps, shared by evaluate.mjs and linked.mjs. The first run downloads
// @wirecat/cli-core into .cache/ for its Snowball stemmers.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
export const CORE_VERSION = "0.303.0"
export const CORE_INTEGRITY =
  // biome-ignore lint/security/noSecrets: published package integrity hash, not a key
  "sha512-uBOSOaFttYyHEzcKPdPLm3mJ8Ua0qIBePkv7LZf3M0MEL06TXkCa9KUHz4urWxXE5okiE7AF/yIwx8PFmJtWJQ=="
export const DAY = 86_400_000

const coreDir = join(here, ".cache", `cli-core-${CORE_VERSION}`)
if (!existsSync(join(coreDir, "package", "dist", "search", "task-signature.js"))) {
  mkdirSync(coreDir, { recursive: true })
  const [packed] = JSON.parse(
    execFileSync("npm", ["pack", `@wirecat/cli-core@${CORE_VERSION}`, "--json", "--pack-destination", coreDir], {
      encoding: "utf8",
    }),
  )
  const tarball = join(coreDir, packed.filename)
  const integrity = `sha512-${createHash("sha512").update(readFileSync(tarball)).digest("base64")}`
  if (integrity !== CORE_INTEGRITY) throw new Error(`cli-core ${CORE_VERSION} integrity mismatch: ${integrity}`)
  execFileSync("tar", [
    "xzf",
    tarball,
    "-C",
    coreDir,
    "package/dist/search/snowball",
    "package/dist/store/normalize.js",
    "package/dist/search/task-signature.js",
  ])
}
const load = async (path) => (await import(pathToFileURL(join(coreDir, "package", "dist", path)).href)).default
export const { normalize } = await import(pathToFileURL(join(coreDir, "package", "dist", "store", "normalize.js")).href)
const RussianStemmer = await load("search/snowball/russian-stemmer.js")
const EnglishStemmer = await load("search/snowball/english-stemmer.js")
const SpanishStemmer = await load("search/snowball/spanish-stemmer.js")

// Mirrors createStemmer in cli-core src/search/stem.ts (not a public export): same token pattern, same script
// test, Snowball on the lower-cased word, normalize() after. Latin words get both default stemmers.
const TOKEN = /[\p{L}\p{N}\p{Co}\p{M}]+/gu
const MARKS = /\p{M}+/gu
const CYRILLIC = /^\p{Script=Cyrillic}+$/u
const LATIN = /^\p{Script=Latin}+$/u
const russian = new RussianStemmer()
const latins = [new EnglishStemmer(), new SpanishStemmer()]
const stemCache = new Map()
const stemsOf = (token) => {
  let stems = stemCache.get(token)
  if (stems) return stems
  const word = token.normalize("NFC").toLowerCase().replace(MARKS, "")
  const engines = CYRILLIC.test(word) ? [russian] : LATIN.test(word) ? latins : [null]
  stems = [...new Set(engines.map((engine) => normalize(engine?.stemWord(word) || word)).filter(Boolean))]
  stemCache.set(token, stems)
  return stems
}

// Not in cli-core 0.277.0: its normalize() keeps `15 000` as two tokens and search keeps every word.
export const joinDigitGroups = (text) => text.replace(/(\d)[   ,](?=\d{3}(?!\d))/gu, "$1")
const STOP = new Set(
  (
    "и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от " +
    "меня еще нет о из ему теперь когда даже ну ли если уже или ни быть был него до вас нибудь опять уж вам ведь " +
    "там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без чего раз тоже " +
    "себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мои тем чтобы нее " +
    "сейчас были куда зачем всех можно при об другой хоть после над больше тот через эти нас про всего них какая " +
    "много три эту моя свою этой перед им всегда между пожалуиста плиз " +
    "i me my we our you your he him his she her it its they them their what which who this that these those am " +
    "is are was were be been being have has had do does did a an the and but if or because as until while of at " +
    "by for with about against between into through during before after above below to from up down in out on off " +
    "over under again further then once here there when where why how all any both each few more most other some " +
    "such no nor not only own same so than too very s t can will just don should now please pls hi hey"
  ).split(" "),
)

export const analyze = (text) => {
  const normalized = normalize(joinDigitGroups(text))
  const tokens = (joinDigitGroups(text).normalize("NFC").toLowerCase().match(TOKEN) ?? []).filter(
    (token) => !STOP.has(normalize(token)),
  )
  return { normalized, stems: new Set(tokens.flatMap(stemsOf)) }
}
export const trigrams = (text) => {
  const grams = new Set()
  for (let i = 0; i + 3 <= text.length; i++) grams.add(text.slice(i, i + 3))
  return grams
}
export const jaccard = (a, b) => {
  if (!a.size || !b.size) return 0
  let shared = 0
  for (const item of a) if (b.has(item)) shared++
  return shared / (a.size + b.size - shared)
}

// Amounts and due dates come from cli-core itself, so a fix there reaches this test with a version bump.
const signature = await import(pathToFileURL(join(coreDir, "package", "dist", "search", "task-signature.js")).href)
export const { amountOf, dayOf } = signature
export const dueOf = signature.dueDayOf
