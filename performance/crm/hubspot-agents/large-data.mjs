#!/usr/bin/env node
// Round 2's invented account: about 5,000 contacts, 2,000 deals and 3,000 notes around the needles that
// key-large.md names. Deterministic: a fixed seed, no clock, no network, no model. `node large-data.mjs` prints the
// counts and a checksum, so two runs can be compared.
// Every person, company, phone and address is made up. Companies and contacts sit under l2.seed.wirecat.dev, apart
// from round 1's seed.wirecat.dev, so the cleanup can tell them apart.
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { X } from "./large-needles.mjs"
import {
  CALLS,
  CONTACTS_DRAWN,
  chance,
  dateBetween,
  everyContact,
  fill,
  int,
  isoHour,
  LOCALES,
  LOST,
  MEETINGS,
  noteBody,
  noteLang,
  PRODUCTS,
  pad,
  pick,
  RESERVED,
  rng,
  SIZE,
  STAGES,
  slug,
  TAG_DOMAIN,
  TASKS,
  weighted,
  ymd,
} from "./large-pools.mjs"

export { everyContact, slug, TAG_DOMAIN }

// --- the random account --------------------------------------------------------------------------------------

const build = () => {
  const companies = []
  const names = new Set(X.companies.map((c) => c.name))
  const localeOf = () => weighted(Object.entries(LOCALES).map(([k, v]) => [k, v.weight]))
  while (companies.length < SIZE.companies - X.companies.length) {
    const locale = localeOf()
    const L = LOCALES[locale]
    const [kind, industry] = pick(L.kinds)
    const name = L.company(pick(L.roots), kind)
    if (names.has(name)) continue
    names.add(name)
    companies.push({
      key: `c${pad(companies.length, 4)}`,
      name,
      city: pick(L.cities),
      industry,
      phone: L.phone(),
      locale,
    })
  }
  const allCompanies = [...companies, ...X.companies]
  const domains = new Set()
  for (const c of allCompanies) {
    let domain = `${slug(c.name).slice(0, 40)}.${TAG_DOMAIN}`
    for (let n = 2; domains.has(domain); n++) domain = `${slug(c.name).slice(0, 37)}-${n}.${TAG_DOMAIN}`
    domains.add(domain)
    c.domain = domain
  }

  const contacts = []
  const emails = new Set()
  const email = (first, last, company) => {
    const base = `${slug(first)}.${slug(last)}`.replace(/-/g, "") || "contact"
    const host = company ? company.domain : `mail.${TAG_DOMAIN}`
    let mail = `${base}@${host}`
    for (let n = 2; emails.has(mail); n++) mail = `${base}${n}@${host}`
    emails.add(mail)
    return mail
  }
  const latinRu = (word) => {
    const s = slug(word).replace(/-/g, "")
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  while (contacts.length < CONTACTS_DRAWN) {
    const company = companies[Math.floor(rng() * companies.length)]
    let L = LOCALES[company.locale]
    let latin = false
    if (company.locale !== "ru" && chance(0.08)) {
      L = LOCALES.ru
      latin = true
    }
    const female = chance(0.45)
    let first = pick(female ? L.female : L.male)
    let last = pick(L.last)
    if (RESERVED.test(last)) continue
    if (L === LOCALES.ru && female) last = last.endsWith("ий") ? `${last.slice(0, -2)}ая` : `${last}а`
    if (latin || (company.locale === "ru" && chance(0.05))) [first, last] = [latinRu(first), latinRu(last)]
    contacts.push({
      key: `p${pad(contacts.length, 4)}`,
      first,
      last,
      company: company.key,
      city: chance(0.9) ? company.city : pick(LOCALES[company.locale].cities),
      title: pick(LOCALES[company.locale].titles),
      phone: LOCALES[company.locale].phone(),
    })
  }
  const companyBy = new Map(allCompanies.map((c) => [c.key, c]))
  for (const p of X.contacts) {
    if (!p.company) {
      const host = companies.find((one) => one.city === p.city) ?? companies[0]
      p.company = host.key
    }
    p.email = email(p.first, p.last, companyBy.get(p.company))
  }
  for (const p of contacts) p.email = email(p.first, p.last, companyBy.get(p.company))
  const allContacts = [...contacts.slice(0, SIZE.contacts - X.contacts.length), ...X.contacts]
  everyContact.push(...contacts, ...X.contacts)
  const staff = new Map()
  for (const p of allContacts) staff.set(p.company, [...(staff.get(p.company) ?? []), p])

  const deals = []
  const dealNames = new Set(X.deals.map((d) => d.name))
  while (deals.length < SIZE.deals - X.deals.length) {
    const company = companies[Math.floor(rng() * companies.length)]
    const people = staff.get(company.key) ?? []
    const products = PRODUCTS[company.locale]
    const name = `${company.name.replace(/ (SL|SA|SpA|Srl|Ltd|GmbH|AG|GmbH & Co\. KG|Group)$/, "")} — ${pick(products)}`
    if (dealNames.has(name)) continue
    dealNames.add(name)
    const stage = weighted(STAGES)
    const closed = stage.startsWith("Closed")
    const close = closed ? dateBetween("2025-06-01", "2026-11-20") : dateBetween("2026-11-25", "2027-06-30")
    deals.push({
      key: `d${pad(deals.length, 4)}`,
      name,
      company: company.key,
      contacts: people.length ? [pick(people).key, ...(chance(0.3) ? [pick(people).key] : [])] : [],
      stage,
      amount: int(4, 120) * 500,
      close: ymd(close),
      ...(stage === "Closed Lost" ? { lost: pick(LOST[company.locale]) } : {}),
    })
  }
  for (const d of deals) d.contacts = [...new Set(d.contacts)]
  const allDeals = [...deals, ...X.deals]
  const dealsOf = new Map()
  for (const d of allDeals) dealsOf.set(d.company, [...(dealsOf.get(d.company) ?? []), d])

  const personName = (p) => (chance(0.5) ? p.first : `${p.first} ${p.last}`)
  const activityContext = (from, to) => {
    const deal = chance(0.82) ? deals[Math.floor(rng() * deals.length)] : null
    const company = deal ? companyBy.get(deal.company) : companies[Math.floor(rng() * companies.length)]
    const people = staff.get(company.key) ?? []
    const person = deal?.contacts.length ? allContacts.find((p) => p.key === pick(deal.contacts)) : pick(people)
    const at = isoHour(dateBetween(from, to))
    return {
      deal,
      company,
      person,
      at,
      ctx: { person: person ? personName(person) : "клиент", at, company: company.name },
    }
  }
  const links = ({ deal, company, person }) => ({
    deal: deal?.key ?? null,
    company: company.key,
    contacts: person ? [person.key] : [],
  })

  const notes = []
  while (notes.length < SIZE.notes - X.notes.length) {
    const one = activityContext("2025-09-01", "2026-11-22")
    notes.push({
      key: `n${pad(notes.length, 4)}`,
      ...links(one),
      at: one.at,
      body: noteBody(noteLang(one.company.locale), one.ctx),
    })
  }
  // A planted note with no record of its own lands on a random company of its language, dated in the last year.
  const langLocale = { ru: "ru", en: "en", es: "es", de: "de" }
  for (const n of X.notes) {
    if (n.at === null) n.at = isoHour(dateBetween("2025-11-01", "2026-11-22"))
    if (n.attach) {
      const host = pick(companies.filter((c) => c.locale === langLocale[n.lang]))
      n.company = host.key
      n.deal = null
      n.contacts = (staff.get(host.key) ?? []).slice(0, 1).map((p) => p.key)
      delete n.attach
      delete n.lang
    }
  }

  const tasks = []
  while (tasks.length < SIZE.tasks - X.tasks.length) {
    const one = activityContext("2026-08-01", "2027-01-31")
    const lang = noteLang(one.company.locale)
    const due = Date.parse(one.at)
    const status =
      due < Date.parse("2026-11-23")
        ? weighted([
            ["COMPLETED", 75],
            ["NOT_STARTED", 18],
            ["IN_PROGRESS", 7],
          ])
        : weighted([
            ["NOT_STARTED", 85],
            ["IN_PROGRESS", 15],
          ])
    tasks.push({
      key: `t${pad(tasks.length, 4)}`,
      ...links(one),
      due: one.at,
      status,
      priority: pick(["LOW", "MEDIUM", "MEDIUM", "HIGH"]),
      subject: fill(pick(TASKS[lang]), one.ctx),
      body: "",
    })
  }
  const calls = []
  while (calls.length < SIZE.calls - X.calls.length) {
    const one = activityContext("2025-10-01", "2026-11-22")
    const [title, body] = pick(CALLS[noteLang(one.company.locale)])
    calls.push({
      key: `k${pad(calls.length, 4)}`,
      ...links(one),
      at: one.at,
      minutes: int(3, 55),
      title: fill(title, one.ctx),
      body: fill(body, one.ctx),
    })
  }
  const meetings = []
  while (meetings.length < SIZE.meetings - X.meetings.length) {
    const one = activityContext("2025-10-01", "2026-12-20")
    const [title, body] = pick(MEETINGS[noteLang(one.company.locale)])
    const end = new Date(Date.parse(one.at) + pick([30, 45, 60, 90]) * 60_000).toISOString().replace(".000Z", "Z")
    meetings.push({
      key: `m${pad(meetings.length, 4)}`,
      ...links(one),
      start: one.at,
      end,
      title: fill(title, one.ctx),
      body: fill(body, one.ctx),
    })
  }

  return {
    companies: allCompanies.map(({ locale, ...c }) => c),
    contacts: allContacts,
    deals: allDeals,
    notes: [...notes, ...X.notes],
    tasks: [...tasks, ...X.tasks],
    calls: [...calls, ...X.calls],
    meetings: [...meetings, ...X.meetings],
  }
}

export const data = build()

// What each question's key rests on: the planted record, the facts it must hold when read back from HubSpot, and the
// records it must be associated with. seed-large.mjs verify checks every line.
const has = (object, key, expect, assoc = []) => ({ object, key, expect, assoc })
export const NEEDLES = {
  L1: [
    has(
      "contacts",
      "x-hoffmann-jens",
      { firstname: "Jens", lastname: "Hoffmann", city: "Hamburg", phone: "+49 40 318 2247" },
      [["companies", "x-hafenkontor"]],
    ),
    has("contacts", "x-hofmann-jens", { lastname: "Hofmann", city: "Hannover" }),
    has("contacts", "x-hoffman-jens", { lastname: "Hoffman", city: "Bremen" }),
  ],
  L2: [
    has("deals", "x-schmid-tickets", { dealname: "Schmid & Söhne", amount: "34000" }, [
      ["companies", "x-schmid-soehne"],
    ]),
    has("deals", "x-schmid-docs", { amount: "21500" }, [["companies", "x-schmid-soehne"]]),
    has("deals", "x-schmid-voice", { closed_lost_reason: "Kein Budget" }, [["companies", "x-schmid-soehne"]]),
    has("companies", "x-schmid-soehne", { name: "Schmid & Söhne Antriebstechnik GmbH", city: "Stuttgart" }),
  ],
  L3: [
    has("contacts", "x-gimenez-lucia", { lastname: "Giménez", city: "Valencia" }, [["companies", "x-huerta"]]),
    has("notes", "x-n-huerta-new", { hs_note_body: "30 socios", hs_timestamp: "2026-11-17" }, [
      ["deals", "x-huerta-bot"],
      ["contacts", "x-gimenez-lucia"],
    ]),
    has("notes", "x-n-huerta-old", { hs_timestamp: "2026-10-08" }, [["contacts", "x-gimenez-lucia"]]),
  ],
  L4: [
    has("notes", "x-n-pennine", { hs_note_body: "rollout slipped again" }, [
      ["companies", "x-pennine"],
      ["deals", "x-pennine-deal"],
    ]),
    has("notes", "x-n-brisa", { hs_note_body: "no la cumplimos" }, [
      ["companies", "x-brisa"],
      ["deals", "x-brisa-deal"],
    ]),
    has("notes", "x-n-lindenhof", { hs_note_body: "zum zweiten Mal verschoben" }, [
      ["companies", "x-lindenhof"],
      ["deals", "x-lindenhof-deal"],
    ]),
    has("notes", "x-n-kama", { hs_note_body: "второй раз верит нам" }, [
      ["companies", "x-kamaagro"],
      ["deals", "x-kama-deal"],
    ]),
  ],
  L5: [
    has("notes", "x-n-irtysh", { hs_note_body: "на казахском" }, [["deals", "x-irtysh-deal"]]),
    has("deals", "x-irtysh-deal", { dealname: "Иртыш Ритейл — ассистент для покупателей", amount: "26400" }),
  ],
  L6: [
    has("notes", "x-n-ferraro", { hs_note_body: "Marco Bellini" }, [["deals", "x-ferraro-deal"]]),
    has("tasks", "x-t-ferraro", { hs_task_subject: "Send revised estimate to Ferraro", hs_timestamp: "2026-12-04" }, [
      ["deals", "x-ferraro-deal"],
    ]),
    has("tasks", "x-t-ferrara", { hs_timestamp: "2026-11-27" }, [["deals", "x-ferrara-deal"]]),
  ],
  L7: [
    has("notes", "x-n-volna", { hs_note_body: "почти вдвое меньше" }, [
      ["companies", "x-volna"],
      ["deals", "x-volna-deal"],
    ]),
    has("notes", "x-n-albora", { hs_note_body: "35 % por debajo" }, [
      ["companies", "x-albora"],
      ["deals", "x-albora-deal"],
    ]),
    has("notes", "x-n-kestrel", { hs_note_body: "roughly 60% of ours" }, [
      ["companies", "x-kestrel"],
      ["deals", "x-kestrel-deal"],
    ]),
  ],
  L8: [
    has(
      "meetings",
      "x-m-volga",
      { hs_meeting_title: "Волга Агрохолдинг: встреча в Казани", hs_meeting_start_time: "2026-11-05" },
      [
        ["contacts", "x-petrov-alexandr"],
        ["deals", "x-volga-deal"],
      ],
    ),
    has("contacts", "x-petrov-alexandr", { firstname: "Александр", lastname: "Петров", city: "Казань" }),
  ],
  L9: [has("notes", "x-n-prepay-2", { hs_note_body: "no discount discussed" })],
  L10: [
    has("calls", "x-c-itsasoa", { hs_call_body: "1 de diciembre", hs_call_title: "Itsasoa" }, [
      ["companies", "x-itsasoa"],
      ["deals", "x-itsasoa-deal"],
    ]),
    has("companies", "x-itsasoa", { city: "Bilbao" }),
  ],
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]))
  const planted = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v.filter((r) => r.key.startsWith("x-")).length]),
  )
  const sum = createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 16)
  process.stdout.write(`${JSON.stringify({ counts, planted, sha256: sum })}\n`)
  if (process.argv.includes("--sample")) {
    for (const n of data.notes.slice(0, 6)) process.stdout.write(`--- ${n.key} ${n.at}\n${n.body}\n`)
  }
}
