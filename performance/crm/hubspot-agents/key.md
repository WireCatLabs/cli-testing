# Answer key

Written from [seed-data.mjs](seed-data.mjs) and the account as it stood after the seed, before any question was
written. "Today" is Monday 2026-11-23; the account's time zone is US/Eastern. Two records were in the account before
the seed and count: `WireCat live test deal` (Discovery Call, 1,200) and `HubSpot - New Deal (Sample Deal)`
(Discovery Call, 1,000), and three open tasks due 2026-11-17 (`(Sample task) Follow up with Brian`,
`(Sample task) Prepare quote for Maria Johnson (Sample Contact)`, `WireCat live test task`).

Scoring: a read question scores 1 when every checklist point is there with its record (deal, contact or note named),
0.5 when the main fact is there but a point is missing or no record is named, 0 when not found or wrong. **CW**
(confidently wrong) when the answer states a wrong fact without a hedge, or answers a question that has no answer in
the data. A write task scores 1 when `node writes.mjs verify` ([writes.mjs](writes.mjs)) finds the change and nothing else changed, else 0.

## Read questions

**Q1. What closes this month (by 2026-11-30) among open deals.** Only `ТехноСтрой — автоматизация смет`: 31,000,
Negotiation, close date 2026-11-28. Points: (a) that deal with amount and date; (b) the risk: Сергей Кузнецов asked to
move the start to January because of a Rostekhnadzor inspection, and their lawyer holds the contract over the
liability clause (note of 2026-11-19). `HubSpot - New Deal (Sample Deal)` closes 2026-11-24 and is open: naming it
is right too, not required.

**Q2. Overdue tasks.** Open tasks due before 2026-11-23: (a) `Отправить Кузьмину обновлённое КП с пилотом в
Подольске` (2026-11-18, Альфа-Логистик); (b) `Send DPA draft to Lena Weber` (2026-11-20, Nordwind GmbH);
(c) `Согласовать с юристом пункт об ответственности для ТехноСтроя` (2026-11-21, in progress); (d) `Сделать 20
пробных описаний для Кедра` (2026-11-16); (e) `Draft reseller agreement for Sergey` (2026-11-10, Kuznetsov
Consulting). The three pre-existing sample tasks (due 2026-11-17) are overdue too; listing them is right, not
required. Listing a completed task (`Send SOC 2 report to Oliver`, `Отправить Волкову презентацию…`) as overdue is
wrong.

**Q3. Sergey of Valencia (Kuznetsov Consulting), his commission.** (a) 20% on every client he brings, (b) paid
quarterly, (c) three hotel chains in mind, Casa Verde among them, pilot with one client first (note of 2026-11-14,
deal `Kuznetsov Consulting — реселлерское соглашение`). Confusing him with Сергей Кузнецов of ТехноСтрой is wrong.

**Q4. ТехноСтрой, Кузнецов and the lawyer.** (a) the lawyer wants changes to the liability clause, the price suits
them; (b) Кузнецов asked to move the start to January (Rostekhnadzor inspection); (c) the contract meeting on
2026-11-26 (`ТехноСтрой: финальное согласование договора`). Deal: `ТехноСтрой — автоматизация смет`, Negotiation,
31,000.

**Q5. What Stёpa (Степан Морозов, Кедр Мебель) sent for the catalogue.** (a) 1,200 catalogue items in Excel; (b) the
tone: "по-сибирски душевно", no anglicisms; (c) Стефания Морозова checks the texts. Deal `Кедр Мебель — генерация
описаний каталога`, Solution Design. Answering from Степан Мороз of Полюс Агро is wrong.

**Q6. Степан Мороз (Полюс Агро): when he decides and how many hectares.** (a) decision by 2026-12-12, else the
budget goes to machinery; (b) 12,000 hectares, winter wheat, weekly satellite images and a yield forecast; (c) the
deal `Полюс Агро — мониторинг полей`, Negotiation, 38,000. A call on 2026-11-15: the price per hectare seemed high
(extra, not required).

**Q7. Lost deals and why.** Five, 104,200 in all: (a) `Альфа Логистика Юг — голосовой ассистент` 6,000, no budget
until Q2 2027; (b) `ТехноСтрой — чат-бот для прорабов` 8,000, chose a competitor (Bitrix24 with a ready bot);
(c) `Медвежонок — анализ снимков` 48,000, lawyers against: no medical device registration; (d) `ВкусноМаркет —
колл-центр на ИИ` 37,000, too expensive: asked 30% off, got 10%; (e) `Полюс Агро — первичка в 1С` 5,200, frozen
after a change of director.

**Q8. Won this autumn (September to November 2026).** Five deals, 77,700: `Альфа-Логистик — распознавание
накладных` 9,200 (2026-10-02), `SolarPack Iberia — lead scoring` 26,000 (2026-11-10), `Кедр Мебель — внедрение
CRM-бота` 11,800 (2026-09-12), `Casa Verde Hoteles — conserje virtual` 16,500 (2026-10-28), `DataNest — CS copilot`
14,200 (2026-11-18). Points: (a) the total, (b) the list. `Kuznetsov Consulting — website assistant` (2026-07-18) is
outside the period. Amounts are in USD, the account's currency.

**Q9. "Альфа": what is open.** Two companies share the name. (a) Альфа-Логистик: `бот для диспетчеров склада`,
Proposal Sent, 18,500, close 2026-12-15; (b) Альфа Логистика Юг: `маршрутизация`, Needs Assessment, 14,000. An
answer that names one and says it is the only one is 0.5; one that asks which Альфа and lists both is 1.

**Q10. Nordwind discount.** Nordwind GmbH (Berlin), deal `Nordwind GmbH — TMS integration`, Negotiation, 42,000:
(a) Lena Weber wants 12%; (b) we offered 7% for a two-year term; (c) legal wants a DPA and EU hosting (Frankfurt).
Nordwind Group (Riga) is a different company: mixing them is wrong.

**Q11. No answer: when Orbita paid its first invoice.** Орбита Финанс has no won deal and the account holds no
invoice or payment. Right: "not found" / no payment recorded, optionally naming its two open deals. Any date or sum
is CW.

**Q12. Lena Weber's phone, asked as if she were in Riga.** She is at Nordwind GmbH in Berlin, Procurement Lead,
+49 160 7788 1122. Points: (a) the number; (b) the correction: Berlin / Nordwind GmbH, not Riga. Giving a number of
Nordwind Group (Ozols, Kalniņa) is wrong.

**Q13. BrightPath meeting, asked as "in November".** The board presentation is on 2026-12-03, not in November. (a)
the date and the correction; (b) Rui Almeida signs (Managing Director). Extra: the pilot must cover Portuguese and
English, they want a reference from another school.

**Q14. Where Волков of Orbita came from.** Сергей Волков, head of sales at Орбита Финанс: (a) came by the
recommendation of Сергей Кузьмин of Альфа-Логистик; (b) wants a support bot for the mobile bank; (c) the deal `Орбита
Финанс — бот поддержки клиентов`, Needs Assessment, 23,000; the presentation was sent (task completed 2026-11-22).

**Q15. The funnel.** One pipeline, `AI Automation Sales Pipeline`, 32 deals: Discovery Call 6 (88,000), Needs
Assessment 3 (52,500), Solution Design 3 (46,900), Proposal Sent 5 (163,500), Negotiation 4 (130,000), Closed Won 6
(81,200), Closed Lost 5 (104,200). Open: 21 deals, 480,900. Points: (a) counts per stage, (b) sums per stage. Without
the two pre-existing Discovery deals: 4 (85,800), and 30 deals in all: counted right as well when said.

**Q16. Biggest open deal and its next step.** `Орбита Финанс — KYC-проверка документов`, 64,000, Proposal Sent,
close 2027-01-10. Next step: (a) fill in Orbita's information security questionnaire, due 2026-12-02; (b) the
requirement: everything inside their perimeter, no cloud. Second largest: `ТехноСтрой — контроль ТБ по камерам`
55,000.

**Q17. Meetings this week (2026-11-23..29).** (a) `Nordwind GmbH: commercial terms`, 2026-11-25 13:00 UTC;
(b) `ТехноСтрой: финальное согласование договора`, 2026-11-26 06:00 UTC. Not this week: BrightPath (2026-12-03),
Кедр (2026-11-11), Орбита (2026-11-16).

**Q18. SolarPack: signed or not, and what Javier wanted.** (a) `SolarPack Iberia — lead scoring` is won, 26,000,
2026-11-10; (b) Javier García wants a success story for his website in January (task due 2026-12-15); (c) Pablo Ruiz
asked for an invoice with VAT to SolarPack Iberia SL. Extra: the 2027 renewal (Proposal Sent, 26,000) and the support
deal (Needs Assessment, 15,500) are open.

**Q19. Casa Verde: how many hotels, and did guest satisfaction go up.** (a) the contract covers 4 hotels (won
2026-10-28, 16,500); (b) Carmen Martínez wants 7 in spring if satisfaction rises; (c) whether it rose is not in the
data. Saying it rose (or fell) is CW.

**Q20. Dental clinic, no-shows, WhatsApp.** Медвежонок, deal `Медвежонок — запись пациентов через бота`, Proposal
Sent, 22,000: (a) 18% of patients do not come; (b) reminders in WhatsApp and Telegram, integration with their system
«Дентал Про»; (c) the demo task on 2026-11-25.

## Variants (scored apart)

**V3.** Q3 asked another way. Same key.

**V6.** Q6 asked another way. Same key.

## Write tasks

Checked by [writes.mjs](writes.mjs) (`verify`) after each contestant, then put back (`reset`).

**W1. A note on the Кедр catalogue deal.** A new note associated with `Кедр Мебель — генерация описаний каталога`
that says Стёпа approved the first 20 descriptions and asks for 100 more by 10 December.

**W2. A task to call Орлова on Friday at 11.** A new open task due 2026-11-27 (Friday), associated with Екатерина
Орлова or the deal `Медвежонок — запись пациентов через бота`, about calling her.

**W3. Move Альфа Юг's routing deal to Solution Design.** `Альфа Логистика Юг — маршрутизация` in stage Solution
Design. Moving the Альфа-Логистик deal is wrong.

**W4. Close the DataNest partnership as lost, with the reason.** `DataNest — referral partnership` in Closed Lost,
with a lost reason that says they decided to go without partners.

**W5. Ирина Белова's new phone.** The contact Ирина Белова (Альфа-Логистик) has phone +7 916 450-99-99; no other
contact changed.
