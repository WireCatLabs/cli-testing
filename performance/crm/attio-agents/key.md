# Answer key

Written from [seed-data.mjs](seed-data.mjs) and the totals of [facts.mjs](facts.mjs), before any question was written.
"Today" is Monday 2026-11-23, and every time is UTC. Every seeded company, person, deal and note title ends in
"(WC seed)". The key leaves the suffix out, and an answer may leave it out too. Amounts are in USD, the workspace's
currency. Records that were in the workspace before the seed count: the deals `Northwind annual renewal (WireCat
test)` (Lead, 12,000), `Northwind expansion (WireCat test)` (In Progress, 4,500) and `Bluebird pilot (WireCat test)`
(Lost, 8,000), none with a close date or a note, the companies `Northwind Traders (WireCat test)` and `Bluebird Labs
(WireCat test)`, and the people Anna Petrova, Marco Rossi and Lena Novak. The stage totals below include those three
deals. Attio also created about a dozen companies and a few people by itself. They have no deals, and one of them is
a real contact named Sergey, which matters for the Sergey questions.

Scoring: a read question scores 1 when every checklist point is there with its record named (the deal, the person,
the note or the task), 0.5 when the main fact is there but a point is missing or no record is named, 0 when it is not
found or wrong. **CW** (confidently wrong) is an answer that states a wrong fact without a hedge, or answers a
question that has no answer in the data. Facts marked "extra" are right to give but not required.

## Read questions

**Q1. Which open deals close this month (by 2026-11-30).** (note: no, case: summary, no object named) (a) Only
`ТрансКарго — диспетчерский бот`: In Progress, 27,500, close date 2026-11-27. Extra: the date will likely slip,
because Сергей Ершов asked to move the start to February and their security service wants everything on their own
servers (note "Ершов: перенос старта", 2026-11-19). The three earlier deals have no close date, so leaving them out is
right. Any other deal named as closing in November is wrong.

**Q2. Overdue tasks.** (note: no, case: summary, no object named) Open tasks due before 2026-11-23: (a) `Send the EU
hosting addendum to Marta Gil`, due 2026-11-19, deal `Northwind Iberia — voice picking`. (b) `Ответить СБ ТрансКарго
по установке на их сервер`, due 2026-11-20, deal `ТрансКарго — диспетчерский бот`. (c) `Сделать 20 пробных описаний
для Кедрового Дома`, due 2026-11-16, deal `Кедровый Дом — описания каталога`. (d) `Draft the reseller agreement for
Sergei`, due 2026-11-12, deal `Costa Blanca Advisors — reseller agreement`. Listing a completed task as overdue
(`Send SOC 2 report to Oliver`, due 2026-11-19, or `Отправить Волковой презентацию бота`, due 2026-11-22) is wrong.

**Q3. The terms the reseller Sergei of Valencia asked for.** (note: yes, case: name close to another, half answer)
The person is Sergei Malkov, Founder of Costa Blanca Advisors (Valencia), deal `Costa Blanca Advisors — reseller
agreement`, In Progress, 12,000, close 2026-12-31. From the note "Terms Sergei asked for" (2026-11-14): (a) 15%
commission on every client he brings, (b) paid monthly, (c) two hotel chains in mind, Sol y Mar among them, (d) start
with one pilot client. The second hotel chain is not in the data: naming one is CW, saying it is not recorded is
right. The workspace holds other Sergeys: Сергей Ершов (ТрансКарго), Сергей Ершин (МедЛайн Клиники) and one
unrelated contact not in any deal. Taking terms from either Russian Sergey is wrong. Extra: the draft agreement task
is overdue since 2026-11-12.

**Q4. What holds up the ТрансКарго dispatch bot, and when the next call is.** (note: yes, case: typo in a name, two
asks) Deal `ТрансКарго — диспетчерский бот`, In Progress, 27,500, close 2026-11-27, people Сергей Ершов and Олег Пак.
From the note "Ершов: перенос старта" (2026-11-19): (a) Ершов asks to move the start to February, they wait for a new
budget, (b) the price suits them, the blocker is their security service, which wants everything on their own servers
without cloud, (c) a call about the contract on 25 November at 11:00 Moscow time, which is 08:00 UTC. Extra: the task
to answer their security service is overdue since 2026-11-20. Facts from Сергей Ершин of МедЛайн are wrong. An answer
with only one of the two asks scores 0.5.

**Q5. The clinic where "Ершов" is chief doctor: the booking bot, who else is on it, and when the demo is.** (note:
no, case: misremembered person, name close to another) (a) The correction: the chief doctor of МедЛайн Клиники is
Сергей Ершин. Сергей Ершов is the commercial director of ТрансКарго. (b) Deal `МедЛайн — бот записи к врачу`, In
Progress, 21,000, close 2026-12-10, people Сергей Ершин and Ольга Демина (operations director). (c) The task
`Показать Деминой демо напоминаний в Telegram`, due 2026-11-25 11:00 UTC. Extra: 22% no-shows, reminders in Telegram
and MAX, integration with МИС «Инфоклиника» (note "Демина: неявки"). An answer that finds the deal without the
correction scores 0.5. Answering with ТрансКарго's deal is wrong.

**Q6. Why the clinic turned down call transcription.** (note: no, case: no object named) (a) Deal `МедЛайн —
расшифровка приёмов`, Lost, 33,000, close 2026-10-14. (b) The lost reason: the lawyers are against it, patient data
may not go to the cloud. Extra: the note "Отказ по расшифровке" (2026-10-15) adds that we may come back if we offer a
version on their own server.

**Q7. Phone of Марина Котова "of ТрансКарго".** (note: no, case: misremembered company) (a) +7 916 552-07-41. (b) The
correction: her record is at Вега Фарм, Директор по цифровизации, not ТрансКарго. Extra: she moved from ТрансКарго to
Вега Фарм in October (notes "Акт подписан" and "Котова на новом месте"). The number alone without the correction
scores 0.5. Saying she works at ТрансКарго, without a hedge, is CW. A number of Сергей Ершов or Олег Пак is wrong.

**Q8. The deal with the Moscow pharmacy chain.** (note: no, case: no object named) (a) Deal `Вега Фарм — проверка
рецептов`, Lead, 52,000, close 2027-03-01. (b) People Марина Котова and Игорь Лунин. Extra, from the note "Котова на
новом месте" (2026-11-10): a pilot on 3 pharmacies, checking prescriptions against stock, budget for the first
quarter, Лунин decides.

**Q9. Can Sol y Mar expand to all its hotels yet.** (note: yes, case: answer only in a note) (a) No, not yet. (b) The
condition: Carmen Vidal will extend to all 6 hotels if booking conversion rises by 15% (note "Contrato firmado",
2026-10-22). (c) The first month showed +9%, sent by Dmitry Orlov (note "Conversión, primer mes", 2026-11-20). (d)
Today the contract covers 3 hotels, deal `Sol y Mar — chatbot de reservas`, Won 🎉, 15,800, close 2026-10-21. Saying
the condition is met is CW. Extra: the open deal `Sol y Mar — upsell engine` (Lead, 12,000).

**Q10. Phone of Дмитрий Орлов.** (note: no, case: name shared by two companies) Two people carry the name: (a)
Дмитрий Орлов, Начальник отдела продаж at Кедровый Дом, +7 913 744-50-19, (b) Dmitry Orlov, Revenue Manager at Sol y
Mar Hoteles, +34 655 917 260. An answer that gives both, or asks which one and lists both, scores 1. One number
presented as the only Орлов scores 0.5. The number of Анна Орлова (+7 913 744-50-23) as his is wrong.

**Q11. What "Дима" sent for the catalogue, and whether the sample descriptions are done.** (note: yes, case: name
close to another, two asks) Дима is Дмитрий Орлов of Кедровый Дом, deal `Кедровый Дом — описания каталога`, In
Progress, 7,900, close 2026-12-20. From the note "Дима прислал каталог" (2026-11-13): (a) 900 catalogue items in
Excel, (b) a warm tone, without officialese and without anglicisms, (c) Анна Орлова checks the texts. (d) The 20 sample
descriptions are not done: the task `Сделать 20 пробных описаний для Кедрового Дома` is open and overdue since
2026-11-16. Answering from Dmitry Orlov of Sol y Mar (conversion data) is wrong. The catalogue points to Кедровый Дом, so a
question back without an answer scores 0.5. One of the two asks only scores 0.5.

**Q12. Зерно-Юг fields: how many hectares, and the decision deadline.** (note: yes, case: typo in a name) Deal
`Зерно-Юг — мониторинг посевов`, In Progress, 36,000, close 2026-12-14, person Пётр Савин. From the note "Савин:
снимки и прогноз" (2026-11-15): (a) 9,500 hectares, sunflower and wheat, weekly satellite images and a yield
forecast, (b) a decision by 14 December, otherwise the budget goes to machinery. Extra: the price per hectare seems
high to him, and the task `Созвон с Савиным по цене за гектар` is due 2026-11-24 06:00 UTC. The deadline alone, read
from the close date, scores 0.5. Facts of the lost deal `Зерно-Юг — первичка в 1С` are wrong here.

**Q13. Brightlane's meeting, asked as "in November".** (note: yes, case: misremembered month) (a) The board meets on 4
December, not in November (note "Pilot scope", 2026-11-17, and the deal's close date 2026-12-04). (b) Rui Teixeira,
Managing Director, signs. Deal `Brightlane — AI tutor pilot`, In Progress, 19,500. Extra: the pilot must be in
Portuguese and English, and the task `Find a school reference for Brightlane` is due 2026-11-27. A November date is
CW.

**Q14. When ФинПоинт paid, and the invoice number.** (note: no, case: no answer in the data) ФинПоинт Банк has no won
deal, and the workspace holds no payment or invoice for it. Right: not recorded, optionally naming its two open deals
`ФинПоинт — KYC-проверка документов` (In Progress, 64,000) and `ФинПоинт — бот поддержки клиентов` (Lead, 23,000). Any
date, sum or number is CW, including 30.09, which is ТрансКарго's payment.

**Q15. Where Наталья Волкова came from.** (note: yes, case: typo in a name, name close to another) From the note
"Откуда Волкова" (2026-11-21): (a) she came on her own, on the recommendation of Сергей Ершов of ТрансКарго, (b) she
needs a support bot for the mobile bank, 40,000 requests a month. (c) Deal `ФинПоинт — бот поддержки клиентов`, Lead,
23,000, close 2027-02-27. Naming Сергей Ершин as the referrer is CW. Extra: the presentation was sent (task completed,
due 2026-11-22).

**Q16. The pipeline by stage, as a table.** (note: no, case: summary) Lead 42 deals, 1,165,000. In Progress 42 deals,
1,114,900. Won 🎉 20 deals, 574,600. Lost 19 deals, 481,700. Open (Lead and In Progress) 84 deals, 2,279,900. Points:
(a) count per stage, (b) sum per stage. Totals without the three earlier deals count as right when the answer says it
left them out.

**Q17. All lost deals and why.** (note: no, case: summary) 19 deals, 481,700. Points: (a) the count and total, (b) the
list with reasons:
`МедЛайн — расшифровка приёмов` 33,000, Юристы против: данные пациентов нельзя отдавать в облако.
`Зерно-Юг — первичка в 1С` 4,800, Проект заморожен после смены собственника.
`Хлебница — колл-центр на ИИ` 37,000, Слишком дорого: просили скидку 30%, дали 10%.
`DataCraft — referral partnership` 0, Decided to work without partners.
`Гранит-Тех — анализ звонков` 54,000, Выбрали конкурента.
`Transportes Girasol — buscador interno` 42,900, Eligieron a la competencia.
`Granite Foods — call analytics` 26,000, Went silent.
`Нева-Авто — ИИ-поиск по базе знаний` 46,000, Выбрали конкурента.
`Гранит-Агро — прогноз спроса` 44,400, Выбрали конкурента.
`Blue Energy — demand forecast` 0, Went silent.
`Тайга-Принт — распознавание документов` 14,400, Сделали своими силами.
`Прогресс-Мед — голосовой ассистент` 0, Сделали своими силами.
`Transportes Alba — asistente de voz` 55,800, Eligieron a la competencia.
`Copper Health — document OCR` 45,100, Built it in-house.
`Сатурн-Принт — прогноз спроса` 10,000, Пропал контакт, не отвечают.
`Прогресс-Энерго — прогноз спроса` 28,700, Нет бюджета в этом году.
`Омега-Агро — голосовой ассистент` 13,700, Пропал контакт, не отвечают.
`Alimentación Horizonte — previsión de demanda` 17,900, Eligieron a la competencia.
`Bluebird pilot (WireCat test)` 8,000, no reason recorded.
Leaving out `Bluebird pilot` counts as right when the answer says so. A grouped summary by reason (competitor,
in-house, silent, budget, price, legal, frozen) with the story deals named scores 1 when the count and total are
right. A reason invented for `Bluebird pilot` is CW.

**Q18. What was won this autumn (September to November 2026).** (note: no, case: summary) 16 deals, 459,100, by close
date: 2026-09-06 `Distribución Brisa — análisis de llamadas` 43,500, 2026-09-08 `Эталон-Фуд — чат-бот для клиентов`
45,300, 2026-09-12 `Кедровый Дом — CRM-бот для дилеров` 11,600, 2026-09-14 `Нева-Строй — голосовой ассистент` 40,100,
2026-09-30 `ТрансКарго — распознавание путевых листов` 8,400, 2026-10-02 `Copper Freight — document OCR` 45,400,
2026-10-07 `Альтаир-Трейд — чат-бот для клиентов` 25,300, 2026-10-08 `Омега-Строй — распознавание документов` 23,900,
2026-10-20 `Construcciones Girasol — buscador interno` 11,800, 2026-10-21 `Sol y Mar — chatbot de reservas` 15,800,
2026-10-28 `Distribución Faro — OCR de facturas` 33,700, 2026-11-09 `Solaria — lead scoring` 26,000, 2026-11-14
`Clínicas Duna — buscador interno` 17,100, 2026-11-16 `Енисей-Принт — анализ звонков` 49,800, 2026-11-17 `DataCraft —
CS copilot` 14,200, 2026-11-17 `Crescent Energy — demand forecast` 47,200. Points: (a) the count and total, (b) the
list. Won deals that closed before September are outside the period: including them is wrong.

**Q19. The biggest open deal and its next step.** (note: no, case: summary, two asks) (a) `ФинПоинт — KYC-проверка
документов`, In Progress, 64,000, close 2027-01-20, person Андрей Лебедь. (b) Next step: the task `Заполнить опросник
ИБ ФинПоинта`, due 2026-12-02. Extra: the requirement that everything runs inside their perimeter without cloud (note
"Требования к KYC"), and the next largest, `Summit Media — demand forecast` 53,700 and `Омега-Принт — прогноз спроса`
53,300. One ask only scores 0.5.

**Q20. The Northwind discount.** (note: yes, case: typo in a name, name close to another) Deal `Northwind Iberia —
voice picking` (Northwind Logistics Iberia, Valencia), In Progress, 46,000, close 2026-12-18. From the note "Call with
Marta Gil: discount" (2026-11-18): (a) Marta Gil wants 10% off, (b) we offered 5% for a 24-month term, (c) their legal
team asks for EU hosting (Frankfurt) and a DPA. Extra: Álvaro Ruiz wants it live before the March peak, and the
addendum task is overdue since 2026-11-19. Facts from Northwinds Retail Group (Riga) or Northwind Traders (WireCat
test) are wrong. Asking which Northwind, with the three listed, scores 1 only if it then gives the Iberia discount,
else 0.5.

**Q21. Marta Gil's phone and email, asked as if she were in Riga.** (note: no, case: misremembered city, two asks, half
answer) (a) +34 622 815 447. (b) The correction: she is Procurement Lead at Northwind Logistics Iberia in Valencia,
not Riga. Riga is Northwinds Retail Group. (c) No email is recorded for her. Any email address is CW. A number of
Jānis Bērziņš or Ilze Kalniņa (Northwinds) is wrong. The phone without the correction scores 0.5.

**Q22. What is open with Northwind.** (note: no, case: name shared by several companies) Three companies carry the
name, and all four open deals count: (a) `Northwind Iberia — voice picking`, In Progress, 46,000, close 2026-12-18
(Northwind Logistics Iberia, Valencia), (b) `Northwinds — shelf photo audit`, Lead, 18,000, close 2027-02-15
(Northwinds Retail Group, Riga), (c) `Northwind annual renewal (WireCat test)`, Lead, 12,000, and (d) `Northwind
expansion (WireCat test)`, In Progress, 4,500 (Northwind Traders (WireCat test), no close dates). An answer that lists
all and says the companies differ scores 1. One company presented as the only Northwind scores 0.5. Asking which one
while listing the three scores 1.

**Q23. The bakery chain: why we lost, and when to come back.** (note: no, case: no object named) (a) Deal `Хлебница —
колл-центр на ИИ`, Lost, 37,000, close 2026-11-04. (b) Reason: too expensive, they asked for 30% off, we gave 10%. (c)
Come back in March: the task `Вернуться к Садыковой с пилотом на одной точке`, due 2027-03-02. Extra: Алсу Садыкова
backs the project, Тимур Галиев wanted the discount (note "Отказ", 2026-11-05).

**Q24. DataCraft's payment terms and who runs their procurement.** (note: yes, case: typo in a name, answer only in a
note) Deal `DataCraft — LLM evaluation harness`, In Progress, 33,000, close 2026-12-22. From the note "Procurement"
(2026-11-19): (a) payment terms net 60, (b) Priya Shah runs procurement. Extra: Oliver Grant asked for the SOC 2 report
(task done) and a fixed price. Taking terms from the won `DataCraft — CS copilot` or the lost partnership deal is
wrong.

**Q25. The invoice number for Solaria.** (note: yes, case: half answer) (a) No invoice number is recorded. (b) The
note "Firmado" (2026-11-10) on `Solaria — lead scoring` (Won 🎉, 26,000, close 2026-11-09) says Pablo Serra asked for
the invoice with IVA in the name of Solaria Energía SL. Any number is CW. Saying the invoice was sent is CW, the data
does not say so.

**Q26. Tasks due this week (2026-11-23 to 2026-11-29).** (note: no, case: summary, no object named) (a) `Созвон с
Савиным по цене за гектар`, 2026-11-24 06:00 UTC, deal `Зерно-Юг — мониторинг посевов`. (b) `Показать Деминой демо
напоминаний в Telegram`, 2026-11-25 11:00 UTC, deal `МедЛайн — бот записи к врачу`. (c) `Find a school reference for
Brightlane`, 2026-11-27 10:00 UTC, deal `Brightlane — AI tutor pilot`. Extra: the ТрансКарго contract call on 25
November, 11:00 Moscow time, 08:00 UTC (a note, not a task), and the four overdue tasks of Q2 when marked as
overdue. A completed task listed as due is wrong.

**Q27. When our meeting with Лунин is.** (note: no, case: no answer in the data) No meeting with Игорь Лунин (Вега
Фарм) is recorded: no task, no note with a date. Right: not found, optionally adding that he decides on `Вега Фарм —
проверка рецептов` and the budget is for the first quarter. Any date is CW, above all 25 November (that is the
ТрансКарго call) or 2027-03-01 given as a meeting (that is the deal's close date).

**Q28. Girasol, the internal search deal: won or lost.** (note: no, case: name shared by two companies) Both
companies' deals are `buscador interno`: (a) `Construcciones Girasol — buscador interno`, Won 🎉, 11,800, close
2026-10-20, (b) `Transportes Girasol — buscador interno`, Lost, 42,900, close 2026-08-24, Eligieron a la competencia.
A third company, Consultores Girasol, has no deal. Both deals named, or a question back listing both, score 1. One
deal presented as the only Girasol scores 0.5.

**Q29. Why we lost Гранит.** (note: no, case: name shared by several companies) Two Гранит companies have lost deals,
both to a competitor: (a) `Гранит-Тех — анализ звонков`, 54,000, close 2026-08-18, Выбрали конкурента, (b) `Гранит-Агро
— прогноз спроса`, 44,400, close 2026-09-14, Выбрали конкурента. Other Гранит companies (Гранит-Энерго, Гранит-Строй,
Гранит-Логистик) have open deals, not lost ones. Extra: `Granite Foods — call analytics` (26,000, Went silent) is a
different company. Only one of (a) and (b), presented as the only one, scores 0.5.

**Q30. What "Сергей" said about the cloud, and on which deal.** (note: yes, case: name close to another, no surname
given) Two Sergeys said it, and both count: (a) Сергей Ершин, МедЛайн Клиники: the network's lawyers are against it,
appointment recordings may not go to an external cloud, so `МедЛайн — расшифровка приёмов` was lost, come back with a
version on their server (note "Отказ по расшифровке", 2026-10-15). (b) Сергей Ершов, ТрансКарго: their security
service wants everything on their own servers without cloud, deal `ТрансКарго — диспетчерский бот` (note "Ершов:
перенос старта", 2026-11-19). The workspace also holds Sergei Malkov (Costa Blanca Advisors) and one unrelated contact
named Sergey, who said nothing about the cloud. Both (a) and (b), or a question back listing both with their
statements, score 1. One of them presented as the only answer scores 0.5. Андрей Лебедь's no-cloud requirement
(ФинПоинт) is not a Sergey: giving it as the answer is wrong.

## Variants

Scored apart from the main set, with the same checklist as the question they repeat.

**V3a.** Repeats Q3 in English. Same key: 15% commission, monthly, two hotel chains with Sol y Mar among them (the
second not recorded), one pilot client first, record `Costa Blanca Advisors — reseller agreement` and its note.

**V3b.** Repeats Q3 as keywords. Same key as Q3.

**V9a.** Repeats Q9 in English. Same key: not yet, condition +15% conversion for all 6 hotels, first month +9%,
contract covers 3 hotels, record `Sol y Mar — chatbot de reservas` and its two notes.

**V9b.** Repeats Q9 as keywords. Same key as Q9.

**V12a.** Repeats Q12 in English. Same key: 9,500 hectares, sunflower and wheat, decision by 14 December or the
budget goes to machinery, record `Зерно-Юг — мониторинг посевов` and the note "Савин: снимки и прогноз".

**V12b.** Repeats Q12 as keywords. Same key as Q12.
