// The pools and the seeded random draw that large-data.mjs builds round 2's account from. One generator state is
// shared by both files, so the order of draws, and so every record, stays the same from run to run.
export const TAG_DOMAIN = "l2.seed.wirecat.dev"
export const SEED = 20261124
// The owner asked for 5,000 contacts. The test account refuses every create once it holds about 3,000 contacts
// (HTTP 402 BUCKETED_OBJECTS, limit 3000), so 2,780 are planned. The random draw still runs to the first plan's 4,944
// people, so the records already made keep their keys and e-mails, and the cleanup can name the rest.
export const SIZE = { companies: 820, contacts: 2780, deals: 2000, notes: 3000, tasks: 1200, calls: 300, meetings: 200 }
export const CONTACTS_DRAWN = 4944
export const everyContact = []

export const rng = (() => {
  let a = SEED
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
})()
export const int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1))
export const pick = (list) => list[Math.floor(rng() * list.length)]
export const chance = (p) => rng() < p
export const weighted = (pairs) => {
  let r = rng() * pairs.reduce((s, [, w]) => s + w, 0)
  for (const [value, w] of pairs) {
    r -= w
    if (r < 0) return value
  }
  return pairs.at(-1)[0]
}
export const pad = (n, w = 2) => String(n).padStart(w, "0")
export const DAY = 86_400_000
export const dateBetween = (from, to) =>
  new Date(Date.parse(from) + Math.floor(rng() * (Date.parse(to) - Date.parse(from))))
export const isoHour = (d) => {
  d.setUTCHours(int(6, 17), pick([0, 0, 15, 30, 45]), 0, 0)
  return d.toISOString().replace(".000Z", "Z")
}
export const ymd = (d) => d.toISOString().slice(0, 10)
export const dmy = (d) => `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}`

export const CYR = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
}
export const slug = (text) =>
  [...text.toLowerCase()]
    .map((c) => CYR[c] ?? c)
    .join("")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

// Surnames the needles use are kept out of the random pools, so the only records with them are the ones planted.
export const RESERVED = /^(hof+man+|гофман|хофман|schmi[dt]+|шмидт|ferr[aeo]r|petrov|петров|gim[eé]nez|jim[eé]nez|xim)/i

export const LOCALES = {
  ru: {
    weight: 40,
    cities:
      "Москва|Санкт-Петербург|Казань|Екатеринбург|Новосибирск|Нижний Новгород|Самара|Краснодар|Ростов-на-Дону|Пермь|Воронеж|Уфа|Омск|Тюмень|Калининград".split(
        "|",
      ),
    male: "Алексей|Андрей|Антон|Артём|Борис|Вадим|Валерий|Виктор|Владимир|Глеб|Денис|Дмитрий|Евгений|Егор|Иван|Игорь|Илья|Кирилл|Константин|Максим|Михаил|Никита|Николай|Олег|Павел|Роман|Руслан|Станислав|Тимур|Фёдор|Юрий|Ярослав|Григорий".split(
      "|",
    ),
    female:
      "Алина|Анастасия|Анна|Валерия|Вера|Дарья|Евгения|Екатерина|Елена|Жанна|Ирина|Карина|Ксения|Лариса|Любовь|Маргарита|Марина|Мария|Надежда|Наталья|Нина|Оксана|Ольга|Полина|Светлана|Софья|Татьяна|Ульяна|Юлия|Яна|Диляра|Гульнара".split(
        "|",
      ),
    last: "Абрамов|Алексеев|Афанасьев|Баранов|Белоусов|Бирюков|Блинов|Богданов|Борисов|Быков|Васильев|Виноградов|Воронов|Гаврилов|Галиев|Герасимов|Голубев|Горбунов|Григорьев|Давыдов|Денисов|Дмитриев|Ершов|Жуков|Зайцев|Захаров|Зуев|Ильин|Исаев|Казаков|Калинин|Карпов|Киселёв|Ковалёв|Козлов|Комаров|Кондратьев|Королёв|Котов|Крылов|Куликов|Лазарев|Лебедев|Макаров|Максимов|Медведев|Мельников|Миронов|Михайлов|Моисеев|Назаров|Никитин|Николаев|Новиков|Орлов|Осипов|Павлов|Панов|Поляков|Пономарёв|Попов|Прохоров|Романов|Рябов|Савельев|Сафин|Седов|Семёнов|Сергеев|Сидоров|Смирнов|Соболев|Соколов|Соловьёв|Сорокин|Степанов|Тарасов|Тимофеев|Титов|Устинов|Фёдоров|Филиппов|Фролов|Хабибуллин|Харитонов|Цветков|Чернов|Шарипов|Шестаков|Широков|Щербаков|Яковлев|Гарипов|Нуриев".split(
      "|",
    ),
    titles:
      "Генеральный директор|Коммерческий директор|Директор по ИТ|Руководитель отдела продаж|Менеджер проекта|Финансовый директор|Руководитель колл-центра|Аналитик|Юрист|Директор по маркетингу|Операционный директор|Руководитель поддержки|Главный инженер|Специалист по закупкам|Собственник|Директор по цифровизации".split(
        "|",
      ),
    roots:
      "Север|Восток|Волга|Урал|Сибирь|Кама|Дон|Вектор|Альтаир|Гранит|Меридиан|Прогресс|Сфера|Атлант|Кристалл|Байкал|Ладога|Звезда|Ресурс|Импульс|Горизонт|Феникс|Ока|Енисей|Нева|Магистраль|Полярис|Оптима|Профи|Династия|Берёзка|Сокол|Тайга|Луч|Престиж|Эталон|Монолит|Квант|Пульс|Орион".split(
        "|",
      ),
    kinds: [
      ["Логистик", "LOGISTICS_AND_SUPPLY_CHAIN"],
      ["Строй", "CONSTRUCTION"],
      ["Агро", "FARMING"],
      ["Маркет", "RETAIL"],
      ["Мед", "MEDICAL_PRACTICE"],
      ["Финанс", "FINANCIAL_SERVICES"],
      ["Мебель", "FURNITURE"],
      ["Транс", "TRANSPORTATION_TRUCKING_RAILROAD"],
      ["Софт", "COMPUTER_SOFTWARE"],
      ["Отель", "HOSPITALITY"],
      ["Энерго", "RENEWABLES_ENVIRONMENT"],
      ["Консалт", "MANAGEMENT_CONSULTING"],
      ["Школа", "E_LEARNING"],
    ],
    company: (root, kind) =>
      pick([
        `${root}${kind}`,
        `${root}-${kind}`,
        `${kind} ${root}`,
        `${root} ${kind}`,
        `ГК ${root}`,
        `${root}${kind} Групп`,
      ]),
    phone: () =>
      `+7 ${pick([
        "495",
        "812",
        "843",
        "343",
        "383",
        "831",
        "846",
        "861",
        "863",
        "342",
        "473",
        "347",
        "381",
        "3452",
        "4012",
      ])} ${int(200, 799)}-${pad(int(0, 99))}-${pad(int(0, 99))}`,
  },
  es: {
    weight: 22,
    cities: "Madrid|Barcelona|Valencia|Sevilla|Bilbao|Málaga|Zaragoza|Alicante|Vigo|Murcia|Valladolid|Palma".split("|"),
    male: "Alejandro|Álvaro|Andrés|Antonio|Carlos|Daniel|David|Diego|Enrique|Fernando|Francisco|Gonzalo|Hugo|Ignacio|Iker|Javier|Jorge|José|Luis|Manuel|Marcos|Mario|Miguel|Pablo|Pedro|Rafael|Raúl|Rubén|Sergio|Víctor|Xabier|Jordi".split(
      "|",
    ),
    female:
      "Ainhoa|Alba|Alicia|Ana|Andrea|Beatriz|Carmen|Clara|Cristina|Elena|Eva|Inés|Irene|Isabel|Julia|Laura|Leire|Lorena|Marta|María|Montserrat|Natalia|Noelia|Nuria|Paula|Pilar|Raquel|Rocío|Sara|Silvia|Teresa|Vanesa".split(
        "|",
      ),
    last: "García|Rodríguez|González|Fernández|López|Martínez|Sánchez|Pérez|Gómez|Martín|Hernández|Ruiz|Díaz|Moreno|Muñoz|Álvarez|Romero|Alonso|Gutiérrez|Navarro|Torres|Domínguez|Vázquez|Ramos|Gil|Ramírez|Serrano|Blanco|Molina|Morales|Suárez|Ortega|Delgado|Castro|Ortiz|Rubio|Marín|Sanz|Iglesias|Medina|Garrido|Cortés|Castillo|Santos|Lozano|Guerrero|Cano|Prieto|Méndez|Cruz|Calvo|Gallego|Vidal|León|Herrera|Márquez|Peña|Flores|Cabrera|Campos|Vega|Fuentes|Carrasco|Diez|Aguilar|Etxeberria|Aguirre|Puig|Soler|Ferrándiz|Mas|Roig|Llorente|Pastor|Bravo".split(
      "|",
    ),
    titles:
      "Director General|Director Comercial|Responsable de IT|Jefa de Operaciones|Director Financiero|Responsable de Atención al Cliente|Gerente|Project Manager|Head of Marketing|Responsable de Compras|CTO|Socio fundador|Directora de Recursos Humanos|Analista de datos".split(
        "|",
      ),
    roots:
      "Sol|Mar|Brisa|Olivo|Azahar|Iberia|Levante|Cantábrico|Mediterráneo|Sierra|Ría|Alba|Faro|Duero|Ebro|Tajo|Atlántico|Castilla|Nova|Luna|Brava|Albora|Mirador|Aurora|Viento|Montaña|Costa|Arena|Palmera|Granada".split(
        "|",
      ),
    kinds: [
      ["Logística", "LOGISTICS_AND_SUPPLY_CHAIN"],
      ["Construcciones", "CONSTRUCTION"],
      ["Agro", "FARMING"],
      ["Retail", "RETAIL"],
      ["Clínicas", "MEDICAL_PRACTICE"],
      ["Finanzas", "FINANCIAL_SERVICES"],
      ["Muebles", "FURNITURE"],
      ["Transportes", "TRANSPORTATION_TRUCKING_RAILROAD"],
      ["Software", "COMPUTER_SOFTWARE"],
      ["Hoteles", "HOSPITALITY"],
      ["Energía", "RENEWABLES_ENVIRONMENT"],
      ["Consultores", "MANAGEMENT_CONSULTING"],
      ["Academia", "E_LEARNING"],
    ],
    company: (root, kind) =>
      pick([`${kind} ${root} SL`, `${root} ${kind} SA`, `Grupo ${root}`, `${root} ${kind}`, `${kind} del ${root} SL`]),
    phone: () =>
      `+34 ${pick(["91", "93", "96", "95", "94", "976", "965", "986", "968", "983", "971", "6"])}${int(0, 9)} ${pad(int(0, 99))} ${pad(int(0, 99))} ${pad(int(0, 99))}`,
  },
  de: {
    weight: 22,
    cities:
      "Berlin|Hamburg|München|Köln|Frankfurt am Main|Stuttgart|Hannover|Düsseldorf|Leipzig|Bremen|Nürnberg|Wien|Zürich|Dresden".split(
        "|",
      ),
    male: "Andreas|Christian|Daniel|Dennis|Dirk|Felix|Florian|Frank|Jan|Jonas|Jörg|Julian|Kai|Klaus|Lars|Lukas|Markus|Matthias|Michael|Niklas|Oliver|Patrick|Philipp|Ralf|Sebastian|Stefan|Sven|Thomas|Tim|Tobias|Uwe|Wolfgang|Jens".split(
      "|",
    ),
    female:
      "Andrea|Anja|Anna|Birgit|Carina|Claudia|Doris|Franziska|Heike|Ines|Jana|Julia|Katrin|Kerstin|Laura|Lisa|Maren|Melanie|Monika|Nadine|Nicole|Petra|Sabine|Sandra|Silke|Sophie|Stefanie|Susanne|Tanja|Ute|Vanessa|Yvonne".split(
        "|",
      ),
    last: "Müller|Schneider|Fischer|Meyer|Wagner|Becker|Schulz|Koch|Bauer|Richter|Klein|Wolf|Schröder|Neumann|Schwarz|Zimmermann|Braun|Krüger|Hartmann|Lange|Schmitz|Krause|Werner|Lehmann|Köhler|Maier|Huber|Kaiser|Fuchs|Peters|Lang|Scholz|Möller|Weiß|Jung|Hahn|Keller|Vogel|Friedrich|Günther|Frank|Berger|Winkler|Roth|Beck|Lorenz|Baumann|Franke|Albrecht|Ludwig|Winter|Kraus|Martin|Schumacher|Krämer|Vogt|Stein|Jäger|Otto|Sommer|Groß|Seidel|Heinrich|Brandt|Haas|Graf|Dietrich|Kühn|Pohl|Engel|Horn|Busch|Bergmann|Thomas|Voigt|Sauer".split(
      "|",
    ),
    titles:
      "Geschäftsführer|Head of Sales|IT-Leiter|Leiterin Kundenservice|CFO|Einkaufsleiter|Projektleiterin|Head of Operations|Prokurist|Digitalisierungsbeauftragter|Teamleiter Disposition|Head of Customer Success|Datenschutzbeauftragte|COO".split(
        "|",
      ),
    roots:
      "Nord|Süd|Alpen|Rhein|Elbe|Main|Spree|Isar|Weser|Hansa|Brücken|Eichen|Linden|Falken|Adler|Stern|Berg|Tal|Wald|Silber|Kristall|Blau|Grün|Sonnen|Licht|Ostsee|Harz|Donau|Neckar|Mosel".split(
        "|",
      ),
    kinds: [
      ["Logistik", "LOGISTICS_AND_SUPPLY_CHAIN"],
      ["Bau", "CONSTRUCTION"],
      ["Agrar", "FARMING"],
      ["Handel", "RETAIL"],
      ["Praxis", "MEDICAL_PRACTICE"],
      ["Finanz", "FINANCIAL_SERVICES"],
      ["Möbel", "FURNITURE"],
      ["Spedition", "TRANSPORTATION_TRUCKING_RAILROAD"],
      ["Software", "COMPUTER_SOFTWARE"],
      ["Hotels", "HOSPITALITY"],
      ["Energie", "RENEWABLES_ENVIRONMENT"],
      ["Beratung", "MANAGEMENT_CONSULTING"],
      ["Akademie", "E_LEARNING"],
    ],
    company: (root, kind) =>
      pick([
        `${root}${kind.toLowerCase()} GmbH`,
        `${root} ${kind} GmbH`,
        `${root}-${kind} AG`,
        `${kind}haus ${root}`,
        `${root}werk ${kind} GmbH & Co. KG`,
      ]),
    phone: () =>
      `+49 ${pick([
        "30",
        "40",
        "89",
        "221",
        "69",
        "711",
        "511",
        "211",
        "341",
        "421",
        "911",
        "351",
        "151",
        "160",
        "171",
      ])} ${int(100, 999)} ${int(1000, 9999)}`,
  },
  en: {
    weight: 13,
    cities: ["London", "Manchester", "Dublin", "Edinburgh", "Bristol", "Leeds", "Birmingham", "Cork"],
    male: "James|Oliver|Harry|Jack|George|Noah|Charlie|Thomas|William|Daniel|Matthew|Ryan|Liam|Conor|Sean|Callum|Ben|Sam|Alex|Owen|Patrick|Neil|Simon|Mark".split(
      "|",
    ),
    female:
      "Olivia|Amelia|Isla|Ava|Emily|Sophie|Grace|Lily|Chloe|Ella|Hannah|Lucy|Megan|Aoife|Niamh|Sarah|Rachel|Laura|Emma|Kate|Holly|Zoe|Ruth|Fiona".split(
        "|",
      ),
    last: "Smith|Jones|Taylor|Brown|Williams|Wilson|Johnson|Davies|Robinson|Wright|Thompson|Evans|Walker|White|Roberts|Green|Hall|Wood|Jackson|Clarke|Murphy|Kelly|O'Brien|Byrne|Ryan|Walsh|Campbell|Stewart|Morrison|Hughes|Edwards|Lewis|Harris|Martin|Cooper|King|Baker|Turner|Hill|Moore|Ward|Morgan|Bennett".split(
      "|",
    ),
    titles:
      "CEO|Head of Sales|IT Director|Customer Service Manager|CFO|Operations Director|Procurement Manager|Product Owner|Founder|Head of Digital|COO|Data Lead".split(
        "|",
      ),
    roots:
      "Thames|Pennine|Harbour|Oak|Northgate|Riverside|Bridgewater|Clyde|Liffey|Kestrel|Highland|Greenfield|Bluebell|Copper|Lantern|Fox|Heron|Granite".split(
        "|",
      ),
    kinds: [
      ["Logistics", "LOGISTICS_AND_SUPPLY_CHAIN"],
      ["Build", "CONSTRUCTION"],
      ["Farms", "FARMING"],
      ["Retail", "RETAIL"],
      ["Health", "MEDICAL_PRACTICE"],
      ["Finance", "FINANCIAL_SERVICES"],
      ["Furniture", "FURNITURE"],
      ["Freight", "TRANSPORTATION_TRUCKING_RAILROAD"],
      ["Software", "COMPUTER_SOFTWARE"],
      ["Hotels", "HOSPITALITY"],
      ["Energy", "RENEWABLES_ENVIRONMENT"],
      ["Advisory", "MANAGEMENT_CONSULTING"],
      ["Learning", "E_LEARNING"],
    ],
    company: (root, kind) =>
      pick([`${root} ${kind} Ltd`, `${root} ${kind}`, `${root} & Co ${kind}`, `${root} ${kind} Group`]),
    phone: () =>
      `${pick(["+44 20", "+44 161", "+353 1", "+44 131", "+44 117", "+44 113", "+44 121", "+353 21", "+44 7700"])} ${int(100, 999)} ${int(1000, 9999)}`,
  },
  it: {
    weight: 3,
    cities: ["Milano", "Torino", "Bologna", "Roma"],
    male: ["Marco", "Luca", "Matteo", "Andrea", "Giovanni", "Alessandro", "Davide", "Stefano"],
    female: ["Giulia", "Chiara", "Francesca", "Sara", "Valentina", "Elena", "Silvia", "Martina"],
    last: "Rossi|Russo|Bianchi|Romano|Colombo|Ricci|Marino|Greco|Bruno|Gallo|Conti|De Luca|Costa|Fontana|Moretti|Barbieri|Lombardi|Esposito".split(
      "|",
    ),
    titles: ["Amministratore Delegato", "Responsabile Commerciale", "CFO", "Responsabile IT", "Project Manager"],
    roots: ["Aurora", "Stella", "Lago", "Monte", "Fiume", "Vela", "Torre", "Ponte", "Sole", "Luce"],
    kinds: [
      ["Logistica", "LOGISTICS_AND_SUPPLY_CHAIN"],
      ["Costruzioni", "CONSTRUCTION"],
      ["Arredo", "FURNITURE"],
      ["Software", "COMPUTER_SOFTWARE"],
      ["Hotel", "HOSPITALITY"],
      ["Commercio", "RETAIL"],
    ],
    company: (root, kind) => pick([`${root} ${kind} Srl`, `${kind} ${root} SpA`, `Gruppo ${root}`]),
    phone: () => `+39 ${pick(["02", "011", "051", "06"])} ${int(1000, 9999)} ${int(100, 9999)}`,
  },
}

export const PRODUCTS = {
  ru: "бот поддержки клиентов|распознавание документов|голосовой ассистент|чат-бот для записи|аналитика звонков|ИИ-ассистент для менеджеров|автоматизация КП|бот для HR|прогноз спроса|база знаний с поиском|контроль качества звонков|обработка входящих заявок|интеграция с 1С|бот для склада|генерация описаний товаров|суммаризация встреч|ассистент для юристов|скоринг лидов|мониторинг отзывов|автоответы в мессенджерах|пилот|поддержка и развитие|обучение команды".split(
    "|",
  ),
  es: "chatbot de reservas|asistente de atención al cliente|análisis de llamadas|lectura de facturas|lead scoring|asistente para comerciales|bot de WhatsApp|previsión de demanda|base de conocimiento|automatización de presupuestos|asistente de RR. HH.|piloto|soporte anual|formación del equipo".split(
    "|",
  ),
  de: "Dokumentenerkennung|Kundenservice-Bot|Sprachassistent|Anrufanalyse|Angebotsautomatisierung|Wissensdatenbank|Lead-Scoring|Bedarfsprognose|Ticket-Klassifizierung|Pilotprojekt|Wartungsvertrag|Schulung|Lieferschein-Erkennung|Disposition Assistent".split(
    "|",
  ),
  en: "support chatbot|document extraction|voice assistant|call analytics|lead scoring|sales copilot|knowledge base search|demand forecast|quote automation|ticket triage|pilot|support contract|team training|meeting summaries".split(
    "|",
  ),
  it: ["chatbot assistenza", "estrazione documenti", "configuratore AI", "assistente vendite", "pilota"],
}

export const STAGES = [
  ["Discovery Call", 15],
  ["Needs Assessment", 12],
  ["Solution Design", 10],
  ["Proposal Sent", 12],
  ["Negotiation", 8],
  ["Closed Won", 25],
  ["Closed Lost", 18],
]
export const LOST = {
  ru: "Нет бюджета до следующего года|Выбрали внутреннюю разработку|Проект заморожен после смены руководства|Не прошли службу безопасности|Пропал контакт, не отвечают|Решили отложить цифровизацию".split(
    "|",
  ),
  es: ["Sin presupuesto este año", "Lo harán con su equipo interno", "Proyecto congelado", "No respondieron más"],
  de: ["Kein Budget im laufenden Jahr", "Interne Lösung bevorzugt", "Datenschutz hat abgelehnt", "Projekt gestoppt"],
  en: ["No budget this year", "Built it in-house", "Project put on hold", "Went silent after the demo"],
  it: ["Nessun budget quest'anno", "Progetto sospeso"],
}

// Note sentences by language. {p} a person of the client, {q} a colleague of ours, {n} a number, {d} a date, {s} a
// system, {c} a channel, {k} a sum. None of them speaks of our delays, a rival's lower price, a discount for paying
// ahead, a language the bot must speak, or cold rooms: those are what the needles say.
export const SENTENCES = {
  ru: "Созвонились с {p}, разговор минут на сорок.|{p} показал, как сейчас идут заявки: всё вручную через {s}.|Операторы отвечают в {c}, в пиковые дни очередь до {n} обращений.|Хотят начать с пилота на одном отделе.|Бюджет согласует финдиректор, {p} сам не решает.|Попросили прислать пример договора и NDA.|Сроки пилота согласовали: шесть недель с момента доступа к данным.|Интеграция с {s} нужна обязательно.|Данные должны храниться в России, облако за рубежом не подходит.|{q} подготовит демо на их выгрузке.|Спрашивали про точность распознавания, назвали им {n}% на похожем проекте.|Отправил КП на {k}.|{p} в отпуске до {d}, вопросы через заместителя.|Есть внутренний ИТ-отдел, они хотят видеть API.|Цена в целом устраивает, обсуждают порядок оплаты по этапам.|Нужен отчёт для руководства раз в неделю.|У них сезонность: осенью нагрузка на поддержку выше в два раза.|Договорились созвониться {d}.|Служба безопасности просит анкету по ИБ, отправим на этой неделе.|{p} просил без англицизмов в интерфейсе.|Тестовый доступ выдали, первые результаты нормальные.|По юридической части вопросов нет.|Обсудили роли: {p} отвечает за внедрение, {q} — за обучение.|Хотят видеть дашборд по обращениям.|Сейчас у них около {n} сотрудников на линии.|Предложили начать с FAQ-бота, потом расширять.|Отдельно спросили про обучение персонала, это в КП не входит.|Акт по первому этапу подписан.|{p} переслал письмо от коллег с замечаниями по сценариям, в целом мелочи.|Решение будет после совета директоров.|Им важно, чтобы бот передавал диалог живому оператору без потери истории.|Подтвердили бюджет на квартал.|Ждём от них выгрузку за последние {n} месяцев.|Попросили добавить в отчёт разбивку по филиалам.|Сроки сдачи отчётности у них в конце месяца, в эти дни не беспокоить.|Внутри спорят, нужен ли голосовой канал.".split(
    "|",
  ),
  en: "Had a call with {p}, about half an hour.|{p} walked us through their current process, mostly manual in {s}.|Their support team answers in {c}; on busy days the queue reaches {n} requests.|They want a pilot in one team first.|Budget sits with the CFO, {p} cannot sign alone.|Asked for our standard MSA and an NDA.|Pilot timeline agreed: six weeks from data access.|Integration with {s} is a must.|Data has to stay in the EU.|{q} will prepare a demo on their export.|They asked about accuracy; we quoted {n}% from a similar project.|Sent the proposal at {k}.|{p} is on holiday until {d}; questions go to the deputy.|Their IT team wants to see the API docs first.|Price is broadly fine, they are discussing milestone payments.|Management wants a weekly report.|Seasonal peak in December, support volume roughly doubles.|Agreed to talk again on {d}.|Security sent a vendor questionnaire, due this week.|Test access is live, first results look reasonable.|No open legal points.|Roles: {p} owns the rollout, {q} runs the training.|They want a dashboard of topics.|About {n} agents on the phones right now.|Suggested starting with an FAQ bot and growing from there.|They asked about staff training, which is not in the proposal.|Phase one sign-off received.|{p} forwarded comments from the team on the dialogue flows, minor stuff.|Decision after the board meeting.|Handover to a human agent must keep the conversation history.|Budget for the quarter confirmed.|Waiting for {n} months of historical data from them.|They want the report split by branch.|Month-end close is their busy week, avoid meetings then.|Internally they disagree on whether voice is needed.".split(
    "|",
  ),
  es: "Llamada con {p}, unos cuarenta minutos.|{p} nos enseñó cómo trabajan ahora: casi todo a mano en {s}.|Atienden por {c}; en días fuertes tienen hasta {n} consultas en cola.|Quieren empezar con un piloto.|El presupuesto lo aprueba el director financiero.|Pidieron un modelo de contrato y un NDA.|Plazos del piloto acordados: seis semanas desde el acceso a los datos.|La integración con {s} es obligatoria.|Los datos tienen que quedarse en la UE.|{q} preparará una demo con su exportación.|Preguntaron por la precisión; les dimos un {n}% de un proyecto parecido.|Enviada la propuesta por {k}.|{p} está de vacaciones hasta el {d}.|Su equipo de IT quiere ver la documentación de la API.|El precio les encaja, ahora hablan de pagos por hitos.|Dirección quiere un informe semanal.|En verano el volumen de atención se duplica.|Quedamos en hablar el {d}.|Sin temas legales pendientes.|Ya tienen acceso de prueba y los primeros resultados son razonables.|Quieren un panel con los motivos de contacto.|Ahora tienen unas {n} personas en atención.|Propusimos empezar con un bot de preguntas frecuentes.|Preguntaron por formación para el equipo, no está en la propuesta.|Firmada el acta de la primera fase.|La decisión será después del consejo.|El paso a un agente humano tiene que conservar el historial.".split(
    "|",
  ),
  de: "Telefonat mit {p}, etwa vierzig Minuten.|{p} hat uns den aktuellen Ablauf gezeigt, fast alles manuell in {s}.|Der Kundenservice antwortet über {c}, an starken Tagen bis zu {n} Anfragen in der Warteschlange.|Sie wollen mit einem Pilot in einer Abteilung starten.|Das Budget gibt der CFO frei.|Bitte um Mustervertrag und NDA.|Pilotzeitraum vereinbart: sechs Wochen ab Datenzugang.|Anbindung an {s} ist Pflicht.|Die Daten müssen in der EU bleiben, Betriebsrat will informiert werden.|{q} bereitet eine Demo auf ihrem Export vor.|Frage nach der Genauigkeit, wir nannten {n}% aus einem Projekt.|Angebot über {k} verschickt.|{p} ist bis {d} im Urlaub.|Ihre IT will zuerst die API-Doku sehen.|Preis passt grundsätzlich, sie besprechen Zahlung nach Meilensteinen.|Die Geschäftsführung will Wochenberichte.|Wir sprechen am {d} wieder.|Keine offenen rechtlichen Punkte.|Testzugang ist aktiv, erste Ergebnisse okay.|Sie wünschen ein Dashboard nach Themen.|Aktuell etwa {n} Leute im Service.|Abnahme der ersten Phase liegt vor.|Übergabe an einen Mitarbeiter muss den Verlauf behalten.|Entscheidung nach der Gesellschafterversammlung.".split(
    "|",
  ),
}
SENTENCES.it = SENTENCES.en
export const SYSTEMS = [
  "1С",
  "Bitrix24",
  "amoCRM",
  "SAP",
  "Excel",
  "Google Sheets",
  "Zendesk",
  "Odoo",
  "Salesforce",
  "Microsoft Dynamics",
  "МойСклад",
  "DATEV",
  "Holded",
  "Freshdesk",
]
export const CHANNELS = ["WhatsApp", "Telegram", "e-mail", "телефон", "чат на сайте", "Instagram", "VK"]
export const OPENERS = {
  ru: ["", "", "", "Коротко по звонку:\n", "Итоги встречи\n", "upd: ", "Для себя: "],
  en: ["", "", "", "Quick recap:\n", "Notes from the call\n", "upd: ", "FYI "],
  es: ["", "", "", "Resumen de la llamada:\n", "Notas\n"],
  de: ["", "", "", "Kurz zum Termin:\n", "Notizen\n"],
}
OPENERS.it = OPENERS.en
export const TAILS = {
  ru: ["", "", "", "\n\n--\nОтправлено с iPhone", "\nСледующий шаг: созвон.", "\n(записал по памяти, уточнить)"],
  en: ["", "", "", "\n\nSent from my phone", "\nNext step: follow-up call.", "\n(from memory, double-check)"],
  es: ["", "", "", "\n\nEnviado desde el móvil", "\nSiguiente paso: llamada."],
  de: ["", "", "", "\n\nVon unterwegs gesendet", "\nNächster Schritt: Rückruf."],
}
TAILS.it = TAILS.en
export const OURS = ["Аня", "Дима", "Олег", "Marta", "Tom", "Кирилл", "Лера"]

export const TASKS = {
  ru: "Отправить КП {co}|Перезвонить {p}|Подготовить демо для {co}|Выслать договор {co}|Запросить выгрузку данных у {p}|Заполнить анкету ИБ для {co}|Назначить встречу с {p}|Проверить оплату счёта {co}|Собрать требования {co}|Отправить отчёт по пилоту {p}|Уточнить у {p} состав участников|Обновить презентацию для {co}".split(
    "|",
  ),
  en: "Send proposal to {co}|Call back {p}|Prepare demo for {co}|Send contract to {co}|Ask {p} for the data export|Fill in the security questionnaire for {co}|Book a meeting with {p}|Check invoice payment from {co}|Collect requirements from {co}|Send pilot report to {p}".split(
    "|",
  ),
  es: "Enviar propuesta a {co}|Llamar a {p}|Preparar demo para {co}|Enviar contrato a {co}|Pedir a {p} la exportación de datos|Agendar reunión con {p}".split(
    "|",
  ),
  de: "Angebot an {co} senden|{p} zurückrufen|Demo für {co} vorbereiten|Vertrag an {co} schicken|Datenexport bei {p} anfragen|Termin mit {p} vereinbaren".split(
    "|",
  ),
}
TASKS.it = TASKS.en
export const CALLS = {
  ru: [
    ["Звонок {p}", "Обсудили статус пилота, вопросов нет. Ждут отчёт к {d}."],
    ["Созвон с {p}", "Уточнили интеграцию с {s}, нужен тестовый стенд."],
    ["Звонок по КП", "{p} получил КП, смотрит с финдиректором, вернётся до {d}."],
    ["Входящий от {p}", "Спрашивал про обучение операторов и стоимость поддержки."],
  ],
  en: [
    ["Call with {p}", "Pilot status, no blockers. They expect the report by {d}."],
    ["Call: {p}", "Clarified the {s} integration, they need a sandbox."],
    ["Proposal call", "{p} has the proposal and is reviewing it with finance, back by {d}."],
    ["Inbound call from {p}", "Asked about agent training and the price of support."],
  ],
  es: [
    ["Llamada con {p}", "Estado del piloto, sin bloqueos. Esperan el informe para el {d}."],
    ["Llamada propuesta", "{p} revisa la propuesta con finanzas, responde antes del {d}."],
  ],
  de: [
    ["Telefonat {p}", "Pilotstatus, keine Blocker. Bericht bis {d} erwartet."],
    ["Rückruf {p}", "Frage zur {s}-Anbindung, sie brauchen eine Testumgebung."],
  ],
}
CALLS.it = CALLS.en
export const MEETINGS = {
  ru: [
    ["Демо для {co}", "Показали сценарии, {p} попросил добавить отчёт по филиалам."],
    ["{co}: встреча по пилоту", "Итоги пилота, обсудили масштабирование."],
    ["Встреча с {p}", "Знакомство, собрали требования."],
  ],
  en: [
    ["Demo for {co}", "Walked through the flows; {p} asked for a branch report."],
    ["{co}: pilot review", "Pilot results, talked about scaling up."],
    ["Intro with {p}", "First meeting, requirements."],
  ],
  es: [
    ["Demo para {co}", "Repasamos los flujos; {p} pidió un informe por sede."],
    ["{co}: revisión del piloto", "Resultados del piloto."],
  ],
  de: [
    ["Demo für {co}", "Abläufe gezeigt; {p} wünscht einen Bericht je Standort."],
    ["{co}: Pilot-Review", "Ergebnisse des Pilots."],
  ],
}
MEETINGS.it = MEETINGS.en

export const noteLang = (locale) =>
  locale === "de"
    ? chance(0.5)
      ? "de"
      : "en"
    : locale === "es"
      ? chance(0.6)
        ? "es"
        : "en"
      : locale === "it"
        ? "en"
        : locale
export const fill = (text, ctx) =>
  text
    .replaceAll("{p}", ctx.person)
    .replaceAll("{q}", pick(OURS))
    .replaceAll("{n}", String(pick([3, 5, 12, 18, 25, 40, 60, 85, 120, 300])))
    .replaceAll("{d}", dmy(new Date(Date.parse(ctx.at) + int(3, 30) * DAY)))
    .replaceAll("{s}", pick(SYSTEMS))
    .replaceAll("{c}", pick(CHANNELS))
    .replaceAll("{k}", `${int(4, 90) * 500}`)
    .replaceAll("{co}", ctx.company ?? "")
export const typo = (text) => {
  if (!chance(0.25)) return text
  const i = int(10, Math.max(11, text.length - 10))
  return text.slice(0, i) + text[i + 1] + text[i] + text.slice(i + 2)
}
export const noteBody = (lang, ctx) => {
  const pool = SENTENCES[lang]
  const count = weighted([
    [2, 2],
    [3, 4],
    [4, 4],
    [5, 3],
    [7, 2],
    [9, 1],
  ])
  const used = new Set()
  const parts = []
  while (parts.length < count) {
    const i = Math.floor(rng() * pool.length)
    if (used.has(i)) continue
    used.add(i)
    parts.push(fill(pool[i], ctx))
  }
  const middle = chance(0.2) ? parts.map((p) => `- ${p}`).join("\n") : parts.join(chance(0.3) ? "\n" : " ")
  return typo(`${pick(OPENERS[lang])}${middle}${pick(TAILS[lang])}`)
}
