// The duplicate chain's text and signature steps, shared by evaluate.mjs and linked.mjs. The first run downloads
// @wirecat/cli-core into .cache/ for its Snowball stemmers.
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
export const CORE_VERSION = "0.277.0"
export const CORE_INTEGRITY =
  // biome-ignore lint/security/noSecrets: published package integrity hash, not a key
  "sha512-X0IBZ2waGP3EV4R5mbUnpT+nUFjXvPXvkwAS2lK3yeUfWVbazIVp1kJz1G2fKwsN7ZQH5dvW7zroeGWhyTk+Vg=="
export const DAY = 86_400_000

const coreDir = join(here, ".cache", `cli-core-${CORE_VERSION}`)
if (!existsSync(join(coreDir, "package", "dist", "store", "normalize.js"))) {
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

const CURRENCY = [
  [/^(₽|руб.*|р\.?|rub)$/u, "RUB"],
  [/^(€|eur|евро|euros?)$/u, "EUR"],
  [/^(\$|usd|долл.*|dollars?)$/u, "USD"],
]
const currencyOf = (word) => (word ? (CURRENCY.find(([pattern]) => pattern.test(word))?.[1] ?? null) : null)
const AMOUNT =
  /(?<![\p{L}\p{N}])([$€₽])?\s?(\d+(?:[.,]\d+)?)(?:([кk])(?![\p{L}])|\s?(тыс\.?|тысяч\p{L}*))?(?![\p{N}])\s?(₽|руб\p{L}*\.?|р\.|р(?![\p{L}])|rub|eur|евро|€|\$|usd|долл\p{L}*|dollars?|euros?)?(?![\p{L}])/gu
export const amountOf = (text) => {
  for (const match of text.matchAll(AMOUNT)) {
    const [, before, number, short, long, after] = match
    const multiplier = short ?? long
    if (!before && !after && !multiplier) continue
    const value = Math.round(Number(number.replace(",", ".")) * (multiplier ? 1000 : 1))
    return { value, currency: currencyOf(before ?? after?.replace(/\.$/u, "")) }
  }
  return null
}

const RU_WEEKDAYS = ["воскресен", "понедельник", "вторник", "сред", "четверг", "пятниц", "суббот"]
const EN_WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const WEEKDAY_WORDS =
  "понедельник[аеу]?|вторник[аеу]?|сред[аеуы]|четверг[аеу]?|пятниц[аеуы]|суббот[аеуы]|воскресень[еяю]|" +
  EN_WEEKDAYS.join("|")
// Whole month words only: a prefix test read `decide 3` as December 3 and `maybe 2` as May 2.
const MONTHS = [
  /^(январ[ьяею]|jan(uary)?)$/u,
  /^(феврал[ьяею]|feb(ruary)?)$/u,
  /^(март[ауе]?|mar(ch)?)$/u,
  /^(апрел[ьяею]|apr(il)?)$/u,
  /^(ма[яеию]|may)$/u,
  /^(июн[ьяею]|june?)$/u,
  /^(июл[ьяею]|july?)$/u,
  /^(август[ауе]?|aug(ust)?)$/u,
  /^(сентябр[ьяею]|sept?(ember)?)$/u,
  /^(октябр[ьяею]|oct(ober)?)$/u,
  /^(ноябр[ьяею]|nov(ember)?)$/u,
  /^(декабр[ьяею]|dec(ember)?)$/u,
]
const monthIndex = (word) => MONTHS.findIndex((month) => month.test(word))
// A due date is a calendar date where the owner is: the machine's time zone, not UTC.
export const dayOf = (ms) => {
  const date = new Date(ms)
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY)
}
const dateDay = (year, month, day) => Math.floor(Date.UTC(year, month, day) / DAY)
// JavaScript's \b knows only ASCII letters: without these edges `средства` read as Wednesday, `завтрак` as tomorrow.
const words = (source) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${source})(?![\\p{L}\\p{N}])`, "u")
const DUE_PATTERNS = [
  [words("послезавтра"), (_, now) => now + 2],
  [words("завтра|tomorrow"), (_, now) => now + 1],
  [words("сегодня|today"), (_, now) => now],
  [words("(\\d{1,2})\\.(\\d{2})"), (m, _, year) => dateDay(year, Number(m[2]) - 1, Number(m[1]))],
  [words("(\\d{1,2})(?:st|nd|rd|th)?\\s+(\\p{L}+)"), (m, _, year) => monthDate(year, m[2], m[1])],
  [words("(\\p{L}+)\\.?\\s+(\\d{1,2})"), (m, _, year) => monthDate(year, m[1], m[2])],
  [
    words("(?:до|к|by|until|before|on|deadline)\\s+(?:the\\s+)?(\\d{1,2})(?:-?(?:го|е|числа)|\\s+числа|st|nd|rd|th)"),
    nthDay,
  ],
  [words("конца месяца|end of (?:the )?month"), (_, now) => monthEnd(now)],
  [words(`(${WEEKDAY_WORDS})`), nextWeekday],
]
function monthDate(year, word, day) {
  const month = monthIndex(word)
  return month < 0 || Number(day) > 31 ? undefined : dateDay(year, month, Number(day))
}
function nthDay(m, now) {
  const date = new Date(now * DAY)
  const day = Number(m[1])
  const sameMonth = dateDay(date.getUTCFullYear(), date.getUTCMonth(), day)
  return sameMonth >= now ? sameMonth : dateDay(date.getUTCFullYear(), date.getUTCMonth() + 1, day)
}
function monthEnd(now) {
  const date = new Date(now * DAY)
  return dateDay(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
}
function nextWeekday(m, now) {
  const word = m[1]
  const target = Math.max(
    RU_WEEKDAYS.findIndex((stem) => word.startsWith(stem)),
    EN_WEEKDAYS.indexOf(word),
  )
  for (let day = now + 1; ; day++) if (new Date(day * DAY).getUTCDay() === target) return day
}
export const dueOf = (text, createdMs) => {
  const now = dayOf(createdMs)
  const year = new Date(createdMs).getFullYear()
  let best
  for (const [pattern, resolve] of DUE_PATTERNS)
    for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) {
      const day = resolve(match, now, year)
      if (day === undefined || Number.isNaN(day)) continue
      if (!best || match.index < best.index) best = { index: match.index, day }
      break
    }
  return best?.day ?? null
}
