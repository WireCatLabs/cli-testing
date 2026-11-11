// Synthetic CRM for the search benchmark: seeded, so every run builds the same portal. No real names of clients.

export const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export interface Company {
  key: string
  title: string
  short: string
}
export interface Contact {
  key: string
  name: string
  lastName: string
  email: string
  company: string
}
export interface Item {
  key: string
  kind: "deal" | "lead"
  title: string
  stage: string
  categoryId?: number
  amount: number
  currency: string
  company?: string
  contacts: string[]
  person?: { name: string; lastName: string }
  companyTitle?: string
}

const RU_ROOTS = [
  "Альфа",
  "Вектор",
  "Гранит",
  "Меридиан",
  "Сфера",
  "Орион",
  "Полимер",
  "Стройресурс",
  "Техносфера",
  "Энергия",
  "Агропром",
  "Логистика",
  "Монолит",
  "Квант",
  "Северный путь",
  "Импульс",
  "Атлант",
  "Ромашка",
  "Волга",
  "Уралтех-Сервис",
  "Байкал",
  "Светоч",
  "Пирамида",
  "Лидер",
]
const RU_SUFFIX = ["-М", " Плюс", " Групп", " Трейд", "-Строй", ""]
const RU_FORM = ["ООО", "АО", "ЗАО", "ГК"]
const EN_ROOTS = [
  "Northwind",
  "Contoso",
  "Fabrikam",
  "Globex",
  "Initech",
  "Umbrella",
  "Acme",
  "Hooli",
  "Vandelay",
  "Soylent",
  "Tyrell",
  "Wonka",
  "Stark",
  "Oscorp",
  "Cyberdyne",
  "Pied Piper",
]
const EN_FORM = [" Ltd", " GmbH", " Inc", " Trading", " Logistics", " S.L."]

const RU_FIRST = [
  ["Иван", "Иванов"],
  ["Ольга", "Кузнецова"],
  ["Сергей", "Смирнов"],
  ["Анна", "Попова"],
  ["Дмитрий", "Волков"],
  ["Елена", "Соколова"],
  ["Алексей", "Морозов"],
  ["Мария", "Лебедева"],
  ["Павел", "Новиков"],
  ["Наталья", "Козлова"],
  ["Андрей", "Егоров"],
  ["Татьяна", "Павлова"],
  ["Михаил", "Семёнов"],
  ["Юлия", "Голубева"],
  ["Николай", "Виноградов"],
  ["Светлана", "Богданова"],
  ["Артём", "Фёдоров"],
  ["Ксения", "Михайлова"],
]
const EN_FIRST = [
  ["John", "Smith"],
  ["Emma", "Brown"],
  ["Lucas", "Martin"],
  ["Sophie", "Taylor"],
  ["Carlos", "García"],
  ["Laura", "Fernández"],
  ["Oliver", "Wilson"],
  ["Mia", "Becker"],
  ["Noah", "Schulz"],
  ["Chloe", "Davies"],
]

const RU_GOODS = [
  "оборудования",
  "металлопроката",
  "офисной мебели",
  "кабеля",
  "труб ПНД",
  "керамогранита",
  "ноутбуков",
  "бумаги А4",
  "светильников",
  "стеллажей",
]
const RU_CITY = ["Казань", "Самару", "Новосибирск", "Екатеринбург", "Тверь", "Пермь", "Уфу", "Воронеж"]
const RU_ROOM = ["офиса", "склада", "кухни", "квартиры", "кровли", "фасада", "торгового зала"]
const RU_SYSTEM = ["вентиляции", "кондиционеров", "видеонаблюдения", "отопления", "сигнализации", "водоснабжения"]
const EN_GOODS = ["steel pipes", "office chairs", "laptops", "LED panels", "pallet racks", "copper cable"]
const EN_CITY = ["Berlin", "Valencia", "Leeds", "Lyon", "Porto", "Milan"]
const EN_SERVICE = [
  "Website redesign",
  "CRM integration",
  "Annual support contract",
  "Office fit-out",
  "Security audit",
  "Cloud migration",
  "Mobile app MVP",
]

const DEAL_STAGES = ["NEW", "PREPARATION", "WON", "LOSE", "APOLOGY"]
const LEAD_STAGES = ["NEW", "IN_PROCESS", "CONVERTED", "JUNK"]

/** Records the queries are written against. Each has words that appear nowhere in the background. */
export const NEEDLE_COMPANIES: Company[] = [
  { key: "c-gidro", title: "ООО «АкваБарьер»", short: "АкваБарьер" },
  { key: "c-brew", title: "Hopfen Brauhaus GmbH", short: "Hopfen Brauhaus" },
]
export const NEEDLE_CONTACTS: Contact[] = [
  { key: "p-belous", name: "Ольга", lastName: "Белоусова", email: "o.belousova@example.test", company: "c-gidro" },
  { key: "p-jensen", name: "Henrik", lastName: "Jensen", email: "h.jensen@example.test", company: "c-brew" },
]
const N = (key: string, title: string, more: Partial<Item> = {}): Item => ({
  key,
  kind: "deal",
  title,
  stage: "NEW",
  amount: 10_000,
  currency: "RUB",
  contacts: [],
  ...more,
})
export const NEEDLES: Item[] = [
  N("n-cement", "Поставка цемента М500 в Подольск", { amount: 487_500, stage: "PREPARATION" }),
  N("n-gidro", "Гидроизоляция подвала на Таганке", { company: "c-gidro", contacts: ["p-belous"], amount: 1_250_000 }),
  N("n-gidro2", "Гидроизоляция фундамента, второй этап", { company: "c-gidro", contacts: ["p-belous"], stage: "WON" }),
  N("n-sound", "Звукоизоляция переговорной — 3 этаж", { amount: 96_000 }),
  N("n-boiler", "Котельная для ангара в Химках", { amount: 2_300_000, stage: "PREPARATION" }),
  N("n-transf", "Замена трансформаторной подстанции КТП-630", { amount: 3_100_000 }),
  N("n-stairs", "Лестница из лиственницы на дачу", { amount: 180_000, stage: "LOSE" }),
  N("n-schet", "Счёт 4471 за монтаж окон ПВХ", { amount: 74_000, stage: "WON" }),
  N("n-brew", "Brewery equipment for Hopfen — пивоварня 500 л", {
    company: "c-brew",
    contacts: ["p-jensen"],
    amount: 64_000,
    currency: "EUR",
    stage: "PREPARATION",
  }),
  N("n-solar", "Photovoltaic carport installation, Valencia port", { amount: 210_000, currency: "EUR" }),
  N("n-kombucha", "Kombucha bottling line upgrade", { amount: 38_500, currency: "USD", stage: "WON" }),
  N("n-windows", "Windows replacement at the Leeds depot", { amount: 22_000, currency: "GBP" }),
  N("n-redesign", "Редизайн website для Hopfen Brauhaus", {
    company: "c-brew",
    contacts: ["p-jensen"],
    amount: 15_000,
    currency: "EUR",
  }),
  N("n-repair", "Forklift repair, warehouse 7", { amount: 4_200, currency: "EUR", stage: "LOSE" }),
  N("n-partner", "Партнёрская программа «Дилер-2027»", { categoryId: 1, stage: "C1:NEW", amount: 0 }),
  N("n-yo", "Ёмкость из нержавейки для молокозавода", { amount: 540_000 }),
  {
    key: "n-lead-person",
    kind: "lead",
    title: "Заявка с сайта",
    stage: "IN_PROCESS",
    amount: 0,
    currency: "RUB",
    contacts: [],
    person: { name: "Тимофей", lastName: "Гордеев" },
    companyTitle: "ООО «Севертех-Монтаж»",
  },
  {
    key: "n-lead-quote",
    kind: "lead",
    title: "Запрос КП на сэндвич-панели",
    stage: "NEW",
    amount: 0,
    currency: "RUB",
    contacts: [],
  },
]

export const build = (seed = 2026) => {
  const r = rng(seed)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(r() * list.length)] as T
  const companies: Company[] = [...NEEDLE_COMPANIES]
  const seen = new Set(companies.map((one) => one.short))
  while (companies.length < 150) {
    const en = r() < 0.35
    const short = en
      ? pick(EN_ROOTS) + (r() < 0.5 ? "" : ` ${pick(["Group", "Labs", "Systems"])}`)
      : pick(RU_ROOTS) + pick(RU_SUFFIX)
    if (seen.has(short)) continue
    seen.add(short)
    const title = en ? short + pick(EN_FORM) : `${pick(RU_FORM)} «${short}»`
    companies.push({ key: `c${companies.length}`, title, short })
  }
  const contacts: Contact[] = [...NEEDLE_CONTACTS]
  while (contacts.length < 600) {
    const en = r() < 0.3
    const [name, lastName] = en ? pick(EN_FIRST) : pick(RU_FIRST)
    const n = contacts.length
    contacts.push({
      key: `p${n}`,
      name: name as string,
      lastName: lastName as string,
      email: `contact${n}@example.test`,
      company: (companies[2 + (n % 148)] as Company).key,
    })
  }
  const background = (n: number, kind: "deal" | "lead"): Item => {
    const en = r() < 0.35
    const company = companies[2 + Math.floor(r() * 148)] as Company
    let title: string
    if (kind === "lead")
      title = en
        ? pick(["Lead from website form", `Request for quote: ${pick(EN_GOODS)}`, "Inbound call"])
        : pick(["Заявка с сайта", "Входящий звонок", `Запрос КП на поставку ${pick(RU_GOODS)}`, "Заявка из Telegram"])
    else
      title = en
        ? pick([`Supply of ${pick(EN_GOODS)} to ${pick(EN_CITY)}`, pick(EN_SERVICE)])
        : pick([
            `Поставка ${pick(RU_GOODS)} в ${pick(RU_CITY)}`,
            `Ремонт ${pick(RU_ROOM)}`,
            `Монтаж ${pick(RU_SYSTEM)}`,
            `Обслуживание ${pick(RU_SYSTEM)}`,
            `Договор на поставку ${pick(RU_GOODS)}`,
          ])
    if (r() < 0.4) title += ` — ${company.short}`
    const people = contacts.filter((one) => one.company === company.key)
    const contact = people.length ? pick(people) : undefined
    return {
      key: `${kind}${n}`,
      kind,
      title,
      stage: pick(kind === "deal" ? DEAL_STAGES : LEAD_STAGES),
      amount: Math.round(r() * 2_000) * 500,
      currency: en ? pick(["EUR", "USD"]) : "RUB",
      company: company.key,
      contacts: contact ? [contact.key] : [],
      ...(kind === "lead" && r() < 0.5
        ? { person: { name: contact?.name ?? "Гость", lastName: contact?.lastName ?? "" } }
        : {}),
    }
  }
  const items: Item[] = [...NEEDLES]
  for (let n = 0; n < 1300; n++) items.push(background(n, "deal"))
  for (let n = 0; n < 700; n++) items.push(background(n, "lead"))
  // Ties rank the latest changed first, and each put moves the clock: shuffle so the needles are not simply newest.
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[items[i], items[j]] = [items[j] as Item, items[i] as Item]
  }
  return { companies, contacts, items }
}
