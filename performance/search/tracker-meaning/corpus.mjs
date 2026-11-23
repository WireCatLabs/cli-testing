// The synthetic tracker workspace: hand-written targets with a look-alike each, and seeded filler around them.
// Nothing here is real data. buildCorpus({ items, seed }) gives tracker rows for fakeTrackerSource and chat messages.

const DAY = 86_400_000
const START = Date.parse("2026-06-01T09:00:00Z")

export const TARGETS = [
  {
    id: "T01",
    kind: "issue",
    title: "Export to CSV drops leading zeros in phone numbers",
    description:
      "When a customer list is exported, numbers like 0612345678 become 612345678 because the column is written as a number.",
    alike: {
      title: "Import from CSV adds leading zeros to order numbers",
      description: "Order 42 shows up as 00042 after the supplier file is imported.",
    },
  },
  {
    id: "T02",
    kind: "issue",
    title: "Счёт не отправляется клиенту после оплаты",
    description: "После успешной оплаты письмо со счётом не уходит, в логах ошибка SMTP 535.",
    alike: {
      title: "Клиенту отправляются два счёта после оплаты",
      description: "Дубликат письма со счётом из-за повторного вебхука от банка.",
    },
  },
  {
    id: "T03",
    kind: "issue",
    title: "Dark mode toggle resets after app restart",
    description: null,
    alike: { title: "Dark mode colors unreadable in charts", description: "Axis labels are dark grey on black." },
  },
  {
    id: "T04",
    kind: "issue",
    title: "Поиск не находит документы с буквой ё",
    description: "Запрос «ёлка» не находит «Ёлка в офисе», а запрос «елка» находит.",
    alike: {
      title: "Поиск медленно работает на документах больше 10 МБ",
      description: "Первый результат появляется через восемь секунд.",
    },
  },
  {
    id: "T05",
    kind: "issue",
    title: "Password reset link expires too quickly",
    description: "Users on slow email providers receive the link after the 10-minute window has passed.",
    alike: {
      title: "Password reset email not sent to Outlook addresses",
      description: "Outlook and Hotmail recipients never get the message.",
    },
  },
  {
    id: "T06",
    kind: "issue",
    title: "Upload of large videos stalls at 99 percent",
    description: "Files over 2 GB never finish; the final chunk request times out behind the proxy.",
    alike: {
      title: "Upload of large images is slow on mobile",
      description: "Photos from the camera take a minute each.",
    },
  },
  {
    id: "T07",
    kind: "issue",
    title: "Уведомления приходят с опозданием на час",
    description: "Пуш-уведомления на iOS приходят через 60 минут после события, часовой пояс сервера UTC.",
    alike: {
      title: "Уведомления приходят дважды на Android",
      description: "Каждое событие присылает два одинаковых пуша.",
    },
  },
  {
    id: "T08",
    kind: "issue",
    title: "Calendar invites show wrong timezone for Lisbon",
    description: "Events created in WET are displayed one hour early for attendees in Europe/Lisbon.",
    alike: {
      title: "Calendar invites missing location for Lisbon office",
      description: "The room address is empty in the invite.",
    },
  },
  {
    id: "T09",
    kind: "issue",
    title: "Отчёт по продажам считает возвраты как выручку",
    description: "В квартальном отчёте возвраты прибавляются к выручке вместо вычитания.",
    alike: { title: "Отчёт по продажам не учитывает скидки", description: "Сумма скидок не видна в итоговой строке." },
  },
  {
    id: "T10",
    kind: "issue",
    title: "Two-factor codes rejected after phone clock drift",
    description: "TOTP codes fail when the device clock is more than 30 seconds off.",
    alike: {
      title: "Two-factor setup QR code does not render",
      description: "The QR image is a broken icon in Safari.",
    },
  },
  {
    id: "T11",
    kind: "issue",
    title: "Billing page crashes when coupon field is empty",
    description: null,
    alike: { title: "Billing page shows the coupon twice", description: null },
  },
  {
    id: "T12",
    kind: "issue",
    title: "Не сохраняется аватар пользователя в профиле",
    description: null,
    alike: { title: "Аватар пользователя размыт в чате", description: null },
  },
  {
    id: "T13",
    kind: "issue",
    title: "Search results ignore the archived filter",
    description: "With hide archived turned on, archived projects still appear in the results.",
    alike: {
      title: "Search results slow when the archived filter is on",
      description: "Turning the filter on adds two seconds.",
    },
  },
  {
    id: "T14",
    kind: "issue",
    title: "Синхронизация с Google Drive удаляет локальные файлы",
    description: "После переименования папки в Drive локальные копии удаляются вместо перемещения.",
    alike: {
      title: "Синхронизация с Google Drive дублирует локальные файлы",
      description: "Каждый файл появляется дважды с суффиксом (1).",
    },
  },
  {
    id: "T15",
    kind: "issue",
    title: "Webhook retries flood the partner endpoint",
    description: "A failed delivery is retried every second without backoff, 3,600 calls an hour.",
    alike: {
      title: "Webhook signature missing on partner endpoint",
      description: "The partner cannot verify the sender.",
    },
  },
  {
    id: "T16",
    kind: "issue",
    title: "Keyboard shortcuts stop working in the editor after paste",
    description: null,
    alike: { title: "Keyboard shortcuts list is missing from the help page", description: null },
  },
  {
    id: "T17",
    kind: "issue",
    title: "Мобильное приложение разряжает батарею в фоне",
    description: "Геолокация остаётся включённой после закрытия карты, расход 20% в час.",
    alike: {
      title: "Мобильное приложение падает при низком заряде батареи",
      description: "При заряде ниже 5% экран гаснет и приложение закрывается.",
    },
  },
  {
    id: "T18",
    kind: "issue",
    title: "Onboarding checklist counts skipped steps as done",
    description: "Skipping invite teammates marks the checklist 100% complete.",
    alike: { title: "Onboarding checklist hidden on small screens", description: "Below 360 px the panel is cut off." },
  },
  {
    id: "C01",
    kind: "comment",
    issue: { title: "Checkout fails on Safari", description: "The payment button does nothing on Safari 17." },
    body: "Root cause: the session cookie is dropped after the 3-D Secure redirect because SameSite=Strict.",
    alike: {
      issue: { title: "Cookie banner covers the footer", description: null },
      body: "The cookie banner overlaps the payment button on Firefox.",
    },
  },
  {
    id: "C02",
    kind: "comment",
    issue: { title: "Импорт контактов зависает", description: "Импорт из CSV на 50 тысяч строк не завершается." },
    body: "Причина в кодировке: файл в Windows-1251, парсер ждёт UTF-8 и застревает на первой кириллической строке.",
    alike: {
      issue: { title: "Рассылка приходит с вопросами вместо букв", description: null },
      body: "Кодировка писем в рассылке сломана, вместо кириллицы знаки вопроса.",
    },
  },
  {
    id: "C03",
    kind: "comment",
    issue: { title: "Dashboard loads slowly for large teams", description: null },
    body: "Profiling shows 400 separate queries for member avatars; batching them cut load time from 9s to 1.2s.",
    alike: {
      issue: { title: "Retina avatars", description: null },
      body: "Avatars for members look blurry on retina screens.",
    },
  },
  {
    id: "C04",
    kind: "comment",
    issue: { title: "Ошибка 502 при выгрузке отчёта", description: "Большие отчёты не скачиваются." },
    body: "Nginx обрывает соединение через 60 секунд, увеличили proxy_read_timeout до 300.",
    alike: {
      issue: { title: "Старые стили после релиза", description: null },
      body: "Nginx отдаёт старую версию статики после деплоя, нужно сбрасывать кэш.",
    },
  },
  {
    id: "C05",
    kind: "comment",
    issue: { title: "Emails land in spam for Gmail users", description: "Since Monday most receipts go to spam." },
    body: "DKIM was signing with the old selector; rotated the key and published the new DNS record.",
    alike: {
      issue: { title: "Status page unreachable", description: null },
      body: "The DNS record for the status page points to the old server.",
    },
  },
  {
    id: "C06",
    kind: "comment",
    issue: { title: "Дубли заказов в CRM", description: null },
    body: "Менеджеры жмут кнопку дважды, добавили блокировку на 5 секунд после первого клика.",
    alike: {
      issue: { title: "Выгрузка заказов в Excel", description: null },
      body: "Менеджеры просят кнопку экспорта заказов в Excel.",
    },
  },
  {
    id: "C07",
    kind: "comment",
    issue: { title: "Mobile app login loop on Android 14", description: null },
    body: "Happens only when battery saver is on; the token refresh job is killed in the background.",
    alike: {
      issue: { title: "Truncated warning on Android 14", description: null },
      body: "The battery saver warning text is cut off on Android 14.",
    },
  },
  {
    id: "C08",
    kind: "comment",
    issue: { title: "Перевод интерфейса на испанский", description: null },
    body: "Носитель языка проверил 340 строк, осталось согласовать термины для счетов и подписок.",
    alike: {
      issue: { title: "Озвучка обучающего видео", description: null },
      body: "Носитель языка нужен для озвучки обучающего видео.",
    },
  },
  {
    id: "P01",
    kind: "project",
    title: "Q3 Payments Migration",
    description: "Move all card processing from the legacy gateway to Stripe by September.",
    alike: { title: "Q3 Payroll Migration", description: "Move salary runs to the new HR system." },
  },
  {
    id: "P02",
    kind: "project",
    title: "Новый онбординг для клиентов",
    description: "Пошаговый мастер настройки, видеоуроки и чек-лист для первых 14 дней.",
    alike: { title: "Новый онбординг для сотрудников", description: "Доступы, ноутбук и наставник в первую неделю." },
  },
  {
    id: "P03",
    kind: "project",
    title: "Offline mode for field technicians",
    description: "Work orders, photos and signatures captured without network and synced later.",
    alike: { title: "Offline maps for delivery drivers", description: "Routes cached on the phone before the shift." },
  },
  {
    id: "P04",
    kind: "project",
    title: "Сокращение облачных расходов",
    description: "Перенести логи в холодное хранилище и выключать тестовые стенды на ночь.",
    alike: { title: "Сокращение расходов на рекламу", description: "Отключить кампании с низкой конверсией." },
  },
]

const EN = {
  parts: [
    "export",
    "import",
    "search",
    "sync",
    "billing",
    "notifications",
    "calendar",
    "upload",
    "login",
    "dashboard",
    "reports",
    "webhooks",
    "editor",
    "onboarding",
    "mobile app",
    "profile page",
    "settings",
    "checkout",
    "invoices",
    "permissions",
  ],
  problems: [
    "is slow for large accounts",
    "shows an error after the update",
    "fails on Firefox",
    "times out behind the proxy",
    "loses changes after restart",
    "renders incorrectly on small screens",
    "needs a loading indicator",
    "should support bulk actions",
    "logs too much noise",
    "uses the wrong translation",
    "ignores the selected filter",
    "breaks for accounts with two-factor",
    "sends duplicate emails",
    "shows the wrong date format",
  ],
  sentences: [
    "Reported by a customer on the enterprise plan.",
    "Steps: open the {part}, change any field, save.",
    "Expected the change to stay, got the old value back.",
    "Happens about once in ten tries.",
    "Started after the last release.",
    "Only affects accounts created before March.",
    "Logs show a timeout on the background worker.",
    "Workaround: reload the page twice.",
    "The {part} team owns this area.",
    "Support has three tickets about it.",
  ],
  comments: [
    "Reproduced on staging.",
    "Can't reproduce on Chrome, need more details.",
    "Fixed in the next release, please verify.",
    "Moved to the next sprint.",
    "The customer confirmed the workaround.",
    "Is this the same as the {part} ticket from last week?",
    "Added logs, will check tomorrow.",
    "Assigned to the {part} team.",
    "Raised priority, two more reports today.",
    "Closing as duplicate.",
  ],
  projects: ["{Part} revamp", "{Part} performance push", "{Part} reliability", "New {part} experience"],
}

const RU = {
  parts: [
    "экспорт",
    "импорт",
    "поиск",
    "синхронизация",
    "оплата",
    "уведомления",
    "календарь",
    "загрузка файлов",
    "вход",
    "панель",
    "отчёты",
    "вебхуки",
    "редактор",
    "онбординг",
    "мобильное приложение",
    "профиль",
    "настройки",
    "корзина",
    "счета",
    "права доступа",
  ],
  problems: [
    "медленно работает на больших аккаунтах",
    "показывает ошибку после обновления",
    "не работает в Firefox",
    "падает по таймауту за прокси",
    "теряет изменения после перезапуска",
    "криво отображается на маленьких экранах",
    "нужен индикатор загрузки",
    "нужны массовые действия",
    "пишет слишком много логов",
    "использует неправильный перевод",
    "игнорирует выбранный фильтр",
    "ломается у аккаунтов с двухфакторной защитой",
    "отправляет письма дважды",
    "показывает дату в неверном формате",
  ],
  sentences: [
    "Сообщил клиент на корпоративном тарифе.",
    "Шаги: открыть {part}, изменить любое поле, сохранить.",
    "Ожидали, что изменение сохранится, а вернулось старое значение.",
    "Происходит примерно раз из десяти.",
    "Началось после последнего релиза.",
    "Затрагивает только аккаунты, созданные до марта.",
    "В логах таймаут фонового обработчика.",
    "Обходной путь: дважды обновить страницу.",
    "За эту часть отвечает команда {part}.",
    "В поддержке три обращения об этом.",
  ],
  comments: [
    "Воспроизвёл на стейдже.",
    "Не воспроизводится в Chrome, нужно больше деталей.",
    "Исправлено в следующем релизе, проверьте.",
    "Перенёс в следующий спринт.",
    "Клиент подтвердил обходной путь.",
    "Это то же самое, что задача про {part} на прошлой неделе?",
    "Добавил логи, посмотрю завтра.",
    "Назначил на команду {part}.",
    "Поднял приоритет, сегодня ещё два обращения.",
    "Закрываю как дубликат.",
  ],
  projects: ["Обновление: {part}", "Ускорение: {part}", "Надёжность: {part}", "Новый {part}"],
}

export const SHORT_COMMENTS = ["LGTM", "+1", "👍", "Thanks!", "ok", "Done", "Спасибо", "ок", "Готово", "+1, тоже вижу"]

const rng = (seed) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const capital = (text) => text[0].toUpperCase() + text.slice(1)

// items counts issues, projects and comments of one workspace; each account holds the whole workspace.
export const buildCorpus = ({ items = 1000, seed = 20261123, shortShare = 0.2, emptyShare = 0.3 } = {}) => {
  const random = rng(seed)
  const pick = (list) => list[Math.floor(random() * list.length)]
  const teams = [
    { externalId: "team-eng", name: "Engineering", key: "ENG" },
    { externalId: "team-ops", name: "Операции", key: "OPS" },
  ]
  const users = ["Alice Example", "Bob Example", "Вера Пример", "Глеб Пример"].map((name, n) => ({
    externalId: `user-${n + 1}`,
    name,
    email: `user${n + 1}@example.com`,
    active: true,
  }))
  const states = ["backlog", "unstarted", "started", "completed", "canceled"].map((type, n) => ({
    externalId: `state-${type}`,
    name: capital(type),
    type,
    team: "team-eng",
    position: n,
  }))
  const projects = []
  const issues = []
  const comments = []
  const at = (n) => START + n * 3_600_000
  let counter = 0
  const next = () => ++counter
  const keyOf = (team, n) => `${team === "team-ops" ? "OPS" : "ENG"}-${n}`
  const issue = (title, description, extra = {}) => {
    const n = next()
    const team = random() < 0.5 ? "team-eng" : "team-ops"
    const row = {
      externalId: `issue-${n}`,
      key: keyOf(team, n),
      title,
      description,
      team,
      state: pick(states).externalId,
      assignee: pick(users).externalId,
      creator: pick(users).externalId,
      priority: Math.floor(random() * 5),
      createdAt: at(n),
      updatedAt: at(n) + DAY,
      ...extra,
    }
    issues.push(row)
    return row
  }
  const comment = (issueRow, body) => {
    const n = next()
    const row = {
      externalId: `comment-${n}`,
      issue: issueRow.externalId,
      body,
      author: pick(users).externalId,
      createdAt: at(n),
      updatedAt: at(n),
    }
    comments.push(row)
    return row
  }
  const project = (name, description) => {
    const n = next()
    const row = {
      externalId: `project-${n}`,
      name,
      description,
      status: "started",
      lead: pick(users).externalId,
      teams: ["team-eng"],
      createdAt: at(n),
      updatedAt: at(n) + DAY,
    }
    projects.push(row)
    return row
  }

  const answers = {}
  const alikes = {}
  for (const target of TARGETS) {
    if (target.kind === "issue") {
      answers[target.id] = { kind: "issue", externalId: issue(target.title, target.description).externalId }
      alikes[target.id] = issue(target.alike.title, target.alike.description).externalId
    } else if (target.kind === "project") {
      answers[target.id] = { kind: "project", externalId: project(target.title, target.description).externalId }
      alikes[target.id] = project(target.alike.title, target.alike.description).externalId
    } else {
      const parent = issue(target.issue.title, target.issue.description)
      comment(parent, pick(SHORT_COMMENTS))
      answers[target.id] = { kind: "comment", externalId: comment(parent, target.body).externalId, issue: parent }
      const other = issue(target.alike.issue.title, target.alike.issue.description)
      alikes[target.id] = comment(other, target.alike.body).externalId
    }
  }

  const filled = () => issues.length + projects.length + comments.length
  while (filled() < items) {
    const lang = random() < 0.5 ? EN : RU
    const part = pick(lang.parts)
    if (random() < 0.03) {
      project(capital(pick(lang.projects).replace("{part}", part).replace("{Part}", capital(part))), lang.sentences[0])
      continue
    }
    const sentences = Array.from({ length: 1 + Math.floor(random() * 3) }, () => pick(lang.sentences))
    const description = random() < emptyShare ? null : sentences.join(" ").replaceAll("{part}", part)
    const row = issue(capital(`${part} ${pick(lang.problems)}`), description)
    const count = Math.floor(random() * 4)
    for (let c = 0; c < count && filled() < items; c++)
      comment(row, random() < shortShare ? pick(SHORT_COMMENTS) : pick(lang.comments).replaceAll("{part}", part))
  }

  // Chat messages on the same topics, so a full search all has other lanes competing for the page.
  const messages = Array.from({ length: Math.round(items / 2) }, (_, n) => {
    const lang = random() < 0.5 ? EN : RU
    const part = pick(lang.parts)
    return {
      id: String(n + 1),
      text: `${capital(part)} ${pick(lang.problems)}. ${pick(lang.comments).replaceAll("{part}", part)}`,
      timestamp: new Date(at(n)).toISOString(),
    }
  })

  return {
    rows: { team: teams, user: users, state: states, label: [], project: projects, issue: issues, comment: comments },
    answers,
    alikes,
    messages,
  }
}

// The comment variant: a comment's body with its issue's key and title in front, as the embedding would read it.
export const prefixed = (rows) => {
  const issues = new Map(rows.issue.map((row) => [row.externalId, row]))
  return {
    ...rows,
    comment: rows.comment.map((row) => {
      const parent = issues.get(row.issue)
      return { ...row, body: `${parent.key} ${parent.title}\n\n${row.body}` }
    }),
  }
}
