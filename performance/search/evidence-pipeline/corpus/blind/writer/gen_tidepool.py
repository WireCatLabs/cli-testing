import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from genlib import Project  # noqa: E402

p = Project("tidepool", "Tidepool booking app for Aqualine", ["Тайдпул", "приложение Aqualine", "Aqualine app"])
DEV = p.source("tp-chat-dev", "chat", "tidepool-dev")
CLI = p.source("tp-chat-client", "chat", "Aqualine × Northwind")
SPEC = p.source("tp-doc-spec", "document", "Tidepool product spec v2")
KICK = p.source("tp-meet-0902", "meeting", "Kickoff with Aqualine 2 Sep")
STEER = p.source("tp-meet-1020", "meeting", "Steering review 20 Oct")

CARDS = "Нет. Данные карт мы у себя не храним вообще, ни в базе, ни в логах — только токен, который отдаёт платёжный провайдер."
PUSH = ("Yes, you can send them, but only once our legal team has signed off the opt-in wording, "
        "and only to members who actually opted in.")
HEADINGS = ("Section headings and their order are approved, please lock the structure. "
            "The content of section 5 (the loyalty point values and tiers) is NOT approved — Hendrik from finance "
            "has to go through the numbers first.")
LAUNCH_OLD = "Ок, фиксируем: публичный запуск 1 ноября, в оба стора."
LAUNCH_NEW = ("Подтверждаю перенос: запуск 17 ноября. 1 ноября не успеваем из-за ревью Apple и security review, "
              "Sam согласовал.")
STRIPE = "So payments go through Stripe, decided. Igor, you can start the integration next week."
ADYEN = ("Платёжный провайдер — Adyen. У Aqualine есть корпоративный договор с Adyen с более низкой комиссией, "
         "поэтому интеграцию со Stripe мы не делаем.")
WATCH_OLD = "Yes — let's do the Apple Watch companion in v1. Members keep asking for it."
WATCH_NEW = ("The Watch companion — let's take it out. Not in v1, and not planned for v2 either for now. "
             "It's a nice-to-have and it's eating Timur's time.")
VK_OLD = "Решили: добавляем вход через VK ID, Sam сказал у них много русскоязычных членов клуба."
VK_NEW = ("Отдельно: от входа через VK ID отказываемся. Остаются Sign in with Apple, Google и email-ссылка. "
          "Причина — юристы Aqualine не хотят передавать данные в ещё одну систему, Sam подтвердил в почте.")
IOS_OLD = "We'll support iOS 15 and newer on the iPhone side, Android 9 and newer."
IOS_NEW = ("По айфонам: устройства на пятнадцатой системе больше не поддерживаем, нижняя планка теперь шестнадцатая. "
           "Навигация на SwiftUI там разваливается, а таких пользователей у Aqualine меньше 3%.")
CANCEL_SPEC = "Бесплатная отмена записи возможна не позднее чем за 12 часов до начала занятия."
CANCEL_MKT = "Free cancellation up to 24 hours before your class starts."
HOST = "Бэкенд и база — у нас на Hetzner, дата-центр Falkenstein, EU. Sam, вас это устраивает?"
HOST_OK = "Yes, Hetzner in Germany is fine for us. Agreed."
HORIZON_KICK = "Members can book up to 14 days ahead, not more. That's how our trainers' rotas work."
HORIZON_SPEC = "Записаться на занятие можно не раньше чем за 14 дней до его начала."
SECREV = "Alex Brandt from our IT security will do the security review on 21–23 October."

p.chat(DEV, [
  ("tp-101", "Марина", "08-20 09:05", "Всем привет! Завели канал под Aqualine. Кодовое имя проекта — Tidepool, не спрашивайте почему 🙂"),
  ("tp-102", "Игорь", "08-20 09:07", "tidepool норм"),
  ("tp-103", "Тимур", "08-20 09:11", "А их бренд-бук уже есть?"),
  ("tp-104", "Марина", "08-20 09:14", "Lena запросила, обещали до пятницы", "tp-103"),
  ("tp-105", "Lena", "08-20 10:02", "Got the old brand guide from 2021, they say a new one is coming. I'll start with wireframes anyway."),
  ("tp-106", "Алекс", "08-21 11:30", "Я по андроиду, Kotlin + Compose, ок? Или кто-то хочет Flutter обсудить"),
  ("tp-107", "Марина", "08-21 11:34", "Нативно оба, это в контракте", "tp-106"),
  ("tp-108", "Алекс", "08-21 11:35", "👍"),
  ("tp-109", "Олег", "08-22 15:40", "Кто знает, у них турникеты на входе какие? Если QR — мне нужны тестовые сканеры"),
  ("tp-110", "Марина", "08-22 16:02", "Спрошу на кикоффе. Олег, запиши в вопросы", "tp-109"),
  ("tp-111", "Алекс", "08-27 10:15", "Вопрос по оплате: мы у себя храним данные карты, чтобы сделать «оплатить в один клик»? Или это всё на стороне провайдера?"),
  ("tp-112", "Игорь", "08-27 10:41", CARDS + " One-click делаем через сохранённый токен у провайдера, PCI нам не нужен.", "tp-111"),
  ("tp-113", "Алекс", "08-27 10:43", "понял, спасибо", "tp-112"),
  ("tp-114", "Тимур", "08-28 18:20", "кто-нибудь идёт в пятницу на митап по Swift? у меня лишний билет"),
  ("tp-115", "Lena", "08-28 18:25", "Not me, I'm in Lisbon this weekend 🌊"),
  ("tp-116", "Марина", "09-02 13:10", "Кикофф прошёл, заметки скину в Confluence. Главное: Stripe, Hetzner, горизонт записи 14 дней, iOS 15+"),
  ("tp-117", "Игорь", "09-02 13:15", "Stripe это хорошо, я с ним работал"),
  ("tp-118", "Олег", "09-02 13:20", "А турникеты?"),
  ("tp-119", "Марина", "09-02 13:22", "QR, вендор Gantner. Тестовые сканеры пришлют в Берлин, офис на Torstraße", "tp-118"),
  ("tp-120", "Марина", "09-04 10:00", VK_OLD),
  ("tp-121", "Игорь", "09-04 10:05", "Ок, тогда мне нужен доступ к VK ID кабинету. Кто заводит приложение?", "tp-120"),
  ("tp-122", "Марина", "09-04 10:20", "Sam заведёт на их юрлицо", "tp-121"),
  ("tp-123", "Lena", "09-05 14:00", "Wireframes v1 are in Figma, page 'Booking flow'. Comments welcome, esp. on the class list filters."),
  ("tp-124", "Тимур", "09-05 14:30", "Фильтр по бассейну и по типу занятия — ок. Фильтр по тренеру точно нужен в v1?"),
  ("tp-125", "Lena", "09-05 14:41", "Sam asked for it explicitly, so yes", "tp-124"),
  ("tp-126", "Олег", "09-09 09:12", "Тестовые устройства: у нас нет ни одного айфона на iOS 15. Кто-то может принести старый?"),
  ("tp-127", "Тимур", "09-09 09:30", "У меня дома 8-й лежит, принесу", "tp-126"),
  ("tp-128", "Игорь", "09-11 17:05", "Hetzner: заказал два CCX33 в Falkenstein + managed Postgres пока не берём, ставим сами. Бэкапы в Storage Box."),
  ("tp-129", "Марина", "09-11 17:10", "ок, счёт перевыставим Aqualine в конце месяца"),
  ("tp-130", "Алекс", "09-12 12:00", "Тимур, глянь моё ревью по общему API-клиенту до пятницы, плиз"),
  ("tp-131", "Тимур", "09-12 12:40", "Алекс, гляну завтра утром", "tp-130"),
  ("tp-132", "Игорь", "09-22 11:00", """Предложение, пока не поздно: давайте API сразу сделаем на GraphQL, а не REST. Аргументы:
1) у мобильных два клиента с разными экранами, GraphQL снимает кучу эндпоинтов «под экран»;
2) расписание занятий — это граф (бассейн → зал → занятие → тренер → записи), REST там получается многословный;
3) кодоген для Swift и Kotlin из схемы есть и нормально работает.
Минусы: кэширование сложнее, и Олегу придётся переучивать автотесты. Если ок — я за 3 дня переделаю то, что уже есть."""),
  ("tp-133", "Тимур", "09-22 11:20", "интересно", "tp-132"),
  ("tp-134", "Олег", "09-22 11:25", "Кто-нибудь знает, когда приходят сканеры Gantner? DHL пишет «задержка в таможне»"),
  ("tp-135", "Марина", "09-22 11:31", "Олег, пингану Sam", "tp-134"),
  ("tp-136", "Lena", "09-24 16:00", "Watch companion screens are in Figma as well: next class, check-in QR, lane availability."),
  ("tp-137", "Тимур", "09-24 16:10", "Сделаю прототип на SwiftUI, но watchOS отдельно в оценку не входил, Марина в курсе?", "tp-136"),
  ("tp-138", "Марина", "09-24 16:15", "В курсе, допродаём как CR", "tp-137"),
  ("tp-139", "Тимур", "09-29 10:05", IOS_NEW + " Sam письменно ок."),
  ("tp-140", "Олег", "09-29 10:12", "Ура, айфон 8 можно вернуть Тимуру 😄", "tp-139"),
  ("tp-141", "Игорь", "10-01 09:00", "Кстати, их безопасник спрашивал в клиентском чате про Azure. Это всё ещё вопрос?"),
  ("tp-142", "Марина", "10-01 09:20", "Нет, Sam закрыл, Hetzner как решили на кикоффе", "tp-141"),
  ("tp-143", "Lena", "10-03 13:00", "Spec v2 draft is up. Marina, can you check section 3, I wasn't sure about the cancellation wording."),
  ("tp-144", "Марина", "10-03 13:40", "Написала 12 часов, как в договоре на абонементы. Отправляю Sam в понедельник", "tp-143"),
  ("tp-145", "Марина", "10-09 18:30", f"""Статус Tidepool, неделя 41

Сделано:
— бронирование и отмена записи работают end-to-end на стейджинге, iOS и Android;
— интеграция с Adyen: тестовые платежи проходят, 3DS2 проверен на трёх банках;
— Gantner: сканеры наконец пришли, Олег прогнал 40 проходов, 2 ложных отказа, разбираемся;
— спека v2 отправлена Aqualine, ждём фидбек по разделу лояльности.

Риски:
— Apple review для приложений с подпиской на абонементы бывает долгим, закладываем неделю;
— security review у Aqualine ещё не назначен, без него не выкатываемся;
— Тимур перегружен из-за часов (watchOS).

План на неделю 42: push-уведомления (ждём юристов), экран истории посещений, нагрузочный тест расписания.

{VK_NEW} Игорь, кнопку и SDK выпиливаем в этом спринте.

Бюджет: по часам идём на 6% выше плана, в основном из-за часов и Adyen-переделки. Обсудим на steering."""),
  ("tp-146", "Игорь", "10-09 18:45", "ок, выпилю VK завтра", "tp-145"),
  ("tp-147", "Алекс", "10-13 11:11", "у кого-нибудь стейджинг тормозит? у меня расписание грузится 6 секунд"),
  ("tp-148", "Игорь", "10-13 11:20", "Индекс слетел после миграции, поправил, проверь", "tp-147"),
  ("tp-149", "Алекс", "10-13 11:26", "0.4 с, огонь", "tp-148"),
  ("tp-150", "Олег", "10-15 15:00", "Security review: Алекс, это ты делаешь? в джире на тебе тикет TP-131"),
  ("tp-151", "Алекс", "10-15 15:04", "Не, на мне только ревью кода Тимура. Security review делает их безопасник, Alex Brandt", "tp-150"),
  ("tp-152", "Марина", "10-21 10:00", "После steering: часы убрали из скоупа. Тимур, всё по watchOS заморозь в отдельной ветке."),
  ("tp-153", "Тимур", "10-21 10:05", "наконец-то 🙏", "tp-152"),
  ("tp-154", "Lena", "10-22 12:00", "Members on the beta keep asking for dark mode. Just saying 🙂"),
  ("tp-155", "Олег", "10-24 17:30", "Регресс на 17-е зелёный, кроме одного кейса с отменой в последний час. Завёл баг TP-160."),
])

p.chat(CLI, [
  ("tp-201", "Sam", "08-25 08:30", "Hi all, welcome to the shared channel. I'm the product owner on Aqualine's side, Vika does marketing, Hendrik finance."),
  ("tp-202", "Марина", "08-25 08:45", "Hi Sam! Marina, PM at Northwind. Lena (design), Igor (backend), Timur (iOS), Alex (Android), Oleg (QA)."),
  ("tp-203", "Vika", "08-25 09:00", "Привет! Я тоже говорю по-русски, если что 🙂"),
  ("tp-204", "Sam", "09-03 10:00", "Thanks for the kickoff yesterday. One thing we didn't cover: our members keep asking for an Apple Watch app."),
  ("tp-205", "Марина", "09-03 10:20", "We can estimate it. Is it a must for v1?", "tp-204"),
  ("tp-206", "Sam", "09-08 09:15", WATCH_OLD + " I'll sort the extra budget with Hendrik.", "tp-205"),
  ("tp-207", "Марина", "09-10 11:00", "Sam, по дате запуска: мы готовы к 1 ноября, если спека v2 будет утверждена до 10 октября. Подходит?"),
  ("tp-208", "Sam", "09-10 11:30", "Да, 1 ноября подходит, наш маркетинг уже планирует кампанию.", "tp-207"),
  ("tp-209", "Марина", "09-10 11:35", LAUNCH_OLD, "tp-208"),
  ("tp-210", "Vika", "09-12 14:00", "For the launch we plan an Apple Search Ads campaign plus posters in all 9 pools. I'll share the creative brief later."),
  ("tp-211", "Lena", "09-17 10:00", "Sam, a question from design: can we send push reminders 2 hours before a booked class?"),
  ("tp-212", "Sam", "09-17 12:10", PUSH + " I'll forward the wording to legal today.", "tp-211"),
  ("tp-213", "Lena", "09-17 12:12", "Perfect, I'll draft the opt-in screen", "tp-212"),
  ("tp-214", "Sam", "09-25 16:00", "Customs released the Gantner scanners, they should be in Berlin on Monday."),
  ("tp-215", "Alex Brandt", "10-01 08:50", "Hi, Alex from Aqualine IT security here. Why is the backend not on our Azure tenant? We have a policy for vendor apps."),
  ("tp-216", "Sam", "10-01 09:05", "Alex, we settled this at kickoff — Hetzner stays. It's EU, they sign our DPA. Please just review the DPA.", "tp-215"),
  ("tp-217", "Alex Brandt", "10-01 09:10", "Fair enough. Send me the DPA draft.", "tp-216"),
  ("tp-218", "Sam", "10-07 17:45", f"""Went through spec v2 with Vika and Hendrik. Overall very good, thanks Lena and Marina. Notes:

1. Booking flow (section 2): the trainer filter should default to "any trainer", not to the last trainer used. Members switch a lot.
2. Section 3, booking rules: fine from my side. Vika will double-check against the membership terms.
3. Section 4, payments: Adyen is confirmed, our merchant account is AqualineGmbH_App. Hendrik will send the API credentials through the vault, not by email.
4. History screen: please show the pool name, not just the hall number. Hall numbers repeat between pools.
5. Push opt-in copy: legal is still on it.
6. The "Coming soon" banner for the Watch app on the home screen — please make it smaller.

About the document as a whole: {HEADINGS} I know you want a clear yes, sorry. Expect it next week.

Also please add a short section about offline behaviour — what happens in the pool basement where there is no signal."""),
  ("tp-219", "Марина", "10-07 18:00", "Thanks Sam, very clear. We lock the structure and keep section 5 open.", "tp-218"),
  ("tp-220", "Vika", "10-12 13:00", f"Draft FAQ for the website and the app store page:\n\nQ: Can I cancel a class?\nA: {CANCEL_MKT} After that, the visit is counted.\n\nQ: Do I need to print my ticket?\nA: No, just show the QR code at the turnstile."),
  ("tp-221", "Sam", "10-12 13:30", "Looks good. The cancellation text is already live on our website, same as in the membership leaflet.", "tp-220"),
  ("tp-222", "Lena", "10-12 13:45", "Хм, в спеке у нас другое число. Проверю", "tp-220"),
  ("tp-223", "Марина", "10-14 09:30", "Sam, плохие новости по срокам: Apple review + security review не влезают до 1 ноября. Предлагаем 17 ноября."),
  ("tp-224", "Sam", "10-14 10:40", "Понял. Ок, 17 ноября, Vika сдвинет кампанию.", "tp-223"),
  ("tp-225", "Марина", "10-14 10:45", LAUNCH_NEW, "tp-224"),
  ("tp-226", "Олег", "10-16 11:00", "Sam, when exactly does Alex start the review? I need to freeze the staging build."),
  ("tp-227", "Sam", "10-16 11:20", SECREV + " Staging needs to be frozen from the 20th.", "tp-226"),
  ("tp-228", "Vika", "10-17 15:00", "Members are asking if they can book a whole month ahead, like in the old Excel system. Can we?"),
  ("tp-229", "Марина", "10-17 15:20", "Горизонт 14 дней остаётся, как договорились на кикоффе — это из-за графиков тренеров. В приложении будет подсказка.", "tp-228"),
  ("tp-230", "Vika", "10-17 15:22", "ок, напишу так в FAQ", "tp-229"),
  ("tp-231", "Sam", "10-23 09:00", "Alex Brandt finished the review: two medium findings, no blockers. Report in the shared drive."),
  ("tp-232", "Игорь", "10-23 09:30", "Thanks, fixing both today", "tp-231"),
  ("tp-233", "Vika", "10-27 10:00", "Posters are printed! 9 pools × 4 posters, with the new date."),
])

p.doc(SPEC, "Lena", "10-05", [
  ("tp-301", ["1. Overview"], "Tidepool is the member app for Aqualine, a chain of 9 swimming pools in Berlin and Potsdam. Members book classes and lane slots, pay for single visits, and check in at the turnstile with a QR code. Target launch: 1 November 2026, iOS and Android. Native apps (Swift/SwiftUI, Kotlin/Compose), backend in Ruby on Rails."),
  ("tp-302", ["1. Overview", "1.1 Scope v1"], "In v1: class and lane booking, cancellation, single-visit payments, QR check-in, visit history, push reminders (subject to legal), login via Sign in with Apple, Google, email magic link and VK ID. Apple Watch companion app (next class, QR, lane availability). Out of scope: in-app subscriptions, family accounts, gift cards."),
  ("tp-303", ["2. Booking flow"], "Список занятий фильтруется по бассейну, типу занятия и тренеру. По умолчанию показываем ближайший бассейн по геолокации, если доступ к ней дан. Карточка занятия: время, зал, тренер, свободные места, цена для неабонентов. Кнопка «Записаться» доступна только авторизованным пользователям."),
  ("tp-304", ["3. Booking rules"], f"{HORIZON_SPEC} Одновременно у участника может быть не больше 6 активных записей. {CANCEL_SPEC} Отмена позже считается посещением и списывается с абонемента. Если участник не пришёл три раза за месяц, запись блокируется на 7 дней. Лист ожидания: при освобождении места первому в листе приходит пуш, у него есть 30 минут на подтверждение."),
  ("tp-305", ["4. Payments"], f"""Разовые посещения и докупка занятий оплачиваются в приложении. Абонементы продаются только на ресепшене и в веб-кабинете Aqualine, в приложении мы их только показываем.

Поддерживаемые методы: банковские карты (Visa, Mastercard, Amex), Apple Pay, Google Pay, PayPal. SEPA-дебет не поддерживаем в v1 — слишком долгий цикл подтверждения для разового визита.

Хранение данных: приложение и бэкенд не видят номер карты. Мы получаем от провайдера токен и последние 4 цифры для отображения. Повторные платежи идут по сохранённому токену, по явному действию пользователя («Оплатить картой •••• 4242»).

Возвраты: делает только ресепшен через кабинет провайдера; в приложении статус возврата виден в истории. Чеки отправляются на email провайдером, не нами.

{ADYEN} Тестовый мерчант-аккаунт уже заведён, боевой Aqualine заводит сам. Вебхуки провайдера принимаются на отдельном эндпоинте с проверкой HMAC-подписи; неподтверждённые платежи старше 15 минут отменяются автоматически."""),
  ("tp-306", ["5. Loyalty programme"], "Участник получает 10 баллов за каждое посещение и 25 баллов за занятие с тренером. Уровни: Silver (от 300 баллов), Gold (от 900), Platinum (от 2000). Gold даёт приоритет в листе ожидания, Platinum — одно бесплатное занятие в месяц. Баллы сгорают через 12 месяцев. Значения — черновик, требуют утверждения финансов Aqualine."),
  ("tp-307", ["6. Notifications"], "Push-напоминание за 2 часа до занятия, пуш о свободном месте из листа ожидания, пуш об изменении расписания. Все пуши — только при явном согласии (opt-in), текст согласия утверждает юрист Aqualine. Email: подтверждение записи и отмены."),
  ("tp-308", ["7. Check-in"], "QR-код генерируется в приложении и обновляется каждые 30 секунд (TOTP), сканеры Gantner проверяют его через наш API. При отсутствии сети приложение показывает последний валидный код с офлайн-подписью на 10 минут."),
  ("tp-309", ["8. Non-functional"], "Время загрузки расписания — до 1 с на 4G. Доступность бэкенда 99,5% в часы работы бассейнов. Персональные данные хранятся в ЕС. Логи с персональными данными — не дольше 30 дней. Поддерживаемые языки интерфейса: немецкий, английский, русский, турецкий."),
  ("tp-310", ["9. Open questions"], "— Минимальные версии ОС: см. тикет TP-88.\n— Нужен ли семейный аккаунт в v2?\n— Как показывать абонемент, купленный в старой системе до миграции?"),
])

p.meet(KICK, "09-02", [
  ("tp-401", "Марина", "10:00:05", "Okay, I think everyone is here. Sam, Vika, Hendrik from Aqualine, and our team. Let's go through the agenda: scope, tech decisions, timeline."),
  ("tp-402", "Sam", "10:01:10", "Thanks. Quick context: the current booking is a mix of phone calls and an Excel sheet at each pool. We want members to do everything in the app."),
  ("tp-403", "Vika", "10:02:30", "And from marketing: the app should feel like our brand, not like a generic fitness app. Blue, calm, water."),
  ("tp-404", "Lena", "10:03:15", "Noted. I'll do moodboards first."),
  ("tp-405", "Игорь", "10:05:00", "Tech side. For payments I'd suggest Stripe — good SDKs for both platforms, Apple Pay and Google Pay out of the box."),
  ("tp-406", "Hendrik", "10:06:20", "We don't have a strong preference. The fee is what matters to me."),
  ("tp-407", "Sam", "10:06:45", STRIPE),
  ("tp-408", "Игорь", "10:08:00", HOST),
  ("tp-409", "Sam", "10:08:40", HOST_OK + " Our IT may ask questions, but data in Germany is the main thing."),
  ("tp-410", "Тимур", "10:10:00", "Minimum OS versions — what does your member base look like?"),
  ("tp-411", "Sam", "10:11:20", "Lots of older members, older phones. " + IOS_OLD),
  ("tp-412", "Олег", "10:12:30", "А турникеты какие? Нам для теста нужны сканеры."),
  ("tp-413", "Sam", "10:13:00", "Gantner, QR. We'll ship two scanners to your Berlin office."),
  ("tp-414", "Lena", "10:15:10", "Booking rules — how far ahead can people book?"),
  ("tp-415", "Sam", "10:15:50", HORIZON_KICK),
  ("tp-416", "Vika", "10:17:00", "Можно ещё вопрос про отмену? Сейчас на ресепшене говорят по-разному."),
  ("tp-417", "Sam", "10:17:40", "Let's put the cancellation rule in the spec and I'll check it with the membership terms."),
  ("tp-418", "Марина", "10:20:00", "Timeline: spec v2 by early October, launch target beginning of November. We'll confirm the exact date in the chat."),
  ("tp-419", "Hendrik", "10:21:30", "Please send the change requests to me directly, not only to Sam. Budget sits with me."),
  ("tp-420", "Марина", "10:22:00", "Will do. Thanks everyone."),
])

p.meet(STEER, "10-20", [
  ("tp-501", "Марина", "14:00:10", "Steering, 20 October. Sam, Hendrik, Vika; from us Igor, Timur and me. Status, budget, scope."),
  ("tp-502", "Марина", "14:01:30", "Status: booking, payments via Adyen, check-in — done on staging. Security review starts tomorrow. Launch 17 November holds."),
  ("tp-503", "Hendrik", "14:03:00", "Budget is six percent over. Where does it come from?"),
  ("tp-504", "Марина", "14:03:40", "Mostly the Watch app and switching the payment provider. The Watch part is about forty hours so far."),
  ("tp-505", "Тимур", "14:05:00", "И ещё минимум столько же до релиза, там комплишены и офлайн."),
  ("tp-506", "Sam", "14:06:30", WATCH_NEW),
  ("tp-507", "Hendrik", "14:07:00", "Agreed. That also brings us back near budget."),
  ("tp-508", "Vika", "14:08:10", "Then I'll remove the Watch teaser from the posters. Good thing they're not printed yet."),
  ("tp-509", "Игорь", "14:09:30", "Loyalty: we need the numbers for section 5 by end of October, otherwise loyalty moves after launch."),
  ("tp-510", "Hendrik", "14:10:20", "I'm still working on it. The point values look too generous to me. Give me a week."),
  ("tp-511", "Vika", "14:12:00", "Ещё по маркетингу: Apple Search Ads запускаем в день релиза, креативы готовы."),
  ("tp-512", "Hendrik", "14:12:40", "We talk about the ads separately, Vika."),
  ("tp-513", "Lena", "14:14:00", "One request from the beta: dark mode. Is that something for v1?"),
  ("tp-514", "Sam", "14:14:30", "Let's not open new topics today."),
  ("tp-515", "Марина", "14:16:00", "Okay. Action items: Timur freezes watchOS, Hendrik sends loyalty numbers, Vika updates posters, Igor fixes review findings."),
  ("tp-516", "Sam", "14:16:40", "Thanks all, good meeting."),
])

p.q("q01", "ru", "Мы храним данные банковских карт пользователей у себя?", "negative", True,
    {"tp-112": 3, "tp-111": 2, "tp-305": 1}, [["tp-111", "tp-112"]],
    "The reply is a denial; the payments section repeats it as background.", spans=[("tp-112", CARDS)])
p.q("q02", "ru", "Можно отправлять участникам пуш-напоминания перед занятием?", "conditional", True,
    {"tp-212": 3, "tp-211": 2, "tp-307": 1}, [["tp-211", "tp-212"]],
    "Yes, only after legal approves the opt-in text and only to opted-in members.", spans=[("tp-212", PUSH)])
p.q("q03", "en", "Did Aqualine approve the loyalty programme in the spec?", "approval", True,
    {"tp-218": 3, "tp-306": 2, "tp-510": 1}, [["tp-218", "tp-306"]],
    "Headings approved, the content of section 5 was not.", spans=[("tp-218", HEADINGS)])
p.q("q04", "ru", "Мы переводим API на GraphQL?", "unresolved", False,
    {"tp-132": 2, "tp-133": 1}, [["tp-132"]], "Proposed by Igor, nobody accepted or rejected it.")
p.q("q05", "en", "How late can a member cancel a class without being charged?", "conflict", False,
    {"tp-304": 2, "tp-220": 2, "tp-221": 2, "tp-222": 1}, [["tp-304", "tp-220"]],
    "Spec says 12 hours, the live marketing text says 24 hours; nobody resolved it.")
p.q("q06", "ru", "Когда запуск приложения в сторах?", "revoked", True,
    {"tp-225": 3, "tp-502": 3, "tp-209": 2, "tp-223": 2, "tp-224": 2, "tp-301": 1},
    [["tp-225"], ["tp-223", "tp-224"], ["tp-502"]],
    "1 November was moved to 17 November.",
    spans=[("tp-225", LAUNCH_NEW), ("tp-502", "Launch 17 November holds.")])
p.q("q07", "en", "Which payment provider does Tidepool use?", "revoked", True,
    {"tp-305": 3, "tp-218": 3, "tp-407": 2, "tp-117": 1, "tp-145": 1, "tp-502": 1}, [["tp-305"], ["tp-218"]],
    "Stripe from the kickoff was replaced by Adyen in spec v2.",
    spans=[("tp-305", ADYEN), ("tp-218", "Adyen is confirmed, our merchant account is AqualineGmbH_App.")])
p.q("q08", "en", "Is the Apple Watch app part of v1?", "revoked", True,
    {"tp-506": 3, "tp-152": 3, "tp-206": 2, "tp-302": 1, "tp-508": 1}, [["tp-506"], ["tp-152"]],
    "Agreed in chat, dropped at the steering meeting.",
    spans=[("tp-506", WATCH_NEW), ("tp-152", "После steering: часы убрали из скоупа.")])
p.q("q09", "ru", "Будет вход через VK ID?", "revoked", True,
    {"tp-145": 3, "tp-120": 2, "tp-302": 1, "tp-146": 1}, [["tp-145"]],
    "Reversal buried in the weekly status.", spans=[("tp-145", VK_NEW)])
p.q("q10", "en", "What is the minimum iOS version we support?", "revoked", True,
    {"tp-139": 3, "tp-411": 2, "tp-126": 1, "tp-310": 1}, [["tp-139"]],
    "iOS 15+ was raised to 16; the reversal is in Russian with different wording.", spans=[("tp-139", IOS_NEW)])
p.q("q11", "en", "When is Alex doing the security review?", "same-name", True,
    {"tp-227": 3, "tp-151": 2, "tp-226": 2, "tp-130": 1}, [["tp-226", "tp-227"]],
    "Alex Brandt (Aqualine IT security), not Alex the Android developer.", spans=[("tp-227", SECREV)])
p.q("q12", "ru", "Какой бюджет на Apple Search Ads к запуску?", "missing", False,
    {"tp-210": 1, "tp-511": 1}, [], "The campaign is mentioned, the budget never is.")
p.q("q13", "ru", "Где хостится бэкенд Tidepool?", "fact", True,
    {"tp-408": 3, "tp-409": 3, "tp-216": 2, "tp-142": 2, "tp-128": 1}, [["tp-408", "tp-409"]],
    "Hetzner Falkenstein; IT security later asked about Azure, decision stayed.",
    spans=[("tp-408", HOST), ("tp-409", HOST_OK)], control=True)
p.q("q14", "en", "How many days in advance can members book a class?", "fact", True,
    {"tp-415": 3, "tp-304": 3, "tp-229": 2, "tp-228": 1}, [["tp-415"], ["tp-304"]],
    "14 days; a later request for a month was turned down.",
    spans=[("tp-415", HORIZON_KICK), ("tp-304", HORIZON_SPEC)], control=True)
p.write()
