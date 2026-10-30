import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from genlib import Project  # noqa: E402

p = Project("ferrocart", "Ferrum Supply B2B shop migration", ["Феррокарт", "новый шоп Феррум", "Atlas shop"])
MIG = p.source("fc-chat-migration", "chat", "shop-migration")
SALES = p.source("fc-chat-sales", "chat", "Vertrieb / продажи — новый шоп")
PLAN = p.source("fc-doc-plan", "document", "Migration plan: Magento 1 → Shopware 6")
KICK = p.source("fc-meet-0722", "meeting", "Planning workshop 22 Jul")
GONO = p.source("fc-meet-0924", "meeting", "Go/no-go 24 Sep")

PWD = "Nein — passwords are not migrated at all. Every customer gets an email with a reset link on cutover day."
ERP_COND = ("Да, живые цены из ERP включаем, но только если ERP-API выдержит нагрузочный тест на 50 запросов в секунду. "
            "Если нет — остаёмся на ночной выгрузке.")
TERMS_HEAD = ("Раздел «Условия оплаты» в плане — ок, пусть стоит как раздел. Но цифры в нём, 30 и 60 дней отсрочки, "
              "я не утверждал, это решает кредитный комитет.")
MOV_PLAN = "Mindestbestellwert / минимальная сумма заказа: 150 EUR netto."
MOV_SALES = "Клиентам говорим как раньше: минимальный заказ 100 евро без НДС, ниже — не принимаем."
CUT_OLD = "Then it's decided: cutover on the weekend of 26 and 27 September."
CUT_NEW = ("So it's a no-go for September. New cutover: the weekend of 17 and 18 October, "
           "same plan, and we freeze the catalogue from the 13th.")
ALGOLIA = "Берём Algolia для поиска, решено. Руслан, заводи аккаунт."
OPENSEARCH = ("Поиск реализуется на встроенном OpenSearch Shopware. Algolia рассматривался и отклонён: "
              "при нашем объёме запросов годовая стоимость выходит около 19 000 EUR.")
SHIP_OLD = "Okay, agreed: free shipping on orders over 500 EUR net, as on the old shop."
SHIP_NEW = ("Forget the free shipping over 500. Finance won't carry it on these margins. "
            "Shipping is charged on every order, flat 9.90 EUR per parcel, pallets on quote.")
REDIR_OLD = "По URL: все старые адреса товаров редиректим 1:1 на новые, 301, ни одного 404."
REDIR_NEW = ("По редиректам решение поменялось: 1:1 делаем только для топ-2000 товаров по органическому трафику, "
             "остальные старые адреса товаров ведут 301 на свою категорию.")
LEGACY_OLD = "Старый магазин оставляем в режиме только для чтения на 3 месяца после запуска, чтобы клиенты видели историю заказов."
LEGACY_NEW = ("Legal has checked it: we can switch the Magento site off completely at cutover. "
              "Order history is exported as PDFs into each customer account, so nobody needs the old site.")
KATJA_ATLAS = "Катя из Atlas Bau жалуется, что в бете не видит своих договорных цен, только прайс."
VAT = "Цены в шопе показываем без НДС, netto. Это B2B, все наши клиенты так считают."
VAT_KEEP = "Default stays net. We add a small toggle in the account for sole traders, that's all."
STOCK = "Stock levels come only from the ERP. The shop never writes stock back, it only reads."
STOCK_KEEP = "Нет, мастер остаётся ERP, как решили. Просто синк чаще — раз в 5 минут вместо 15."

p.chat(MIG, [
  ("fc-101", "Дмитрий", "07-15 08:30", "Коллеги, канал по миграции шопа. Цель — уйти с Magento 1 до конца года. Внутреннее название проекта Atlas."),
  ("fc-102", "Руслан", "07-15 08:41", "Наконец-то. M1 без патчей уже два года"),
  ("fc-103", "Katja", "07-15 09:02", "Hi! Katja, ERP & ops. I'll write mostly in English, my Russian is reading-only 🙂"),
  ("fc-104", "Дмитрий", "07-15 09:05", "No problem, Katja. Mixed is fine", "fc-103"),
  ("fc-105", "Anya", "07-16 10:00", "Сколько у нас товаров с нормальными описаниями? У меня ощущение, что половина — только артикул и размер"),
  ("fc-106", "Руслан", "07-16 10:20", "Половина — это оптимистично 😅", "fc-105"),
  ("fc-107", "Katja", "07-17 14:10", "Question for the plan: do we migrate customer passwords from Magento? The hashes are old MD5 with salt."),
  ("fc-108", "Руслан", "07-17 14:35", PWD + " MD5 we don't want in the new system.", "fc-107"),
  ("fc-109", "Katja", "07-17 14:36", "Good, that's what I hoped", "fc-108"),
  ("fc-110", "Дмитрий", "07-18 11:00", "Поиск: смотрели Algolia и встроенный в Shopware. Algolia сильно лучше по опечаткам, у нас артикулы типа M8x40-DIN933."),
  ("fc-111", "Руслан", "07-18 11:15", "Algolia лучше, но и платить за запросы. Посчитаю", "fc-110"),
  ("fc-112", "Дмитрий", "07-23 09:00", ALGOLIA),
  ("fc-113", "Руслан", "07-23 09:10", "Ок, завёл триал на 14 дней", "fc-112"),
  ("fc-114", "Paul", "07-24 16:00", "Hosting contract is signed, 3 years. Ruslan, credentials come from the provider directly to you."),
  ("fc-115", "Руслан", "07-24 16:05", "👍 получил", "fc-114"),
  ("fc-116", "Дмитрий", "07-28 10:00", REDIR_OLD),
  ("fc-117", "Anya", "07-28 10:05", "И для категорий тоже?", "fc-116"),
  ("fc-118", "Дмитрий", "07-28 10:07", "Категории тоже, их всего 340", "fc-117"),
  ("fc-119", "Katja", "08-04 13:00", "ERP API docs are in the shared folder. Warning: the price endpoint is slow, around 800 ms per customer."),
  ("fc-120", "Руслан", "08-04 13:30", "800 мс на клиента — это боль, если считать корзину онлайн", "fc-119"),
  ("fc-121", "Дмитрий", "08-05 09:20", "Руслан, так мы можем показывать живые цены из ERP, или только ночная выгрузка как сейчас?"),
  ("fc-122", "Руслан", "08-05 10:05", ERP_COND + " Тест сделаю на стейдже ERP в сентябре, Katja даст окно.", "fc-121"),
  ("fc-123", "Katja", "08-05 10:10", "Window: any weekday after 18:00", "fc-122"),
  ("fc-124", "Anya", "08-11 12:00", "кто-то брал отпуск на неделе 34? мне надо понять, кто проверит переводы на DE"),
  ("fc-125", "Дмитрий", "08-11 12:10", "я в отпуске 18–22, Katja на месте", "fc-124"),
  ("fc-126", "Руслан", "08-19 17:40", "Algolia: посчитал по логам поиска за год. Выходит дорого, напишу в плане"),
  ("fc-127", "Paul", "08-21 08:15", "Dmitry, I saw the plan draft. Two comments in the doc, one here: who is the new shop's 'payment terms' owner?"),
  ("fc-128", "Дмитрий", "08-21 08:40", "Пока я, но цифры должны быть твои, Paul", "fc-127"),
  ("fc-129", "Paul", "08-21 09:30", TERMS_HEAD, "fc-128"),
  ("fc-130", "Дмитрий", "08-21 09:35", "Понял, помечу в плане как черновик", "fc-129"),
  ("fc-131", "Katja", "08-26 15:00", "Stock sync: the ERP can push changes every 15 minutes. Is that enough?"),
  ("fc-132", "Руслан", "08-26 15:20", "Для начала да", "fc-131"),
  ("fc-133", "Руслан", "09-10 19:30", "Нагрузочный тест ERP-API: 50 rps держит, p95 610 мс. Можно включать живые цены, но с кэшем на 10 минут"),
  ("fc-134", "Katja", "09-10 19:45", "Nice! Didn't expect that 🎉", "fc-133"),
  ("fc-135", "Mehmet", "09-12 10:10", "Some of our big customers asked again for stock to be shown per warehouse. Does that change anything in the ERP logic?"),
  ("fc-136", "Дмитрий", "09-12 10:30", STOCK_KEEP, "fc-135"),
  ("fc-137", "Paul", "09-15 11:00", "On shipping — I've looked at the numbers for the last 12 months."),
  ("fc-138", "Paul", "09-15 11:02", SHIP_NEW),
  ("fc-139", "Mehmet", "09-15 11:20", "Customers will not love this. But ok, I'll tell the team", "fc-138"),
  ("fc-140", "Дмитрий", "09-15 11:25", "Anya, поправь текст на странице доставки", "fc-138"),
  ("fc-141", "Anya", "09-15 11:40", "сделаю", "fc-140"),
  ("fc-142", "Руслан", "09-25 08:00", "После go/no-go: стейдж оставляю как есть, прод-деплой перенесён. Каталог замораживаем с 13 октября"),
  ("fc-143", "Katja", "09-29 14:00", LEGACY_NEW + " Dmitry, can you confirm we drop the read-only plan?"),
  ("fc-144", "Дмитрий", "09-29 14:30", "Да, отказываемся, раз юристы ок. Меньше поддерживать", "fc-143"),
  ("fc-145", "Дмитрий", "10-03 18:00", f"""Статус Atlas, 3 октября

Готово:
— импорт каталога: 41 200 товаров, 97% с картинками; описания на DE — 68%, Anya дописывает топ-категории;
— клиенты и адреса перенесены на стейдж, письма для сброса пароля протестированы на 20 тестовых аккаунтах;
— живые цены из ERP работают с кэшем 10 минут, договорные цены видны после логина;
— PDF с историей заказов лежат в аккаунтах, проверили на выборке в 50 клиентов.

Открыто:
— OCI punchout для крупных клиентов — пока никто не взялся (см. сообщение Mehmet);
— тексты страницы доставки после решения Paul — Anya;
— Atlas Bau: Катя подтвердила, что договорные цены теперь видны.

Риски:
— если ERP упадёт в день переключения, корзина не посчитает цены; Руслан делает фоллбэк на ночной прайс.

{REDIR_NEW} Это решили с SEO-агентством: длинный хвост почти не приносит трафика, а ручной маппинг 39 000 адресов не окупается. Список топ-2000 у Руслана.

Даты: заморозка каталога 13.10, переключение 17–18.10, пароли сбрасываем 18.10 утром."""),
  ("fc-146", "Руслан", "10-03 18:20", "Список топ-2000 в таблице, вкладка «redirects-final»", "fc-145"),
  ("fc-147", "Katja", "10-14 09:00", "Catalogue freeze is live. Please no more product edits in Magento 🙏"),
  ("fc-148", "Anya", "10-14 09:05", "ой. я только что поменяла три описания", "fc-147"),
  ("fc-149", "Katja", "10-14 09:06", "😑 send me the SKUs", "fc-148"),
  ("fc-150", "Руслан", "10-18 07:45", "Переключение прошло. DNS обновился, письма со сбросом ушли 6 112 клиентам"),
  ("fc-151", "Дмитрий", "10-18 08:00", "Спасибо всем! Paul, шампанское за тобой 🍾", "fc-150"),
  ("fc-152", "Paul", "10-18 08:30", "Deal.", "fc-151"),
  ("fc-153", "Руслан", "10-18 12:10", "Сабж: в поддержку 140 тикетов за утро, 90% — «не пришло письмо». Проверяю спам-фильтры у крупных клиентов"),
  ("fc-154", "Katja", "10-18 12:30", "Kranwerk's mail server blocks our sender domain. I called their IT.", "fc-153"),
  ("fc-155", "Руслан", "10-19 10:00", "Мониторинг: p95 корзины 380 мс, ошибок 0,2%. ERP-фоллбэк ни разу не сработал"),
  ("fc-156", "Дмитрий", "10-19 10:20", "отлично. в понедельник ретро, 11:00", "fc-155"),
])

p.chat(SALES, [
  ("fc-201", "Mehmet", "07-20 10:00", "Hallo zusammen, привет. Здесь собираем всё, что спрашивают клиенты про новый шоп."),
  ("fc-202", "Olga S.", "07-20 10:15", "Первый вопрос уже есть: будут ли цены с НДС?"),
  ("fc-203", "Дмитрий", "07-20 10:40", VAT, "fc-202"),
  ("fc-204", "Olga S.", "07-20 10:42", "ок, спасибо", "fc-203"),
  ("fc-205", "Mehmet", "07-29 09:00", "Shipping: what do we tell customers? Today it's free over 500."),
  ("fc-206", "Дмитрий", "07-29 09:30", SHIP_OLD, "fc-205"),
  ("fc-207", "Mehmet", "08-06 13:00", """Idea for the new shop, please read before the plan is final:

Our 15 largest customers (Atlas Bau, Kranwerk, Hoffmann Industriebedarf etc.) order through their own procurement systems — SAP Ariba, Coupa. They want an OCI punchout catalogue: their buyer clicks in SAP, lands in our shop, fills the basket, and the basket goes back to SAP as a purchase requisition.

This is about 30% of our revenue. Shopware has plugins for OCI. I think we should build it in phase 1, not later. Who decides this?"""),
  ("fc-208", "Olga S.", "08-06 13:20", "+1, Kranwerk спрашивает каждый месяц", "fc-207"),
  ("fc-209", "Mehmet", "08-14 15:10", "Reminder about the punchout question above 👆"),
  ("fc-210", "Olga S.", "08-20 11:00", "Ещё вопрос от клиентов: какой минимальный заказ будет в новом шопе?"),
  ("fc-211", "Mehmet", "08-20 11:30", MOV_SALES, "fc-210"),
  ("fc-212", "Olga S.", "08-20 11:31", "👍", "fc-211"),
  ("fc-213", "Mehmet", "09-02 09:00", "Beta test with 10 customers started today. Feedback form is in the shared drive."),
  ("fc-214", "Mehmet", "09-05 16:00", KATJA_ATLAS + " Это блокер для них."),
  ("fc-215", "Руслан", "09-05 16:30", "Посмотрю, скорее всего маппинг групп клиентов", "fc-214"),
  ("fc-216", "Olga S.", "09-08 10:00", "Kranwerk: поиск по артикулу без дефисов не находит M8x40. Это поправят?"),
  ("fc-217", "Руслан", "09-08 10:30", "Да, синонимы для артикулов добавлю", "fc-216"),
  ("fc-218", "Mehmet", "09-09 12:00", "Katja from Atlas Bau again: prices fixed, thanks Ruslan! She now asks for a CSV upload for the basket."),
  ("fc-219", "Olga S.", "09-16 09:00", "Клиенты-ИП спрашивают, можно ли всё-таки видеть цены с НДС. Может, переключим по умолчанию?"),
  ("fc-220", "Дмитрий", "09-16 09:30", VAT_KEEP, "fc-219"),
  ("fc-221", "Olga S.", "09-16 09:31", "ок, так и передам", "fc-220"),
  ("fc-222", "Mehmet", "09-16 14:00", "Doing the sales training on Thursday. Slides: shipping, payment terms, minimum order. Please send me the final numbers."),
  ("fc-223", "Mehmet", "09-30 11:00", "Kunden fragen nach dem alten Shop — wie lange bleibt der online?"),
  ("fc-224", "Katja", "09-30 11:20", "It goes off at cutover. Order history will be in their new account as PDFs.", "fc-223"),
  ("fc-225", "Olga S.", "10-20 10:00", "Первые отзывы: поиск хвалят, на доставку ругаются 🙃"),
  ("fc-226", "Mehmet", "10-20 10:15", "as expected", "fc-225"),
  ("fc-227", "Olga S.", "10-20 10:40", "Hoffmann спрашивает, почему в счёте другой номер клиента. Это нормально?"),
  ("fc-228", "Katja", "10-20 11:05", "Yes, new customer numbers come from the ERP now. Old number is printed below it for 6 months.", "fc-227"),
  ("fc-229", "Olga S.", "10-21 09:00", "кто-нибудь знает, где лежат новые визитки? 😅 не по теме, сорри"),
  ("fc-230", "Mehmet", "10-21 09:10", "в шкафу у переговорки, верхняя полка", "fc-229"),
  ("fc-231", "Mehmet", "10-22 15:30", "Week 1 numbers: 1 870 orders in the new shop, 64% of customers already set a new password."),
  ("fc-232", "Olga S.", "10-22 15:45", "неплохо!", "fc-231"),
])

p.doc(PLAN, "Дмитрий", "08-28", [
  ("fc-301", ["1. Ziel / цель"], "Перенос B2B-магазина Ferrum Supply с Magento 1.9 на Shopware 6.5. Срок переключения — конец сентября 2026. Внутреннее название проекта — Atlas. Ответственный — Дмитрий Волков, техлид — Руслан."),
  ("fc-302", ["2. Scope"], "Входит: каталог (≈41 000 товаров), клиенты и адреса, договорные цены, история заказов за 5 лет, корзина, оформление заказа, оплата по счёту и картой. Не входит в фазу 1: мобильное приложение, маркетплейсы, интеграция с закупочными системами клиентов."),
  ("fc-303", ["3. Daten", "3.1 Kunden"], "Клиенты и адреса переносятся скриптом из Magento. Пароли не переносятся; в день переключения каждый клиент получает письмо со ссылкой для установки нового пароля. Группы клиентов сопоставляются с ценовыми группами ERP."),
  ("fc-304", ["3. Daten", "3.2 Produkte und Bestand"], f"{STOCK} ERP отдаёт изменения остатков каждые 15 минут. Цены: прайс — ночная выгрузка; договорные цены — из ERP по API, при условии успешного нагрузочного теста."),
  ("fc-305", ["4. Suche"], f"""Требования к поиску: поиск по артикулу с опечатками и без разделителей (M8x40 = M8 x 40 = M8-40), поиск по DIN/ISO, фасеты по материалу, классу прочности, покрытию, подсказки при вводе. Время ответа — до 200 мс.

Сравнивались два варианта: Algolia (SaaS) и встроенный в Shopware OpenSearch. По качеству на тестовом наборе из 300 реальных запросов Algolia дал 94% релевантных первых результатов, OpenSearch после настройки синонимов — 89%. Разница заметна в основном на опечатках в названиях, а не в артикулах.

Стоимость Algolia считали по логам поиска за 12 месяцев: около 2,1 млн поисковых запросов и 41 000 записей, с учётом подсказок при вводе каждый символ — отдельный запрос.

{OPENSEARCH} Синонимы для артикулов ведёт Anya в таблице, Руслан импортирует их раз в день. Вернуться к Algolia можно в 2027 году, если доля поисков без результата превысит 8%."""),
  ("fc-306", ["5. Preise und Konditionen", "5.1 Mindestbestellwert"], f"{MOV_PLAN} Заказы ниже этой суммы система не принимает; для ключевых клиентов порог отключается вручную."),
  ("fc-307", ["5. Preise und Konditionen", "5.2 Zahlungsbedingungen"], "Условия оплаты (черновик): новые клиенты — предоплата или карта; постоянные — отсрочка 30 дней; ключевые клиенты — 60 дней. Лимиты отсрочки берутся из ERP."),
  ("fc-308", ["5. Preise und Konditionen", "5.3 Versand"], "Доставка: бесплатно от 500 EUR netto, ниже — 9,90 EUR за посылку. Паллеты — по запросу. Срок отгрузки — 24 часа для товаров со склада Дуйсбург."),
  ("fc-309", ["6. URLs und SEO"], "Все URL товаров и категорий из Magento получают 301-редирект на соответствующие новые адреса. Таблица соответствия генерируется скриптом по артикулу. Sitemap отправляется в Search Console в день переключения."),
  ("fc-310", ["7. Altsystem"], "Magento после переключения переводится в режим только чтения на 3 месяца: вход для клиентов открыт, оформление заказов закрыто. Потом сервер выключается, база архивируется."),
  ("fc-311", ["8. Cutover"], "Переключение в выходные 26–27 сентября. Пятница 18:00 — заморозка заказов в Magento, финальная выгрузка, суббота — проверка, воскресенье — DNS. Откат: обратное переключение DNS до понедельника 6:00."),
  ("fc-312", ["9. Risiken"], "Медленный ERP-API; качество описаний товаров на DE; нагрузка на поддержку в первую неделю из-за сброса паролей; клиенты, привыкшие к старым URL в закладках."),
])

p.meet(KICK, "07-22", [
  ("fc-401", "Дмитрий", "10:00:00", "Доброе утро. Сегодня определяем рамки: даты, что берём, что нет. Paul, Katja, Руслан, Anya, Mehmet — все здесь."),
  ("fc-402", "Paul", "10:01:15", "From my side the main thing is the date. Magento support costs us money every month we stay."),
  ("fc-403", "Руслан", "10:02:40", "Реалистично — конец сентября. Каталог большой, но структура понятная."),
  ("fc-404", "Katja", "10:04:00", "Late September works for ops if we avoid the month-end closing. So not the 30th."),
  ("fc-405", "Дмитрий", "10:05:10", "Тогда последние выходные перед концом месяца: 26–27 сентября."),
  ("fc-406", "Paul", "10:05:50", CUT_OLD),
  ("fc-407", "Mehmet", "10:07:00", "Sales needs two weeks' notice to inform customers. So by mid-September the date must be final."),
  ("fc-408", "Katja", "10:08:30", STOCK + " I don't want two systems fighting over stock again."),
  ("fc-409", "Руслан", "10:09:10", "Согласен, только чтение."),
  ("fc-410", "Anya", "10:11:00", "А старый магазин? Клиенты часто смотрят там старые заказы, чтобы повторить."),
  ("fc-411", "Дмитрий", "10:12:20", LEGACY_OLD),
  ("fc-412", "Paul", "10:13:00", "Three months is fine, but not longer. Every month is hosting and risk."),
  ("fc-413", "Mehmet", "10:14:30", "And the big customers with SAP? We should talk about punchout at some point."),
  ("fc-414", "Дмитрий", "10:15:00", "Mehmet, напиши, пожалуйста, отдельно, что именно нужно."),
  ("fc-415", "Anya", "10:16:40", "Тексты: я беру описания для топ-категорий, остальное — после запуска."),
  ("fc-416", "Дмитрий", "10:18:00", "Хорошо. Итог: 26–27 сентября, ERP — мастер по остаткам, старый шоп 3 месяца в режиме чтения. Протокол пришлю."),
])

p.meet(GONO, "09-24", [
  ("fc-501", "Дмитрий", "16:00:00", "Go/no-go по переключению 26–27 сентября. Начнём с открытых багов."),
  ("fc-502", "Руслан", "16:01:30", "Критичных три: договорные цены у части групп клиентов, оплата по счёту для новых клиентов падает, и PDF истории заказов ещё не сгенерированы."),
  ("fc-503", "Katja", "16:03:10", "The PDFs alone take two days to generate for all customers. We can't do that by Saturday."),
  ("fc-504", "Mehmet", "16:04:00", "And I promised customers the date two weeks ago… They'll ask."),
  ("fc-505", "Paul", "16:05:20", "I'd rather move than go live with broken prices. Customers forgive a delay, not wrong invoices."),
  ("fc-506", "Дмитрий", "16:06:40", "Предлагаю 17–18 октября. Месяц-энд прошёл, у Руслана три недели на баги."),
  ("fc-507", "Katja", "16:07:30", "October 17 works for ERP."),
  ("fc-508", "Paul", "16:08:10", CUT_NEW),
  ("fc-509", "Mehmet", "16:09:00", "I'll send the customer email tomorrow morning."),
  ("fc-510", "Anya", "16:10:20", "А то, что доставка теперь платная — в том же письме?"),
  ("fc-511", "Mehmet", "16:11:00", "Нет, отдельно, не хочу два плохих новости в одном письме 😅"),
  ("fc-512", "Руслан", "16:12:30", "Ещё вопрос: хостинг. Прод-сервер уже оплачен с сентября, это ок?"),
  ("fc-513", "Paul", "16:13:10", "It's in the contract, nothing to do."),
  ("fc-514", "Дмитрий", "16:14:00", "Всё, спасибо. Новая дата 17–18 октября, протокол сегодня."),
])

p.q("q01", "en", "Are customer passwords migrated from Magento?", "negative", True,
    {"fc-108": 3, "fc-107": 2, "fc-303": 1}, [["fc-107", "fc-108"]],
    "Denial in the reply; the plan section repeats it.", spans=[("fc-108", PWD)])
p.q("q02", "ru", "Будут ли в новом шопе живые цены из ERP?", "conditional", True,
    {"fc-122": 3, "fc-121": 2, "fc-133": 1, "fc-304": 1}, [["fc-121", "fc-122"]],
    "Yes, if the ERP API passes a 50 rps load test.", spans=[("fc-122", ERP_COND)])
p.q("q03", "en", "Did Paul approve 60 days payment terms for key accounts?", "approval", True,
    {"fc-129": 3, "fc-307": 2, "fc-128": 2}, [["fc-129", "fc-307"]],
    "He approved the section as a section, not the 30/60 day numbers.", spans=[("fc-129", TERMS_HEAD)])
p.q("q04", "en", "Are we building an OCI punchout catalogue for the big customers?", "unresolved", False,
    {"fc-207": 2, "fc-209": 1, "fc-208": 1, "fc-413": 1, "fc-145": 1, "fc-302": 1}, [["fc-207"]],
    "Mehmet's proposal got no decision.")
p.q("q05", "ru", "Какая минимальная сумма заказа в новом шопе?", "conflict", False,
    {"fc-306": 2, "fc-211": 2, "fc-210": 1}, [["fc-306", "fc-211"]],
    "Plan says 150 EUR, sales tells customers 100 EUR.")
p.q("q06", "ru", "Когда переключение на новый магазин?", "revoked", True,
    {"fc-508": 3, "fc-514": 3, "fc-145": 3, "fc-406": 2, "fc-311": 1, "fc-142": 1, "fc-150": 1},
    [["fc-508"], ["fc-514"], ["fc-145"]],
    "26–27 Sep moved to 17–18 Oct at go/no-go.",
    spans=[("fc-508", CUT_NEW), ("fc-514", "Новая дата 17–18 октября, протокол сегодня."),
           ("fc-145", "Даты: заморозка каталога 13.10, переключение 17–18.10, пароли сбрасываем 18.10 утром.")])
p.q("q07", "en", "What do we use for product search, Algolia?", "revoked", True,
    {"fc-305": 3, "fc-112": 2, "fc-126": 1, "fc-110": 1}, [["fc-305"]],
    "Algolia decided in chat, rejected in the plan.", spans=[("fc-305", OPENSEARCH)])
p.q("q08", "ru", "Бесплатная доставка от 500 евро остаётся?", "revoked", True,
    {"fc-138": 3, "fc-206": 2, "fc-308": 1, "fc-139": 1}, [["fc-138"]],
    "Reversed by Paul; the plan still shows the old rule.", spans=[("fc-138", SHIP_NEW)])
p.q("q09", "en", "Do all old product URLs get a 1:1 redirect?", "revoked", True,
    {"fc-145": 3, "fc-116": 2, "fc-309": 1, "fc-146": 1}, [["fc-145"]],
    "Changed to top-2000 only; buried in the status write-up.", spans=[("fc-145", REDIR_NEW)])
p.q("q10", "ru", "Сколько старый магазин будет доступен после запуска?", "revoked", True,
    {"fc-143": 3, "fc-224": 3, "fc-411": 2, "fc-144": 2, "fc-310": 1}, [["fc-143", "fc-144"], ["fc-224"]],
    "The 3-month read-only plan was dropped; reversal in English, different words.",
    spans=[("fc-143", LEGACY_NEW),
           ("fc-224", "It goes off at cutover. Order history will be in their new account as PDFs.")])
p.q("q11", "ru", "На что жаловалась Катя из Atlas Bau?", "same-name", True,
    {"fc-214": 3, "fc-218": 1, "fc-103": 1}, [["fc-214"]],
    "Katja at Atlas Bau, not Katja Weber (ERP).", spans=[("fc-214", KATJA_ATLAS)])
p.q("q12", "ru", "У какого хостера будет новый магазин?", "missing", False,
    {"fc-114": 1, "fc-512": 1}, [], "Hosting contract mentioned, provider never named.")
p.q("q13", "en", "Are prices in the new shop shown with or without VAT?", "fact", True,
    {"fc-203": 3, "fc-202": 2, "fc-220": 2, "fc-219": 1}, [["fc-202", "fc-203"]],
    "Net; a later request did not change the default.", spans=[("fc-203", VAT)], control=True)
p.q("q14", "ru", "Какая система главная по остаткам?", "fact", True,
    {"fc-408": 3, "fc-304": 3, "fc-136": 2, "fc-135": 1, "fc-131": 1}, [["fc-408"], ["fc-304"]],
    "ERP is master; later discussion only changed sync frequency.",
    spans=[("fc-408", STOCK), ("fc-304", STOCK)], control=True)
p.write()
