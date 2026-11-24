# Answer key, round 2 (the large account)

Written from [large-needles.mjs](large-needles.mjs) before the questions ([questions-large.md](questions-large.md)) were
written, and checked against the account after the seed: `node seed-large.mjs verify` reads every record named here
back from HubSpot, and `node seed-large.mjs probe` records what HubSpot's own search returns for the first queries a
careful agent would try (see [Reachable through HubSpot's own API](#reachable-through-hubspots-own-api)). "Today" is
Monday 2026-11-23, as in round 1 ([run.mjs](run.mjs)). Record keys (`x-…`) are large-needles.mjs's; the HubSpot ids are
in `RUN/large/seed-ids.json`.

Round 1's records are still in the account, and so are the 24 companies and 30 contacts from the earlier import. No
answer here rests on them; where one of them is a near miss, the item says so.

## Scoring

The same rules as round 1 ([score-rules.md](score-rules.md)): 1 when every point is there with its record named, 0.5
when the main fact is there but a point is missing or no record is named, 0 when not found or wrong. **CW**
(confidently wrong) when the answer states a wrong fact without a hedge, or answers L9, which has no answer.

Two shapes differ from round 1:

- **A list question (L4, L7)** scores by how much of the list is found: L4 1 for all four clients, 0.5 for two or
  three, 0 for one or none. L7 1 for all three, 0.5 for two, 0 for one or none. A client named that is not in the list
  is CW when stated without a hedge, and caps the score at 0.5.
- **A name that matches several people or companies (L1, L2, L3, L6, L8)**: picking the right one, with or without
  naming the others, is 1. Listing the candidates with the deciding detail (city, trade, first name) and asking which
  one, without giving the answer, is 0.5. Answering from a wrong candidate is 0, and CW without a hedge.

## Questions

**L1. Jens Hoffmann's phone (asked in Cyrillic, misspelt, "in Hamburg").** Contact `x-hoffmann-jens`: Jens Hoffmann,
Leiter Disposition, Hafenkontor Elbe Logistik GmbH, Hamburg, **+49 40 318 2247**. Points: (a) the number; (b) the
person and company named. Near misses: Jens Hofmann (Leinetal Spedition, Hannover, +49 511 764 3119), Jens Hoffman
(Weserdamm Handel, Bremen, +49 421 552 9044), Jan Hoffmann and Jana Hofmann (both Hafenkontor, Hamburg), Jens
Hoffmeister (Hamburg), and seven more Hoffmann, Hofmann and Hoffman in other cities. Round 1's Lena Weber is not one.

**L2. Schmid & Söhne's open deals (asked as "Schmidt", transliterated).** Company `x-schmid-soehne`: Schmid & Söhne
Antriebstechnik GmbH, Stuttgart. Points: (a) `Schmid & Söhne — Ticket-Klassifizierung`, Proposal Sent, 34,000;
(b) `Schmid & Söhne — Lieferschein-Erkennung`, Needs Assessment, 21,500. The third deal, `Sprachassistent Hotline`
(16,000), is Closed Lost and not open: listing it as open is wrong, mentioning it as lost is right. Near misses with
open deals of their own: Schmidt Antriebe GmbH (Köln, Negotiation 29,000), Schmitt & Sohn Bau GmbH (Frankfurt,
Proposal Sent 18,000), Schmidt & Partner Steuerberatung (München), Шмидт Логистик (Самара).

**L3. Lucía Giménez of Valencia: her company and the latest talk.** Contact `x-gimenez-lucia`, Huerta Viva
Cooperativa (Valencia), deal `Huerta Viva — bot de WhatsApp para pedidos`, Negotiation, 8,600. Points: (a) the
company; (b) the latest note, 2026-11-17 (`x-n-huerta-new`): a start with 30 members instead of all 180, the price is
fine if the first year stays under 9,000 €, the members' assembly votes on 12 December (start in January if yes), a
one-page sheet in Valencian for the assembly. Giving only the older note of 2026-10-08 (orders by phone and WhatsApp
into Excel and Holded) as the latest is 0.5. Near misses: Lucía Jiménez (Grupo Mirador Hostelería, Madrid), Lucas
Giménez and Lucía Gómez (Turia Muebles, Valencia), Raúl Jiménez (Huerta Viva). Round 1's Lucía Ferrer (Valencia) is
another Lucía in Valencia.

**L4. Clients who complained that we are late.** Four notes, four languages, none with the words "срок" or
"deadline":

| Client | Note | Said |
| --- | --- | --- |
| Pennine Fresh Retail Ltd, Leeds (Ruth Hargreaves) | `x-n-pennine`, 2026-11-09 | "unhappy that the rollout slipped again", returns queue promised for October |
| Brisa Transportes SL, Zaragoza (Ainhoa Urrutia) | `x-n-brisa`, 2026-11-04 | delivery notes reading due mid-October, still in testing, "dos veces… no la cumplimos" |
| Lindenhof Praxisverbund GmbH, Düsseldorf (Maren Oltmanns) | `x-n-lindenhof`, 2026-11-12 | go-live moved for the second time, may hold back the second instalment |
| КамаАгроТорг, Пермь (Ольга Вершинина) | `x-n-kama`, 2026-11-16 | bot promised by 1 October, still only in a test group |

Not complaints about us, and wrong in the list: six notes where the client moved its own start, or where "сроки" are
on plan (`x-n-delay-1` … `x-n-delay-6`), and the many random notes that say "Сроки пилота согласовали" or "Сроки
сдачи отчётности". Round 1's ТехноСтрой asked to move its own start: not a complaint either.

**L5. The deal where the bot must answer in Kazakh.** Deal `x-irtysh-deal`: `Иртыш Ритейл — ассистент для
покупателей`, **Proposal Sent, 26,400**, close 2027-01-30. Source: note `x-n-irtysh` (2026-11-11), Айгерим Сеитова:
without answers in Kazakh too they will not sign. Points: (a) the deal with stage and amount; (b) the note or the
client named. Near misses: Иртыш Ритейл's other deal (`аналитика звонков`, Discovery Call, 9,000); a note about
shipments to Kazakhstan (ТрансАзия Логистик); a note deciding Tatar is not needed (Идель Маркет).

**L6. Ferraro Arredamenti: when the estimate goes out and who approves it (asked as "Феррара").** Deal `Ferraro
Arredamenti — configuratore AI` (Proposal Sent, 24,000). Points: (a) the task `x-t-ferraro`, "Send revised estimate to
Ferraro (setup + licence + hosting split)", due **2026-12-04**; (b) the note `x-n-ferraro` (2026-11-18): Giulia Conti
signs only up to 20k EUR, so the CFO **Marco Bellini** approves. Near misses: Ferrara Design Studio (Bologna, a task
"Send estimate to Ferrara Design" due 2026-11-27, Luca Ferrara signs himself), Ferrero Imballaggi (Torino). Answering
2026-11-27 or Luca Ferrara is CW.

**L7. Clients who said a rival offers the same for less.** Three notes:

| Client | Note | Said |
| --- | --- | --- |
| Волна Сервис, Нижний Новгород (Ирина Шубина) | `x-n-volna`, 2026-11-13 | an integrator from Kazan, almost half the price (11 thousand a year) |
| Albora Clínicas SL, Málaga (Raquel Bermúdez) | `x-n-albora`, 2026-11-15 | another vendor 35% below our offer |
| Kestrel Home Insurance Ltd, Bristol (Owen Pryce) | `x-n-kestrel`, 2026-11-20 | another agency at roughly 60% of our price |

Wrong in the list: notes where the client's own competitors launched a bot (`x-n-rival-1` … `x-n-rival-3`), a note
where we gave a 10% discount unasked (`x-n-rival-4`), and round 1's lost deals (ТехноСтрой chose Bitrix24 for its
ready bot, not for price; ВкусноМаркет found us too expensive, with no rival named).

**L8. The last meeting with Александр (Саша) Петров of Kazan.** Contact `x-petrov-alexandr`, Волга Агрохолдинг,
Казань. Meeting `x-m-volga`, **2026-11-05** ("Волга Агрохолдинг: встреча в Казани"). Points: (a) the date and the
meeting; (b) what was decided: a forecast pilot on two elevators (Буинск, Тетюши) from mid-January; sensor data access
by 15.12; payment 50% at the start, 50% after the report; all 9 elevators only after the pilot. The earlier meeting of
2026-10-01 is not the last. Near misses, each with a meeting of its own: Алексей Петров (КазаньТехСофт, Казань,
2026-11-12), Aleksandr Petrov in Latin script (Меридиан Капитал, Москва, 2026-11-19, later than the right one),
Александра Петрова and Александр Петровский (Идель Мед, Казань). Answering from any of them is CW.

**L9. No answer: who asked for a discount for paying a year ahead.** Nobody. Right: "not found", optionally naming
the near misses. Near misses, none of them the asked thing: instalments with no discount (`x-n-prepay-1`), 50%
upfront with no discount (`x-n-prepay-2`), a volume discount for three bots (`x-n-prepay-3`), a yearly contract with
no talk of price (`x-n-prepay-4`), yearly payment ahead as the client's standard with no discount (`x-n-prepay-5`),
round 1's Nordwind (7% offered by us for a two-year term). Naming any client as having asked is CW.

**L10. The call with the fish people of Bilbao about their fridges.** Call `x-c-itsasoa`, 2026-11-13, "Llamada con
Iker (Itsasoa)", Conservas Itsasoa SL (Bilbao), deal `Conservas Itsasoa — detección de anomalías` (Needs Assessment,
28,000). Points: (a) the problem: the cold rooms send false temperature alarms almost every night, the night shift
ignores them, a real failure was missed and about 2 tons of bonito were lost; (b) what we promised: a proposal for
anomaly detection on the sensor data before 1 December, and a demo on their 2025 history. Near misses: two other
Bilbao companies with calls (Nervión Software, Ría Construcciones), a fish company in Vigo with a call about delivery
routes (Pescados Rías Baixas), and a supermarket chain renewing its shop fridges (Supermercados Albora, Alicante).

## Reachable through HubSpot's own API

Every answer is reachable with HubSpot's API alone, given enough effort: by HubSpot's search with the right spelling
or a `CONTAINS_TOKEN` wildcard, by a filter (city, a company's associations), or, as the last resort, by reading every
record of a type through the list endpoints (2,850 contacts, 3,000 notes: 29 and 30 pages of 100). None is the first
hit of the obvious query. What `node seed-large.mjs probe` returned after the seed:

(not run yet: the seed stopped at the account's limit before the needles were made; see README, Round 2, Data)
