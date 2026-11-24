// Round 2's planted records: the needles key-large.md names and the near misses around them. Keys start with "x-".
import { LOCALES, pick, slug } from "./large-pools.mjs"

// --- planted records ------------------------------------------------------------------------------------------
// Each needle company, contact, deal and activity has a fixed key starting with "x-"; the key file names them.

export const X = { companies: [], contacts: [], deals: [], notes: [], tasks: [], calls: [], meetings: [] }
const xCompany = (key, name, city, industry, phone) =>
  X.companies.push({ key, name, city, industry, phone, locale: "x" })
const xContact = (key, first, last, company, city, title, phone) =>
  X.contacts.push({ key, first, last, company, city, title, phone })
const xDeal = (key, name, company, contacts, stage, amount, close, lost) =>
  X.deals.push({ key, name, company, contacts, stage, amount, close, ...(lost ? { lost } : {}) })
const xNote = (key, deal, company, contacts, at, body) => X.notes.push({ key, deal, company, contacts, at, body })
const xTask = (key, deal, company, contacts, due, status, subject, body = "") =>
  X.tasks.push({ key, deal, company, contacts, due, status, priority: "MEDIUM", subject, body })
const xCall = (key, deal, company, contacts, at, minutes, title, body) =>
  X.calls.push({ key, deal, company, contacts, at, minutes, title, body })
const xMeeting = (key, deal, company, contacts, start, end, title, body) =>
  X.meetings.push({ key, deal, company, contacts, start, end, title, body })

// L1: Jens Hoffmann of Hamburg among Hoffmann, Hofmann and Hoffman in other cities.
xCompany("x-hafenkontor", "Hafenkontor Elbe Logistik GmbH", "Hamburg", "LOGISTICS_AND_SUPPLY_CHAIN", "+49 40 318 2200")
xCompany("x-leinetal", "Leinetal Spedition GmbH", "Hannover", "TRANSPORTATION_TRUCKING_RAILROAD", "+49 511 764 3100")
xCompany("x-weserdamm", "Weserdamm Handel GmbH", "Bremen", "RETAIL", "+49 421 552 9010")
xCompany("x-isarblick", "Isarblick Software GmbH", "München", "COMPUTER_SOFTWARE", "+49 89 412 7730")
xContact("x-hoffmann-jens", "Jens", "Hoffmann", "x-hafenkontor", "Hamburg", "Leiter Disposition", "+49 40 318 2247")
xContact("x-hofmann-jens", "Jens", "Hofmann", "x-leinetal", "Hannover", "Geschäftsführer", "+49 511 764 3119")
xContact("x-hoffman-jens", "Jens", "Hoffman", "x-weserdamm", "Bremen", "Einkaufsleiter", "+49 421 552 9044")
xContact("x-hoffmann-jan", "Jan", "Hoffmann", "x-hafenkontor", "Hamburg", "IT-Leiter", "+49 40 318 2290")
xContact("x-hoffmann-jonas", "Jonas", "Hoffmann", "x-isarblick", "München", "CTO", "+49 89 412 7741")
xContact("x-hofmann-jana", "Jana", "Hofmann", "x-hafenkontor", "Hamburg", "Projektleiterin", "+49 40 318 2263")
xContact("x-gofman", "Евгений", "Гофман", "x-ru-gofman", "Санкт-Петербург", "Директор по ИТ", "+7 812 455-20-31")
xCompany("x-ru-gofman", "Невский Софт", "Санкт-Петербург", "COMPUTER_SOFTWARE", "+7 812 455-20-00")
for (const [first, last, city, phone] of [
  ["Klaus", "Hoffmann", "Köln", "+49 221 640 1182"],
  ["Sabine", "Hofmann", "Stuttgart", "+49 711 903 2210"],
  ["Thomas", "Hoffmann", "Berlin", "+49 30 774 5521"],
  ["Petra", "Hoffman", "Leipzig", "+49 341 228 9074"],
  ["Jens", "Hoffmeister", "Hamburg", "+49 40 655 1209"],
  ["Ines", "Hofmann", "Wien", "+43 1 532 7710"],
  ["Uwe", "Hoffmann", "Dresden", "+49 351 418 0931"],
]) {
  X.contacts.push({
    key: `x-${slug(first + last + city)}`,
    first,
    last,
    company: null,
    city,
    title: pick(LOCALES.de.titles),
    phone,
  })
}
xDeal(
  "x-hafenkontor-deal",
  "Hafenkontor Elbe — Disposition Assistent",
  "x-hafenkontor",
  ["x-hoffmann-jens", "x-hoffmann-jan"],
  "Solution Design",
  27500,
  "2027-01-29",
)

// L2: Schmid & Söhne Antriebstechnik, asked as "Schmidt", among Schmidt and Schmitt companies.
xCompany("x-schmid-soehne", "Schmid & Söhne Antriebstechnik GmbH", "Stuttgart", "CONSTRUCTION", "+49 711 286 4400")
xCompany("x-schmidt-antriebe", "Schmidt Antriebe GmbH", "Köln", "CONSTRUCTION", "+49 221 870 3300")
xCompany("x-schmitt-sohn", "Schmitt & Sohn Bau GmbH", "Frankfurt am Main", "CONSTRUCTION", "+49 69 244 1800")
xCompany("x-schmidt-partner", "Schmidt & Partner Steuerberatung", "München", "MANAGEMENT_CONSULTING", "+49 89 551 0200")
xCompany("x-shmidt-log", "Шмидт Логистик", "Самара", "LOGISTICS_AND_SUPPLY_CHAIN", "+7 846 370-44-10")
xContact("x-schmid-anna", "Anna", "Krüger", "x-schmid-soehne", "Stuttgart", "Head of Operations", "+49 711 286 4412")
xContact("x-schmid-ralf", "Ralf", "Schmid", "x-schmid-soehne", "Stuttgart", "Geschäftsführer", "+49 711 286 4401")
xContact("x-schmidt-ant-kai", "Kai", "Becker", "x-schmidt-antriebe", "Köln", "Einkaufsleiter", "+49 221 870 3321")
xContact("x-schmitt-tim", "Tim", "Schmitt", "x-schmitt-sohn", "Frankfurt am Main", "Geschäftsführer", "+49 69 244 1801")
xContact("x-schmidt-p-ute", "Ute", "Schmidt", "x-schmidt-partner", "München", "Partnerin", "+49 89 551 0211")
xContact("x-shmidt-oleg", "Олег", "Шмидт", "x-shmidt-log", "Самара", "Генеральный директор", "+7 846 370-44-11")
xDeal(
  "x-schmid-tickets",
  "Schmid & Söhne — Ticket-Klassifizierung",
  "x-schmid-soehne",
  ["x-schmid-anna"],
  "Proposal Sent",
  34000,
  "2026-12-18",
)
xDeal(
  "x-schmid-docs",
  "Schmid & Söhne — Lieferschein-Erkennung",
  "x-schmid-soehne",
  ["x-schmid-anna", "x-schmid-ralf"],
  "Needs Assessment",
  21500,
  "2027-02-26",
)
xDeal(
  "x-schmid-voice",
  "Schmid & Söhne — Sprachassistent Hotline",
  "x-schmid-soehne",
  ["x-schmid-ralf"],
  "Closed Lost",
  16000,
  "2026-09-30",
  "Kein Budget im laufenden Jahr",
)
xDeal(
  "x-schmidt-ant-deal",
  "Schmidt Antriebe — Kundenservice-Bot",
  "x-schmidt-antriebe",
  ["x-schmidt-ant-kai"],
  "Negotiation",
  29000,
  "2026-12-11",
)
xDeal(
  "x-schmitt-deal",
  "Schmitt & Sohn — Angebotsautomatisierung",
  "x-schmitt-sohn",
  ["x-schmitt-tim"],
  "Proposal Sent",
  18000,
  "2027-01-15",
)
xDeal(
  "x-schmidt-p-deal",
  "Schmidt & Partner — Wissensdatenbank",
  "x-schmidt-partner",
  ["x-schmidt-p-ute"],
  "Discovery Call",
  9500,
  "2027-02-10",
)
xDeal(
  "x-shmidt-deal",
  "Шмидт Логистик — бот для склада",
  "x-shmidt-log",
  ["x-shmidt-oleg"],
  "Solution Design",
  14000,
  "2027-01-20",
)

// L3: Lucía Giménez of Valencia, asked in Cyrillic as "Хименес"; Lucía Jiménez in Madrid, Lucas Giménez in Valencia.
xCompany("x-huerta", "Huerta Viva Cooperativa", "Valencia", "FARMING", "+34 963 41 22 80")
xCompany("x-jimenez-co", "Grupo Mirador Hostelería", "Madrid", "HOSPITALITY", "+34 914 22 31 00")
xCompany("x-turia", "Turia Muebles SL", "Valencia", "FURNITURE", "+34 961 30 77 10")
xContact(
  "x-gimenez-lucia",
  "Lucía",
  "Giménez",
  "x-huerta",
  "Valencia",
  "Responsable de Atención al Cliente",
  "+34 963 41 22 86",
)
xContact(
  "x-jimenez-lucia",
  "Lucía",
  "Jiménez",
  "x-jimenez-co",
  "Madrid",
  "Directora de Recursos Humanos",
  "+34 914 22 31 17",
)
xContact("x-gimenez-lucas", "Lucas", "Giménez", "x-turia", "Valencia", "Director Comercial", "+34 961 30 77 12")
xContact("x-gomez-lucia", "Lucía", "Gómez", "x-turia", "Valencia", "Jefa de Operaciones", "+34 961 30 77 19")
xContact("x-jimenez-raul", "Raúl", "Jiménez", "x-huerta", "Valencia", "Gerente", "+34 963 41 22 81")
xDeal(
  "x-huerta-bot",
  "Huerta Viva — bot de WhatsApp para pedidos",
  "x-huerta",
  ["x-gimenez-lucia", "x-jimenez-raul"],
  "Negotiation",
  8600,
  "2026-12-19",
)
xDeal(
  "x-jimenez-deal",
  "Grupo Mirador — asistente de RR. HH.",
  "x-jimenez-co",
  ["x-jimenez-lucia"],
  "Proposal Sent",
  19000,
  "2027-01-22",
)
xDeal(
  "x-turia-deal",
  "Turia Muebles — chatbot de reservas",
  "x-turia",
  ["x-gimenez-lucas", "x-gomez-lucia"],
  "Needs Assessment",
  7400,
  "2027-02-05",
)
xNote(
  "x-n-huerta-old",
  "x-huerta-bot",
  "x-huerta",
  ["x-gimenez-lucia"],
  "2026-10-08T09:30:00Z",
  "Primera llamada con Lucía Giménez. Reciben los pedidos de los socios por teléfono y por WhatsApp, los apuntan en una hoja de Excel y luego los pasan a Holded. En temporada de naranja son unos 400 pedidos a la semana. Quieren que el bot tome el pedido, confirme el día de recogida y lo deje en Holded.\nLucía no decide sola: lo lleva al consejo rector.",
)
xNote(
  "x-n-huerta-new",
  "x-huerta-bot",
  "x-huerta",
  ["x-gimenez-lucia"],
  "2026-11-17T16:10:00Z",
  "Hablé otra vez con Lucía (Huerta Viva). Quieren arrancar solo con 30 socios para probar, no con los 180 de golpe. El precio les vale si todo el primer año se queda por debajo de 9.000 €. Lo vota la asamblea de socios el 12 de diciembre; si sale que sí, empezamos en enero.\nMe pidió una hoja de una página en valenciano para repartir en la asamblea.",
)
xNote(
  "x-n-jimenez",
  "x-jimenez-deal",
  "x-jimenez-co",
  ["x-jimenez-lucia"],
  "2026-11-19T11:00:00Z",
  "Lucía Jiménez: quieren un asistente para las preguntas de la plantilla sobre nóminas y turnos, 1.200 empleados en 14 hoteles. Les preocupa la protección de datos.",
)
xNote(
  "x-n-turia",
  "x-turia-deal",
  "x-turia",
  ["x-gimenez-lucas"],
  "2026-11-20T10:00:00Z",
  "Lucas Giménez quiere un chatbot que reserve visitas a la tienda de Valencia. Está mirando presupuestos, nada urgente.",
)

// L4: clients unhappy that our delivery slipped, said four ways in four languages; client-side delays as distractors.
xCompany("x-pennine", "Pennine Fresh Retail Ltd", "Leeds", "RETAIL", "+44 113 496 0712")
xCompany("x-brisa", "Brisa Transportes SL", "Zaragoza", "TRANSPORTATION_TRUCKING_RAILROAD", "+34 976 31 40 20")
xCompany("x-lindenhof", "Lindenhof Praxisverbund GmbH", "Düsseldorf", "MEDICAL_PRACTICE", "+49 211 330 8840")
xCompany("x-kamaagro", "КамаАгроТорг", "Пермь", "FARMING", "+7 342 259-71-00")
xContact("x-pennine-ruth", "Ruth", "Hargreaves", "x-pennine", "Leeds", "Head of Digital", "+44 113 496 0733")
xContact("x-brisa-ainhoa", "Ainhoa", "Urrutia", "x-brisa", "Zaragoza", "Jefa de Operaciones", "+34 976 31 40 27")
xContact(
  "x-lindenhof-maren",
  "Maren",
  "Oltmanns",
  "x-lindenhof",
  "Düsseldorf",
  "Leiterin Kundenservice",
  "+49 211 330 8851",
)
xContact("x-kama-olga", "Ольга", "Вершинина", "x-kamaagro", "Пермь", "Коммерческий директор", "+7 342 259-71-14")
xDeal(
  "x-pennine-deal",
  "Pennine Fresh — support chatbot",
  "x-pennine",
  ["x-pennine-ruth"],
  "Closed Won",
  31000,
  "2026-07-30",
)
xDeal(
  "x-brisa-deal",
  "Brisa Transportes — lectura de albaranes",
  "x-brisa",
  ["x-brisa-ainhoa"],
  "Closed Won",
  17800,
  "2026-02-20",
)
xDeal(
  "x-lindenhof-deal",
  "Lindenhof — Terminbot für Praxen",
  "x-lindenhof",
  ["x-lindenhof-maren"],
  "Closed Won",
  24500,
  "2026-03-13",
)
xDeal(
  "x-kama-deal",
  "КамаАгроТорг — бот для приёма заказов",
  "x-kamaagro",
  ["x-kama-olga"],
  "Closed Won",
  12600,
  "2026-08-05",
)
xNote(
  "x-n-pennine",
  "x-pennine-deal",
  "x-pennine",
  ["x-pennine-ruth"],
  "2026-11-09T15:20:00Z",
  "Ruth rang, not in a good mood. They are unhappy that the rollout slipped again: we told them the bot would take over the returns queue in October and it still only answers the FAQ. Their Christmas campaign starts 1 December and she has to explain to her MD why the agents are still doing returns by hand. She wants a date she can trust and a weekly status email, every Friday.\nAlso asked whether the returns label flow can reuse their Royal Mail account. Probably yes.",
)
xNote(
  "x-n-brisa",
  "x-brisa-deal",
  "x-brisa",
  ["x-brisa-ainhoa"],
  "2026-04-08T08:45:00Z",
  "Ainhoa (Brisa) bastante molesta. La lectura de albaranes tenía que estar en producción a mediados de marzo y seguimos en pruebas; dice que ya van dos veces que les damos una fecha y no la cumplimos. Su gente sigue tecleando los albaranes de los proveedores a mano por la noche.\nPide un plan con fechas cerradas y hablar con alguien por encima del jefe de proyecto.",
)
xNote(
  "x-n-lindenhof",
  "x-lindenhof-deal",
  "x-lindenhof",
  ["x-lindenhof-maren"],
  "2026-06-11T13:00:00Z",
  "Frau Oltmanns hat sich beschwert: der Go-live des Terminbots ist zum zweiten Mal verschoben worden, die Praxen haben ihre Patienten schon über das neue Buchungsportal informiert. Sie ist enttäuscht und erwägt, die zweite Rate zurückzuhalten, bis der Bot live ist.\nSonst: Anbindung an das Praxisverwaltungssystem läuft stabil im Test.",
)
xNote(
  "x-n-kama",
  "x-kama-deal",
  "x-kamaagro",
  ["x-kama-olga"],
  "2026-11-16T07:30:00Z",
  "Ольга Вершинина недовольна: обещали, что бот начнёт принимать заказы от фермеров к 1 октября, а он до сих пор работает только в тестовой группе. Говорит, что второй раз верит нам на слово и третьего не будет. Попросила письменный план с датами до конца недели.\nПо деньгам вопросов нет, оплачено.",
)
const CLIENT_DELAYS = [
  [
    "x-n-delay-1",
    "ru",
    "Клиент сам перенёс старт пилота на февраль: у них переезд склада. Сроки с нашей стороны в порядке, всё готово к запуску.",
  ],
  [
    "x-n-delay-2",
    "en",
    "They pushed the kickoff to January themselves, their IT is busy with an ERP upgrade. Our side is ready; nobody is upset, just a calendar thing.",
  ],
  [
    "x-n-delay-3",
    "es",
    "Han retrasado ellos la puesta en marcha hasta después de Reyes porque cambian de centralita. Por nuestra parte todo listo.",
  ],
  [
    "x-n-delay-4",
    "de",
    "Der Kunde verschiebt den Start selbst auf März, Betriebsrat muss noch zustimmen. Von unserer Seite alles fertig.",
  ],
  ["x-n-delay-5", "ru", "Сроки по договору: сдача второго этапа 15.12, всё идёт по плану, клиент доволен темпом."],
  [
    "x-n-delay-6",
    "en",
    "Asked them for the data export three times; until it arrives the pilot can't start. Reminded Neil again today.",
  ],
]

// L5: a deal whose name says nothing; only its note says the bot must answer in Kazakh.
xCompany("x-irtysh", "Иртыш Ритейл", "Омск", "RETAIL", "+7 381 290-55-00")
xContact("x-irtysh-aigerim", "Айгерим", "Сеитова", "x-irtysh", "Омск", "Руководитель поддержки", "+7 381 290-55-17")
xContact("x-irtysh-pavel", "Павел", "Лукин", "x-irtysh", "Омск", "Директор по ИТ", "+7 381 290-55-03")
xDeal(
  "x-irtysh-deal",
  "Иртыш Ритейл — ассистент для покупателей",
  "x-irtysh",
  ["x-irtysh-aigerim", "x-irtysh-pavel"],
  "Proposal Sent",
  26400,
  "2027-01-30",
)
xDeal(
  "x-irtysh-2",
  "Иртыш Ритейл — аналитика звонков",
  "x-irtysh",
  ["x-irtysh-pavel"],
  "Discovery Call",
  9000,
  "2027-03-15",
)
xNote(
  "x-n-irtysh",
  "x-irtysh-deal",
  "x-irtysh",
  ["x-irtysh-aigerim"],
  "2026-11-11T05:30:00Z",
  "Созвон с Айгерим. У них 34 магазина, из них 11 в приграничных районах, и примерно треть обращений в чат приходит не на русском. Без того, чтобы ассистент отвечал покупателям и на казахском, они не подпишут: это условие от собственника. Переключаться на язык нужно по первому сообщению клиента, а не по кнопке.\nПавел отдельно спросил про интеграцию с их 1С:Розница.",
)
xNote(
  "x-n-kz-distractor",
  null,
  "x-ru-kz-log",
  [],
  "2026-11-06T06:00:00Z",
  "Отгрузки в Казахстан выросли на 30% за квартал, водители стоят на границе по 6 часов. Хотят бота, который будет предупреждать клиентов о задержке на таможне.",
)
xCompany("x-ru-kz-log", "ТрансАзия Логистик", "Тюмень", "LOGISTICS_AND_SUPPLY_CHAIN", "+7 3452 61-20-00")
xNote(
  "x-n-tatar",
  null,
  "x-kazan-market",
  [],
  "2026-11-02T09:00:00Z",
  "Обсуждали, нужен ли татарский в боте. Решили, что пока нет: почти все пишут по-русски, вернёмся к вопросу через год.",
)
xCompany("x-kazan-market", "Идель Маркет", "Казань", "RETAIL", "+7 843 211-30-30")

// L6: Ferraro Arredamenti; who approves the estimate (note) and when it goes out (task). Ferrara Design and
// Ferrero Imballaggi are the distractors.
xCompany("x-ferraro", "Ferraro Arredamenti Srl", "Milano", "FURNITURE", "+39 02 4851 7720")
xCompany("x-ferrara", "Ferrara Design Studio", "Bologna", "COMPUTER_SOFTWARE", "+39 051 640 2210")
xCompany("x-ferrero-imb", "Ferrero Imballaggi SpA", "Torino", "RETAIL", "+39 011 790 4400")
xContact("x-ferraro-giulia", "Giulia", "Conti", "x-ferraro", "Milano", "Responsabile Commerciale", "+39 02 4851 7731")
xContact("x-ferraro-marco", "Marco", "Bellini", "x-ferraro", "Milano", "CFO", "+39 02 4851 7702")
xContact("x-ferrara-luca", "Luca", "Ferrara", "x-ferrara", "Bologna", "Amministratore Delegato", "+39 051 640 2211")
xContact("x-ferrero-sara", "Sara", "Greco", "x-ferrero-imb", "Torino", "Responsabile IT", "+39 011 790 4419")
xDeal(
  "x-ferraro-deal",
  "Ferraro Arredamenti — configuratore AI",
  "x-ferraro",
  ["x-ferraro-giulia", "x-ferraro-marco"],
  "Proposal Sent",
  24000,
  "2027-01-14",
)
xDeal(
  "x-ferrara-deal",
  "Ferrara Design — chatbot assistenza",
  "x-ferrara",
  ["x-ferrara-luca"],
  "Negotiation",
  11000,
  "2026-12-09",
)
xDeal(
  "x-ferrero-deal",
  "Ferrero Imballaggi — estrazione documenti",
  "x-ferrero-imb",
  ["x-ferrero-sara"],
  "Discovery Call",
  15000,
  "2027-02-20",
)
xNote(
  "x-n-ferraro",
  "x-ferraro-deal",
  "x-ferraro",
  ["x-ferraro-giulia"],
  "2026-11-18T10:15:00Z",
  "Call with Giulia Conti. She likes the configurator demo, showrooms in Milano and Como would use it first. One catch: she can only sign off up to 20k EUR, so the final estimate has to be approved by their CFO, Marco Bellini. He wants the estimate split into setup and yearly licence, and the hosting cost shown separately.\nThey use a 3D catalogue from an Italian vendor; we need the export format.",
)
xTask(
  "x-t-ferraro",
  "x-ferraro-deal",
  "x-ferraro",
  ["x-ferraro-giulia", "x-ferraro-marco"],
  "2026-12-04T09:00:00Z",
  "NOT_STARTED",
  "Send revised estimate to Ferraro (setup + licence + hosting split)",
)
xTask(
  "x-t-ferrara",
  "x-ferrara-deal",
  "x-ferrara",
  ["x-ferrara-luca"],
  "2026-11-27T10:00:00Z",
  "NOT_STARTED",
  "Send estimate to Ferrara Design",
)
xNote(
  "x-n-ferrara",
  "x-ferrara-deal",
  "x-ferrara",
  ["x-ferrara-luca"],
  "2026-11-19T14:00:00Z",
  "Luca Ferrara signs himself, small studio. Wants the estimate before the end of November.",
)
xTask(
  "x-t-ferrero",
  "x-ferrero-deal",
  "x-ferrero-imb",
  ["x-ferrero-sara"],
  "2026-12-10T09:00:00Z",
  "NOT_STARTED",
  "Discovery call with Sara (Ferrero Imballaggi)",
)

// L7: three clients say a rival offers the same for less; "их конкуренты" in the other sense as distractors.
xCompany("x-volna", "Волна Сервис", "Нижний Новгород", "RETAIL", "+7 831 266-10-40")
xCompany("x-albora", "Albora Clínicas SL", "Málaga", "MEDICAL_PRACTICE", "+34 952 60 11 30")
xCompany("x-kestrel", "Kestrel Home Insurance Ltd", "Bristol", "FINANCIAL_SERVICES", "+44 117 496 0320")
xContact("x-volna-irina", "Ирина", "Шубина", "x-volna", "Нижний Новгород", "Коммерческий директор", "+7 831 266-10-44")
xContact("x-albora-raquel", "Raquel", "Bermúdez", "x-albora", "Málaga", "Gerente", "+34 952 60 11 35")
xContact("x-kestrel-owen", "Owen", "Pryce", "x-kestrel", "Bristol", "Head of Customer Success", "+44 117 496 0341")
xDeal(
  "x-volna-deal",
  "Волна Сервис — аналитика звонков",
  "x-volna",
  ["x-volna-irina"],
  "Negotiation",
  21000,
  "2026-12-20",
)
xDeal(
  "x-albora-deal",
  "Albora Clínicas — asistente de atención al cliente",
  "x-albora",
  ["x-albora-raquel"],
  "Proposal Sent",
  13500,
  "2027-01-12",
)
xDeal(
  "x-kestrel-deal",
  "Kestrel Home — claims triage",
  "x-kestrel",
  ["x-kestrel-owen"],
  "Negotiation",
  46000,
  "2026-12-16",
)
xNote(
  "x-n-volna",
  "x-volna-deal",
  "x-volna",
  ["x-volna-irina"],
  "2026-07-14T12:00:00Z",
  "Ирина Шубина прямо сказала: им пришло предложение от интегратора из Казани на то же самое почти вдвое меньше, 11 тысяч за год с поддержкой. Мы им нравимся больше, но объяснить разницу собственнику она не может. Просит до пятницы ответ, что мы можем сделать по цене или по объёму работ.",
)
xNote(
  "x-n-albora",
  "x-albora-deal",
  "x-albora",
  ["x-albora-raquel"],
  "2026-05-19T09:40:00Z",
  "Raquel nos cuenta que otro proveedor les ha pasado una oferta un 35 % por debajo de la nuestra, con integración con su programa de citas incluida. No quiere cambiar, pero necesita un argumento para dirección.",
)
xNote(
  "x-n-kestrel",
  "x-kestrel-deal",
  "x-kestrel",
  ["x-kestrel-owen"],
  "2026-11-20T16:30:00Z",
  "Owen was frank: they have a quote from another agency at roughly 60% of ours for the claims triage, and procurement will push for it unless we show why we are worth the gap. He would rather stay with us. Wants a side-by-side of what is in each scope by next Wednesday.",
)
const RIVALS_OTHER_SENSE = [
  [
    "x-n-rival-1",
    "ru",
    "У них конкуренты уже запустили бота в приложении, собственник нервничает и хочет успеть до весны. Бюджет есть.",
  ],
  [
    "x-n-rival-2",
    "en",
    "Their competitors launched a WhatsApp assistant last month; the board asked why they don't have one. Strong urgency, price not an issue.",
  ],
  [
    "x-n-rival-3",
    "es",
    "Su competencia ya tiene un asistente en la web y les están quitando clientes jóvenes. Quieren ir rápido.",
  ],
  ["x-n-rival-4", "ru", "Дали им скидку 10% за то, что берут сразу два бота. Сами предложили, клиент не просил."],
]

// L8: Александр Петров of Kazan among Алексей Петров (Kazan), Aleksandr Petrov (Moscow, Latin), Александра Петрова
// (Kazan) and Александр Петровский (Kazan); each has a meeting.
xCompany("x-volga-agro", "Волга Агрохолдинг", "Казань", "FARMING", "+7 843 590-20-20")
xCompany("x-kazan-it", "КазаньТехСофт", "Казань", "COMPUTER_SOFTWARE", "+7 843 590-81-00")
xCompany("x-msk-fin", "Меридиан Капитал", "Москва", "FINANCIAL_SERVICES", "+7 495 640-11-90")
xCompany("x-kazan-med", "Идель Мед", "Казань", "MEDICAL_PRACTICE", "+7 843 590-44-00")
xContact(
  "x-petrov-alexandr",
  "Александр",
  "Петров",
  "x-volga-agro",
  "Казань",
  "Директор по цифровизации",
  "+7 843 590-20-27",
)
xContact("x-petrov-alexey", "Алексей", "Петров", "x-kazan-it", "Казань", "Генеральный директор", "+7 843 590-81-01")
xContact("x-petrov-latin", "Aleksandr", "Petrov", "x-msk-fin", "Москва", "Директор по ИТ", "+7 495 640-11-94")
xContact(
  "x-petrova-alexandra",
  "Александра",
  "Петрова",
  "x-kazan-med",
  "Казань",
  "Операционный директор",
  "+7 843 590-44-12",
)
xContact("x-petrovsky", "Александр", "Петровский", "x-kazan-med", "Казань", "Главный врач", "+7 843 590-44-01")
xDeal(
  "x-volga-deal",
  "Волга Агрохолдинг — прогноз спроса",
  "x-volga-agro",
  ["x-petrov-alexandr"],
  "Solution Design",
  39000,
  "2027-02-27",
)
xDeal(
  "x-kazan-it-deal",
  "КазаньТехСофт — база знаний с поиском",
  "x-kazan-it",
  ["x-petrov-alexey"],
  "Proposal Sent",
  12500,
  "2027-01-18",
)
xDeal(
  "x-msk-fin-deal",
  "Меридиан Капитал — ассистент для юристов",
  "x-msk-fin",
  ["x-petrov-latin"],
  "Needs Assessment",
  33000,
  "2027-02-12",
)
xDeal(
  "x-kazan-med-deal",
  "Идель Мед — чат-бот для записи",
  "x-kazan-med",
  ["x-petrova-alexandra", "x-petrovsky"],
  "Negotiation",
  17500,
  "2026-12-22",
)
xMeeting(
  "x-m-volga",
  "x-volga-deal",
  "x-volga-agro",
  ["x-petrov-alexandr"],
  "2026-11-05T08:00:00Z",
  "2026-11-05T09:30:00Z",
  "Волга Агрохолдинг: встреча в Казани",
  "Были у них в офисе, от нас Кирилл и Аня. Александр Петров собрал агрономов и логистов. Решили: пилот прогноза на двух элеваторах (Буинск и Тетюши) с середины января; доступ к данным датчиков влажности они дают до 15.12; оплата 50% при старте пилота, 50% после отчёта. Второй этап, все 9 элеваторов, обсуждаем только после пилота.",
)
xMeeting(
  "x-m-volga-old",
  "x-volga-deal",
  "x-volga-agro",
  ["x-petrov-alexandr"],
  "2026-10-01T07:00:00Z",
  "2026-10-01T08:00:00Z",
  "Волга Агрохолдинг: знакомство",
  "Первая встреча по видеосвязи, Петров рассказал про 9 элеваторов и потери при хранении. Договорились приехать к ним.",
)
xMeeting(
  "x-m-alexey",
  "x-kazan-it-deal",
  "x-kazan-it",
  ["x-petrov-alexey"],
  "2026-11-12T10:00:00Z",
  "2026-11-12T11:00:00Z",
  "КазаньТехСофт: демо базы знаний",
  "Показали поиск по их Confluence. Алексей Петров хочет пилот на отделе поддержки, решение до конца года.",
)
xMeeting(
  "x-m-latin",
  "x-msk-fin-deal",
  "x-msk-fin",
  ["x-petrov-latin"],
  "2026-11-19T12:00:00Z",
  "2026-11-19T13:00:00Z",
  "Meridian Kapital: legal assistant",
  "Aleksandr Petrov wants clause search over 4,000 contracts. Decided: send an NDA, then a sample of 50 contracts.",
)
xMeeting(
  "x-m-petrova",
  "x-kazan-med-deal",
  "x-kazan-med",
  ["x-petrova-alexandra"],
  "2026-11-10T09:00:00Z",
  "2026-11-10T10:00:00Z",
  "Идель Мед: запись пациентов",
  "Александра Петрова: решили начать с записи на анализы, интеграция с их МИС в декабре.",
)
xMeeting(
  "x-m-petrovsky",
  "x-kazan-med-deal",
  "x-kazan-med",
  ["x-petrovsky"],
  "2026-11-14T06:30:00Z",
  "2026-11-14T07:00:00Z",
  "Идель Мед: главный врач",
  "Александр Петровский одобрил пилот, просит не трогать запись к узким специалистам.",
)
for (const [first, last, city] of [
  ["Игорь", "Петров", "Москва"],
  ["Мария", "Петрова", "Екатеринбург"],
  ["Сергей", "Петров", "Самара"],
  ["Elena", "Petrova", "Valencia"],
  ["Дмитрий", "Петров", "Санкт-Петербург"],
  ["Ольга", "Петрова", "Уфа"],
  ["Alexander", "Petroff", "Berlin"],
]) {
  X.contacts.push({
    key: `x-${slug(first + last + city)}`,
    first,
    last,
    company: null,
    city,
    title: pick(LOCALES.ru.titles),
    phone: LOCALES.ru.phone(),
  })
}

// L9 has no answer: nobody asked for a discount for paying a year ahead. These are its near misses.
const PREPAY_NEAR = [
  ["x-n-prepay-1", "ru", "Просили рассрочку: три платежа вместо одного, без скидки. Согласились."],
  [
    "x-n-prepay-2",
    "en",
    "They are happy to pay 50% upfront, no discount discussed. Finance just wants one invoice per quarter.",
  ],
  ["x-n-prepay-3", "es", "Preguntaron si hay descuento por volumen si contratan tres bots; les dijimos 5%."],
  [
    "x-n-prepay-4",
    "ru",
    "Обсуждали годовой контракт вместо помесячной оплаты: им так проще для бюджета. Про цену разговора не было.",
  ],
  ["x-n-prepay-5", "de", "Zahlung jährlich im Voraus ist für sie Standard, das machen sie bei allen Anbietern so."],
]

// L10: a call with a tinned-fish maker in Bilbao about false night alarms in its cold rooms.
xCompany("x-itsasoa", "Conservas Itsasoa SL", "Bilbao", "RETAIL", "+34 944 23 51 60")
xCompany("x-bilbao-2", "Nervión Software SL", "Bilbao", "COMPUTER_SOFTWARE", "+34 944 70 12 00")
xCompany("x-bilbao-3", "Ría Construcciones SA", "Bilbao", "CONSTRUCTION", "+34 944 81 30 10")
xCompany("x-vigo-fish", "Pescados Rías Baixas SL", "Vigo", "LOGISTICS_AND_SUPPLY_CHAIN", "+34 986 22 40 90")
xCompany("x-frio-retail", "Supermercados Albora SA", "Alicante", "RETAIL", "+34 965 14 70 00")
xContact("x-itsasoa-iker", "Iker", "Etxeberria", "x-itsasoa", "Bilbao", "Director de Planta", "+34 944 23 51 64")
xContact("x-itsasoa-leire", "Leire", "Agirre", "x-itsasoa", "Bilbao", "Responsable de Calidad", "+34 944 23 51 69")
xContact("x-nervion-jon", "Jon", "Uriarte", "x-bilbao-2", "Bilbao", "CTO", "+34 944 70 12 07")
xContact("x-ria-ana", "Ana", "Larrañaga", "x-bilbao-3", "Bilbao", "Gerente", "+34 944 81 30 15")
xContact("x-vigo-xabier", "Xabier", "Otero", "x-vigo-fish", "Vigo", "Director General", "+34 986 22 40 91")
xContact("x-frio-marta", "Marta", "Pascual", "x-frio-retail", "Alicante", "Responsable de Compras", "+34 965 14 70 22")
xDeal(
  "x-itsasoa-deal",
  "Conservas Itsasoa — detección de anomalías",
  "x-itsasoa",
  ["x-itsasoa-iker", "x-itsasoa-leire"],
  "Needs Assessment",
  28000,
  "2027-01-29",
)
xDeal(
  "x-nervion-deal",
  "Nervión Software — asistente para comerciales",
  "x-bilbao-2",
  ["x-nervion-jon"],
  "Proposal Sent",
  12000,
  "2027-01-08",
)
xDeal(
  "x-ria-deal",
  "Ría Construcciones — lectura de facturas",
  "x-bilbao-3",
  ["x-ria-ana"],
  "Discovery Call",
  8000,
  "2027-02-15",
)
xDeal(
  "x-vigo-deal",
  "Pescados Rías Baixas — previsión de demanda",
  "x-vigo-fish",
  ["x-vigo-xabier"],
  "Solution Design",
  22000,
  "2027-01-25",
)
xDeal(
  "x-frio-deal",
  "Supermercados Albora — análisis de llamadas",
  "x-frio-retail",
  ["x-frio-marta"],
  "Proposal Sent",
  16000,
  "2027-01-11",
)
xCall(
  "x-c-itsasoa",
  "x-itsasoa-deal",
  "x-itsasoa",
  ["x-itsasoa-iker"],
  "2026-11-13T09:00:00Z",
  38,
  "Llamada con Iker (Itsasoa)",
  "Iker cuenta que las cámaras frigoríficas de la planta mandan alarmas de temperatura falsas casi todas las noches y el turno de noche ya no las mira. El mes pasado una avería de verdad pasó desapercibida y perdieron unas 2 toneladas de bonito. Quieren algo que distinga una puerta abierta de un fallo del compresor.\nNos comprometimos a: enviar una propuesta de detección de anomalías sobre los datos de los sensores antes del 1 de diciembre y hacer una demo con su histórico de 2025. Leire nos pasa el export de los registradores.",
)
xCall(
  "x-c-nervion",
  "x-nervion-deal",
  "x-bilbao-2",
  ["x-nervion-jon"],
  "2026-11-14T11:00:00Z",
  20,
  "Llamada Nervión",
  "Jon quiere el asistente para sus comerciales integrado con HubSpot. Pide la propuesta revisada.",
)
xCall(
  "x-c-vigo",
  "x-vigo-deal",
  "x-vigo-fish",
  ["x-vigo-xabier"],
  "2026-11-12T10:00:00Z",
  25,
  "Llamada con Xabier (Rías Baixas)",
  "Hablamos de rutas de reparto a pescaderías y de prever la demanda de los viernes. Quieren el piloto en Vigo y Pontevedra.",
)
xCall(
  "x-c-frio",
  "x-frio-deal",
  "x-frio-retail",
  ["x-frio-marta"],
  "2026-11-18T09:30:00Z",
  15,
  "Llamada Supermercados Albora",
  "Marta está renovando los frigoríficos de las tiendas este invierno y no tiene tiempo hasta enero para el proyecto de llamadas.",
)

for (const [key, lang, body] of [...CLIENT_DELAYS, ...RIVALS_OTHER_SENSE, ...PREPAY_NEAR]) {
  X.notes.push({ key, deal: null, company: null, contacts: [], at: null, body, lang, attach: true })
}
