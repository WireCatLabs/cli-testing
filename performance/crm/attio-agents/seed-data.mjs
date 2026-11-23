// An invented sales account: a small agency selling AI automation to Russian, Spanish and other European clients.
// Every person, company and phone number is made up. Every company, person, deal and note title ends in MARKER, so
// the seed's own records can be told apart from anything else in the workspace and deleted from the status CSV.
// The story records carry the facts the questions ask about; a seeded generator adds the rest of a small team's CRM
// (about 150 companies, 400 people and 120 deals). Dates are fixed around 2026-11-23, the day the test was written,
// so the key does not move with the calendar.

export const MARKER = "(WC seed)"
export const TODAY = "2026-11-23"

const company = (key, name, about) => ({ key, name, about })
const person = (key, first, last, companyKey, title, phone) => ({ key, first, last, company: companyKey, title, phone })
const deal = (key, name, companyKey, people, stage, amount, close, lost) => ({
  key,
  name,
  company: companyKey,
  people,
  stage,
  amount,
  close,
  ...(lost ? { lost } : {}),
})

const storyCompanies = [
  company("northwind-iberia", "Northwind Logistics Iberia", "Logistics, Valencia (Spain). Warehouses and last-mile."),
  company("northwinds-retail", "Northwinds Retail Group", "Retail chain, Riga (Latvia). 120 stores in the Baltics."),
  company("transcargo", "ТрансКарго", "Грузоперевозки, Екатеринбург. Парк 400 машин."),
  company("medline", "МедЛайн Клиники", "Сеть клиник, Самара. 9 филиалов."),
  company("vega-pharm", "Вега Фарм", "Аптечная сеть, Москва. 140 аптек."),
  company("sol-y-mar", "Sol y Mar Hoteles", "Hotel chain, Alicante (Spain). 6 hotels on the coast."),
  company("kedrovy-dom", "Кедровый Дом", "Мебельная фабрика, Новосибирск."),
  company("zerno-yug", "Зерно-Юг", "Агрохолдинг, Ставрополь."),
  company("brightlane", "Brightlane School", "Private school, Porto (Portugal)."),
  company("finpoint", "ФинПоинт Банк", "Банк, Москва."),
  company("solaria", "Solaria Energía", "Solar panels installer, Madrid (Spain)."),
  company("khlebnitsa", "Хлебница", "Сеть пекарен, Казань. 60 точек."),
  company("datacraft", "DataCraft Ltd", "Software, London (UK)."),
  company("costa-blanca", "Costa Blanca Advisors", "Hospitality consulting and reseller, Valencia (Spain)."),
]

const storyPeople = [
  person("ruiz", "Álvaro", "Ruiz", "northwind-iberia", "COO", "+34 611 204 310"),
  person("gil", "Marta", "Gil", "northwind-iberia", "Procurement Lead", "+34 622 815 447"),
  person("berzins", "Jānis", "Bērziņš", "northwinds-retail", "CEO", "+371 2913 4402"),
  person("kalnina", "Ilze", "Kalniņa", "northwinds-retail", "CFO", "+371 2655 0198"),
  person("ershov", "Сергей", "Ершов", "transcargo", "Коммерческий директор", "+7 912 604-21-77"),
  person("pak", "Олег", "Пак", "transcargo", "Руководитель IT", "+7 912 330-48-15"),
  person("ershin", "Сергей", "Ершин", "medline", "Главный врач", "+7 927 145-60-32"),
  person("demina", "Ольга", "Демина", "medline", "Операционный директор", "+7 927 801-12-90"),
  person("kotova", "Марина", "Котова", "vega-pharm", "Директор по цифровизации", "+7 916 552-07-41"),
  person("lunin", "Игорь", "Лунин", "vega-pharm", "Финансовый директор", "+7 916 230-88-14"),
  person("vidal", "Carmen", "Vidal", "sol-y-mar", "Directora de operaciones", "+34 655 302 118"),
  person("orlov-es", "Dmitry", "Orlov", "sol-y-mar", "Revenue Manager", "+34 655 917 260"),
  person("orlov-ru", "Дмитрий", "Орлов", "kedrovy-dom", "Начальник отдела продаж", "+7 913 744-50-19"),
  person("orlova", "Анна", "Орлова", "kedrovy-dom", "Маркетолог", "+7 913 744-50-23"),
  person("savin", "Пётр", "Савин", "zerno-yug", "Агроном, руководитель цифровизации", "+7 928 316-70-04"),
  person("kuzina", "Вера", "Кузина", "zerno-yug", "Главный бухгалтер", "+7 928 610-25-63"),
  person("moura", "Inês", "Moura", "brightlane", "Head of Learning", "+351 912 408 733"),
  person("teixeira", "Rui", "Teixeira", "brightlane", "Managing Director", "+351 913 561 209"),
  person("lebed", "Андрей", "Лебедь", "finpoint", "Вице-президент по рискам", "+7 903 418-27-60"),
  person("volkova", "Наталья", "Волкова", "finpoint", "Руководитель отдела продаж", "+7 903 772-40-05"),
  person("molina", "Javier", "Molina", "solaria", "Director comercial", "+34 600 318 442"),
  person("serra", "Pablo", "Serra", "solaria", "CFO", "+34 600 705 916"),
  person("galiev", "Тимур", "Галиев", "khlebnitsa", "Директор по маркетингу", "+7 917 263-14-88"),
  person("sadykova", "Алсу", "Садыкова", "khlebnitsa", "Руководитель колл-центра", "+7 917 908-35-71"),
  person("grant", "Oliver", "Grant", "datacraft", "VP Engineering", "+44 7700 900318"),
  person("shah", "Priya", "Shah", "datacraft", "Procurement Manager", "+44 7700 900542"),
  person("malkov", "Sergei", "Malkov", "costa-blanca", "Founder", "+34 611 730 284"),
]

const storyDeals = [
  deal(
    "nw-voice",
    "Northwind Iberia — voice picking",
    "northwind-iberia",
    ["ruiz", "gil"],
    "In Progress",
    46000,
    "2026-12-18",
  ),
  deal(
    "nws-audit",
    "Northwinds — shelf photo audit",
    "northwinds-retail",
    ["berzins", "kalnina"],
    "Lead",
    18000,
    "2027-02-15",
  ),
  deal(
    "tc-dispatch",
    "ТрансКарго — диспетчерский бот",
    "transcargo",
    ["ershov", "pak"],
    "In Progress",
    27500,
    "2026-11-27",
  ),
  deal("tc-ocr", "ТрансКарго — распознавание путевых листов", "transcargo", ["pak"], "Won 🎉", 8400, "2026-09-30"),
  deal(
    "ml-booking",
    "МедЛайн — бот записи к врачу",
    "medline",
    ["ershin", "demina"],
    "In Progress",
    21000,
    "2026-12-10",
  ),
  deal(
    "ml-transcribe",
    "МедЛайн — расшифровка приёмов",
    "medline",
    ["ershin"],
    "Lost",
    33000,
    "2026-10-14",
    "Юристы против: данные пациентов нельзя отдавать в облако",
  ),
  deal("vega-rx", "Вега Фарм — проверка рецептов", "vega-pharm", ["kotova", "lunin"], "Lead", 52000, "2027-03-01"),
  deal(
    "sym-booking",
    "Sol y Mar — chatbot de reservas",
    "sol-y-mar",
    ["vidal", "orlov-es"],
    "Won 🎉",
    15800,
    "2026-10-21",
  ),
  deal("sym-upsell", "Sol y Mar — upsell engine", "sol-y-mar", ["orlov-es"], "Lead", 12000, "2027-01-30"),
  deal(
    "kd-catalog",
    "Кедровый Дом — описания каталога",
    "kedrovy-dom",
    ["orlov-ru", "orlova"],
    "In Progress",
    7900,
    "2026-12-20",
  ),
  deal("kd-crm", "Кедровый Дом — CRM-бот для дилеров", "kedrovy-dom", ["orlov-ru"], "Won 🎉", 11600, "2026-09-12"),
  deal("zy-fields", "Зерно-Юг — мониторинг посевов", "zerno-yug", ["savin"], "In Progress", 36000, "2026-12-14"),
  deal(
    "zy-1c",
    "Зерно-Юг — первичка в 1С",
    "zerno-yug",
    ["kuzina"],
    "Lost",
    4800,
    "2026-07-08",
    "Проект заморожен после смены собственника",
  ),
  deal(
    "bl-tutor",
    "Brightlane — AI tutor pilot",
    "brightlane",
    ["moura", "teixeira"],
    "In Progress",
    19500,
    "2026-12-04",
  ),
  deal("fp-kyc", "ФинПоинт — KYC-проверка документов", "finpoint", ["lebed"], "In Progress", 64000, "2027-01-20"),
  deal("fp-support", "ФинПоинт — бот поддержки клиентов", "finpoint", ["volkova"], "Lead", 23000, "2027-02-27"),
  deal("sol-leads", "Solaria — lead scoring", "solaria", ["molina", "serra"], "Won 🎉", 26000, "2026-11-09"),
  deal("sol-support", "Solaria — soporte nivel 1", "solaria", ["molina"], "Lead", 15500, "2027-01-15"),
  deal(
    "kh-callcenter",
    "Хлебница — колл-центр на ИИ",
    "khlebnitsa",
    ["sadykova", "galiev"],
    "Lost",
    37000,
    "2026-11-04",
    "Слишком дорого: просили скидку 30%, дали 10%",
  ),
  deal(
    "dc-eval",
    "DataCraft — LLM evaluation harness",
    "datacraft",
    ["grant", "shah"],
    "In Progress",
    33000,
    "2026-12-22",
  ),
  deal("dc-copilot", "DataCraft — CS copilot", "datacraft", ["grant"], "Won 🎉", 14200, "2026-11-17"),
  deal(
    "dc-partner",
    "DataCraft — referral partnership",
    "datacraft",
    ["grant"],
    "Lost",
    0,
    "2026-11-02",
    "Decided to work without partners",
  ),
  deal(
    "cba-reseller",
    "Costa Blanca Advisors — reseller agreement",
    "costa-blanca",
    ["malkov"],
    "In Progress",
    12000,
    "2026-12-31",
  ),
]

// `at` is the note's own date (Attio's created_at, backdated). The title is the one line Attio shows in a list.
export const storyNotes = [
  {
    key: "n-nw-voice",
    deal: "nw-voice",
    at: "2026-11-18T14:30:00Z",
    title: "Call with Marta Gil: discount",
    body: "Marta wants 10% off. We offered 5% for a 24-month term. Their legal team asks for EU hosting (Frankfurt) and a DPA. Álvaro wants it live before the March peak.",
  },
  {
    key: "n-nws-audit",
    deal: "nws-audit",
    at: "2026-11-05T11:00:00Z",
    title: "Intro with Jānis",
    body: "Not related to Northwind Logistics Iberia, only the name is close. 120 stores, they want shelf photos checked against the planogram. Budget only in Q1 2027.",
  },
  {
    key: "n-tc-dispatch",
    deal: "tc-dispatch",
    at: "2026-11-19T08:00:00Z",
    title: "Ершов: перенос старта",
    body: "Сергей Ершов просит сдвинуть старт на февраль, ждут новый бюджет. Цена устраивает. Держит служба безопасности: хотят всё на своих серверах, без облака. Созвон по договору 25 ноября в 11:00 по Москве.",
  },
  {
    key: "n-tc-ocr",
    deal: "tc-ocr",
    at: "2026-10-01T09:00:00Z",
    title: "Акт подписан",
    body: "Акт подписан, оплата 30.09. Проект вела Марина Котова, она в октябре уходит из ТрансКарго в Вега Фарм.",
  },
  {
    key: "n-ml-booking",
    deal: "ml-booking",
    at: "2026-11-20T13:00:00Z",
    title: "Демина: неявки",
    body: "Ольга Демина прислала выгрузку: 22% пациентов не приходят на приём. Хотят напоминания в Telegram и MAX, запись через бота, интеграция с МИС «Инфоклиника». Главврач Ершин согласует медицинские тексты.",
  },
  {
    key: "n-ml-transcribe",
    deal: "ml-transcribe",
    at: "2026-10-15T12:00:00Z",
    title: "Отказ по расшифровке",
    body: "Ершин: юристы сети против, записи приёмов нельзя отдавать во внешнее облако. Вернуться, если сделаем вариант на их сервере.",
  },
  {
    key: "n-vega-rx",
    deal: "vega-rx",
    at: "2026-11-10T10:00:00Z",
    title: "Котова на новом месте",
    body: "Марина Котова теперь в Вега Фарм (перешла из ТрансКарго в октябре) и сама привела нас. Хотят пилот на 3 аптеках: сверка рецептов с остатками. Бюджет на первый квартал, решает Лунин.",
  },
  {
    key: "n-sym-booking",
    deal: "sym-booking",
    at: "2026-10-22T10:00:00Z",
    title: "Contrato firmado",
    body: "Contrato firmado para 3 hoteles. Carmen quiere ampliar a los 6 hoteles si la conversión de reservas sube un 15%.",
  },
  {
    key: "n-sym-kpi",
    deal: "sym-booking",
    at: "2026-11-20T09:00:00Z",
    title: "Conversión, primer mes",
    body: "Dmitry Orlov mandó los datos del primer mes: la conversión subió un 9%. Todavía no llega al 15% que pidió Carmen.",
  },
  {
    key: "n-kd-catalog",
    deal: "kd-catalog",
    at: "2026-11-13T07:00:00Z",
    title: "Дима прислал каталог",
    body: "Дима Орлов прислал 900 позиций каталога в Excel. Тон просит тёплый, без канцелярита и без англицизмов. Тексты проверяет Анна Орлова.",
  },
  {
    key: "n-zy-fields",
    deal: "zy-fields",
    at: "2026-11-15T06:00:00Z",
    title: "Савин: снимки и прогноз",
    body: "Пётр Савин хочет спутниковые снимки раз в неделю и прогноз урожая по подсолнечнику и пшенице. 9 500 гектаров. Решение до 14 декабря, иначе бюджет уйдёт на технику. Цена за гектар ему кажется высокой.",
  },
  {
    key: "n-bl-tutor",
    deal: "bl-tutor",
    at: "2026-11-17T15:00:00Z",
    title: "Pilot scope",
    body: "Inês needs the pilot in Portuguese and English. The board meets on 4 December and Rui Teixeira signs. They asked for a reference from another school.",
  },
  {
    key: "n-fp-kyc",
    deal: "fp-kyc",
    at: "2026-11-16T12:00:00Z",
    title: "Требования к KYC",
    body: "Лебедь: проверка паспортов и выписок ЕГРЮЛ, всё внутри их контура, без облака. Служба ИБ пришлёт опросник.",
  },
  {
    key: "n-fp-support",
    deal: "fp-support",
    at: "2026-11-21T09:30:00Z",
    title: "Откуда Волкова",
    body: "Наталья Волкова пришла сама, по рекомендации Сергея Ершова из ТрансКарго. Нужен бот поддержки для мобильного банка, 40 тысяч обращений в месяц.",
  },
  {
    key: "n-sol-leads",
    deal: "sol-leads",
    at: "2026-11-10T10:00:00Z",
    title: "Firmado",
    body: "Firmado. Javier quiere un caso de éxito para su web en enero. Pablo Serra pidió la factura con IVA a nombre de Solaria Energía SL.",
  },
  {
    key: "n-kh-callcenter",
    deal: "kh-callcenter",
    at: "2026-11-05T09:00:00Z",
    title: "Отказ",
    body: "Отказ. Галиев хотел скидку 30%, мы дали 10%. Алсу Садыкова лично за проект, предлагает вернуться в марте с пилотом на одной точке.",
  },
  {
    key: "n-dc-eval",
    deal: "dc-eval",
    at: "2026-11-19T17:00:00Z",
    title: "Procurement",
    body: "Oliver asked for our SOC 2 report and a fixed price. Priya Shah runs procurement, payment terms net 60.",
  },
  {
    key: "n-cba-reseller",
    deal: "cba-reseller",
    at: "2026-11-14T16:00:00Z",
    title: "Terms Sergei asked for",
    body: "Sergei wants 15% commission on every client he brings, paid monthly. He has two hotel chains in mind, Sol y Mar among them. He suggests starting with one pilot client.",
  },
]

// `due` is the task's deadline in UTC; `done` marks a completed task.
export const tasks = [
  {
    key: "t-nw-addendum",
    deal: "nw-voice",
    due: "2026-11-19T15:00:00Z",
    text: "Send the EU hosting addendum to Marta Gil",
  },
  {
    key: "t-tc-security",
    deal: "tc-dispatch",
    due: "2026-11-20T07:00:00Z",
    text: "Ответить СБ ТрансКарго по установке на их сервер",
  },
  {
    key: "t-kd-samples",
    deal: "kd-catalog",
    due: "2026-11-16T06:00:00Z",
    text: "Сделать 20 пробных описаний для Кедрового Дома",
  },
  {
    key: "t-cba-contract",
    deal: "cba-reseller",
    due: "2026-11-12T10:00:00Z",
    text: "Draft the reseller agreement for Sergei",
  },
  {
    key: "t-ml-demo",
    deal: "ml-booking",
    due: "2026-11-25T11:00:00Z",
    text: "Показать Деминой демо напоминаний в Telegram",
  },
  {
    key: "t-bl-reference",
    deal: "bl-tutor",
    due: "2026-11-27T10:00:00Z",
    text: "Find a school reference for Brightlane",
  },
  { key: "t-fp-questionnaire", deal: "fp-kyc", due: "2026-12-02T09:00:00Z", text: "Заполнить опросник ИБ ФинПоинта" },
  { key: "t-zy-call", deal: "zy-fields", due: "2026-11-24T06:00:00Z", text: "Созвон с Савиным по цене за гектар" },
  { key: "t-dc-soc2", deal: "dc-eval", due: "2026-11-19T12:00:00Z", text: "Send SOC 2 report to Oliver", done: true },
  { key: "t-sol-case", deal: "sol-leads", due: "2026-12-15T10:00:00Z", text: "Preparar caso de éxito con Javier" },
  {
    key: "t-kh-march",
    deal: "kh-callcenter",
    due: "2027-03-02T07:00:00Z",
    text: "Вернуться к Садыковой с пилотом на одной точке",
  },
  {
    key: "t-fp-deck",
    deal: "fp-support",
    due: "2026-11-22T09:00:00Z",
    text: "Отправить Волковой презентацию бота",
    done: true,
  },
]

// The generator. A fixed seed, so every run makes the same records. Its word lists hold no Sergey, no Dmitry, no
// Northwind and none of the story's surnames: a near-duplicate the key does not know about would spoil a question.
const rng = (() => {
  let a = 20261123
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
})()
const pick = (list) => list[Math.floor(rng() * list.length)]
const between = (low, high) => low + Math.floor(rng() * (high - low + 1))

const ruRoots = [
  "Альтаир",
  "Березка",
  "Вектор",
  "Гранит",
  "Дельта",
  "Енисей",
  "Заря",
  "Импульс",
  "Каскад",
  "Ладога",
  "Меридиан",
  "Нева",
  "Омега",
  "Прогресс",
  "Радуга",
  "Сатурн",
  "Тайга",
  "Урал",
  "Факел",
  "Эталон",
]
const ruKinds = ["Логистик", "Строй", "Трейд", "Агро", "Мед", "Фуд", "Тех", "Принт", "Авто", "Энерго"]
const ruCities = ["Москва", "Санкт-Петербург", "Казань", "Нижний Новгород", "Пермь", "Воронеж", "Тюмень", "Краснодар"]
const ruFields = ["Оптовая торговля", "Строительство", "Производство", "Ритейл", "Медицина", "Логистика", "Общепит"]
const enRoots = [
  "Blue",
  "Silver",
  "Oak",
  "River",
  "Summit",
  "Harbor",
  "Maple",
  "Granite",
  "Crescent",
  "Falcon",
  "Willow",
  "Copper",
]
const enKinds = ["Analytics", "Foods", "Systems", "Health", "Labs", "Freight", "Media", "Energy", "Retail", "Finance"]
const enCities = ["London", "Dublin", "Amsterdam", "Berlin", "Lisbon", "Warsaw", "Tallinn", "Prague"]
const esRoots = [
  "Alba",
  "Brisa",
  "Cielo",
  "Duna",
  "Estrella",
  "Faro",
  "Girasol",
  "Horizonte",
  "Luna",
  "Mirador",
  "Olivo",
  "Puerto",
]
const esKinds = [
  "Distribución",
  "Consultores",
  "Hoteles",
  "Clínicas",
  "Construcciones",
  "Alimentación",
  "Software",
  "Transportes",
]
const esCities = ["Madrid", "Barcelona", "Sevilla", "Málaga", "Bilbao", "Zaragoza", "Murcia", "Palma"]

const ruMale = [
  "Алексей",
  "Андрей",
  "Антон",
  "Артём",
  "Борис",
  "Вадим",
  "Виктор",
  "Глеб",
  "Денис",
  "Евгений",
  "Иван",
  "Кирилл",
  "Максим",
  "Никита",
  "Роман",
  "Станислав",
  "Фёдор",
  "Юрий",
]
const ruFemale = [
  "Алина",
  "Валерия",
  "Галина",
  "Дарья",
  "Елена",
  "Жанна",
  "Ирина",
  "Ксения",
  "Людмила",
  "Надежда",
  "Полина",
  "Светлана",
  "Татьяна",
  "Юлия",
]
const ruLast = [
  "Абрамов",
  "Белоусов",
  "Гусев",
  "Данилов",
  "Жуков",
  "Зуев",
  "Ильин",
  "Комаров",
  "Медведев",
  "Носов",
  "Осипов",
  "Панов",
  "Рябов",
  "Субботин",
  "Титов",
  "Уткин",
  "Фомин",
  "Шубин",
  "Яковлев",
  "Тарасов",
]
const enFirst = [
  "Emma",
  "James",
  "Sophie",
  "Liam",
  "Hannah",
  "Noah",
  "Chloe",
  "Ethan",
  "Grace",
  "Lucas",
  "Mia",
  "Henry",
]
const enLast = [
  "Walker",
  "Bennett",
  "Hughes",
  "Carter",
  "Murphy",
  "Foster",
  "Reid",
  "Turner",
  "Price",
  "Ward",
  "Lewis",
  "Clarke",
]
const esFirst = [
  "Lucía",
  "Mateo",
  "Sofía",
  "Hugo",
  "Paula",
  "Daniel",
  "Elena",
  "Adrián",
  "Sara",
  "Iván",
  "Nerea",
  "Raúl",
]
const esLast = [
  "Navarro",
  "Romero",
  "Torres",
  "Domínguez",
  "Vázquez",
  "Ramos",
  "Blanco",
  "Castro",
  "Ortega",
  "Delgado",
  "Morales",
  "Prieto",
]
const ruTitles = [
  "Генеральный директор",
  "Коммерческий директор",
  "Руководитель IT",
  "Менеджер по закупкам",
  "Финансовый директор",
  "Директор по маркетингу",
]
const enTitles = ["CEO", "Head of Operations", "IT Manager", "Procurement Manager", "CFO", "Marketing Lead"]
const esTitles = [
  "Director general",
  "Director comercial",
  "Responsable de IT",
  "Compras",
  "Director financiero",
  "Marketing",
]

const products = {
  ru: [
    "чат-бот для клиентов",
    "распознавание документов",
    "прогноз спроса",
    "голосовой ассистент",
    "анализ звонков",
    "бот для склада",
    "ИИ-поиск по базе знаний",
  ],
  en: [
    "support chatbot",
    "document OCR",
    "demand forecast",
    "voice agent",
    "call analytics",
    "knowledge base search",
    "lead routing",
  ],
  es: [
    "chatbot de atención",
    "OCR de facturas",
    "previsión de demanda",
    "asistente de voz",
    "análisis de llamadas",
    "buscador interno",
  ],
}
const lostReasons = {
  ru: ["Выбрали конкурента", "Нет бюджета в этом году", "Пропал контакт, не отвечают", "Сделали своими силами"],
  en: ["Chose a competitor", "No budget this year", "Went silent", "Built it in-house"],
  es: ["Eligieron a la competencia", "Sin presupuesto este año", "Dejaron de responder", "Lo hicieron internamente"],
}
const fillerNoteText = {
  ru: [
    "Созвон: обсудили сроки пилота, ждём ответа.",
    "Отправили КП, клиент сравнивает с двумя подрядчиками.",
    "Попросили кейсы из их отрасли.",
  ],
  en: [
    "Call: discussed pilot timing, waiting for their answer.",
    "Sent the proposal, they compare two vendors.",
    "Asked for case studies from their industry.",
  ],
  es: [
    "Llamada: hablamos de plazos del piloto, esperamos respuesta.",
    "Enviada la propuesta, comparan con dos proveedores.",
    "Pidieron casos de su sector.",
  ],
}

const lang = (i) => (i % 5 < 3 ? "ru" : i % 5 === 3 ? "en" : "es")
const phoneOf = (l) =>
  l === "ru"
    ? `+7 9${between(10, 39)} ${between(100, 999)}-${between(10, 99)}-${between(10, 99)}`
    : l === "en"
      ? `+44 7700 9${between(10000, 99999)}`
      : `+34 6${between(10, 99)} ${between(100, 999)} ${between(100, 999)}`

const fillerCompanies = []
const usedNames = new Set(storyCompanies.map((c) => c.name))
for (let i = 0; fillerCompanies.length < 136; i++) {
  const l = lang(i)
  const name =
    l === "ru"
      ? `${pick(ruRoots)}-${pick(ruKinds)}`
      : l === "en"
        ? `${pick(enRoots)} ${pick(enKinds)}`
        : `${pick(esKinds)} ${pick(esRoots)}`
  if (usedNames.has(name)) continue
  usedNames.add(name)
  const about =
    l === "ru"
      ? `${pick(ruFields)}, ${pick(ruCities)}.`
      : l === "en"
        ? `${pick(enKinds)}, ${pick(enCities)}.`
        : `${pick(esKinds)}, ${pick(esCities)}.`
  fillerCompanies.push({ key: `f-co-${fillerCompanies.length + 1}`, name, about, lang: l })
}

const fillerPeople = []
const usedPeople = new Set(storyPeople.map((p) => `${p.first} ${p.last}`))
for (const co of fillerCompanies) {
  const count = between(2, 3)
  for (let n = 0; n < count && fillerPeople.length < 373; n++) {
    let first
    let last
    let title
    do {
      if (co.lang === "ru") {
        const female = rng() < 0.45
        first = pick(female ? ruFemale : ruMale)
        const base = pick(ruLast)
        last = female ? `${base}а` : base
        title = pick(ruTitles)
      } else if (co.lang === "en") {
        first = pick(enFirst)
        last = pick(enLast)
        title = pick(enTitles)
      } else {
        first = pick(esFirst)
        last = pick(esLast)
        title = pick(esTitles)
      }
    } while (usedPeople.has(`${first} ${last}`))
    usedPeople.add(`${first} ${last}`)
    fillerPeople.push(person(`f-p-${fillerPeople.length + 1}`, first, last, co.key, title, phoneOf(co.lang)))
  }
}

const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
const fillerDeals = []
const fillerNotes = []
const stagePlan = [
  ...Array(36).fill("Lead"),
  ...Array(32).fill("In Progress"),
  ...Array(15).fill("Won 🎉"),
  ...Array(14).fill("Lost"),
]
stagePlan.forEach((stage, i) => {
  const co = fillerCompanies[(i * 7) % fillerCompanies.length]
  const l = co.lang
  const staff = fillerPeople.filter((p) => p.company === co.key)
  const open = stage === "Lead" || stage === "In Progress"
  // Open deals close from December on and stay under the story's largest open deal, so "this month" and "the
  // biggest open deal" have one answer each, written in the key.
  const closeDate = open
    ? rng() < 0.5
      ? iso(2026, 12, between(5, 30))
      : iso(2027, between(1, 6), between(1, 28))
    : iso(2026, between(5, 11), between(1, 28))
  // A closed deal closed in the past. Shifted, not redrawn, so the generator's later draws and names stay the same.
  const closed = !open && closeDate > "2026-11-20" ? `2026-11-${Number(closeDate.slice(8)) - 10}` : closeDate
  const amount = stage === "Lost" && rng() < 0.15 ? 0 : between(30, 580) * 100
  const one = deal(
    `f-d-${i + 1}`,
    `${co.name} — ${pick(products[l])}`,
    co.key,
    staff.slice(0, between(1, Math.min(2, staff.length))).map((p) => p.key),
    stage,
    amount,
    closed,
    stage === "Lost" ? pick(lostReasons[l]) : undefined,
  )
  fillerDeals.push(one)
  if (i % 4 === 1) {
    fillerNotes.push({
      key: `f-n-${i + 1}`,
      deal: one.key,
      at: `${iso(2026, between(9, 11), between(1, 20))}T10:00:00Z`,
      title: l === "ru" ? "Заметка" : l === "en" ? "Note" : "Nota",
      body: pick(fillerNoteText[l]),
    })
  }
})

export const companies = [...storyCompanies, ...fillerCompanies]
export const people = [...storyPeople, ...fillerPeople]
export const deals = [...storyDeals, ...fillerDeals]
export const notes = [...storyNotes, ...fillerNotes]
