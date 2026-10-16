# Can an agent answer real questions from an imported mailbox?

## Why

The owner imported a personal Gmail account (about 305,000 emails) into memo and asked six everyday questions an
agent should answer from mail: a trip's flights and hotels, utility bills and whether they are paid, the children's
school timetables, where they lived in two countries, and when they visited a third. This run checks how many memo
answers today, how many commands that takes, and what blocks the rest. It fed the next memo fixes.

## Setup

- memo 0.36.0, one Gmail account, read-only: `memo search mail … --account <address>`, `memo messages show <ref>`.
- The store held 245,394 emails of that account. Full text for 2019–2026; before 2019 only junk envelopes
  (sender, subject, date, no text), because the import was stopped at that point.
- An agent's method, repeated per question:
  1. search in the question's own words, then in the mail's languages (English, Spanish, Russian, Turkish);
  2. narrow by attachment text (`content:`), file name (`filename:`) or Gmail label (`mailbox:`);
  3. open the best hits with `memo messages show`;
  4. search again in other words before calling something not there.
- A call is one memo command.

## Results

Totals only; the questions, answers and evidence stay in the owner's private repository.

| | Questions |
|---|---:|
| Answered | 1 |
| Partly answered | 3 |
| Not found | 2 |

- 49 calls in total; 6–10 per question (median 8.5).
- Both "not found" questions are about years before 2019, which held only envelopes, so the gap is the import scope,
  not search.

### Run 2 — after the gap fixes, 2026-10-15

memo main 7b23287 (cli-memo#202, #206), local build. Only the questions run 1 left partial were rerun.

| | Run 1 | Run 2 |
|---|---:|---:|
| Answered | 1 | 1 |
| Partly answered | 3 | 3 |
| Not found | 2 | 2 |

- Answers didn't change. The one answered question needs no hand extraction now: an itinerary that was stored as
  HTML markup is readable text (214k → 3.5k characters), and 239 such emails were repaired in place.
- A school timetable stays missing. The email links to the school portal and holds no attachment, so no mail tool
  could read it.
- Bill totals still need facts extracted from the PDFs, which memo doesn't do yet.
- Leaving bulk mail out of search by default lost real answers: a utility-bill query went from 10 hits to 0,
  because billing, airline and booking mail carries the same List-Unsubscribe header as newsletters. The
  exclusion is now opt-in, `NOT mailbox:bulk`, which trims newsletters (8 → 5, 10 → 8 hits) without that loss.

### Run 3 — one more year imported, 2026-10-16

memo 0.46.0, installed. The store now holds full text from 2018. 19 PDFs that had failed to read were read again,
and bulk exclusion stays opt-in. Only the questions new data could reach were rerun: the bills question and the two
not found. 28 memo calls in total.

| | Run 2 | Run 3 |
|---|---:|---:|
| Answered | 1 | 1 |
| Partly answered | 3 | 3 |
| Not found | 2 | 2 |

- The bills answer improved: an unpaid-bill notice's PDF is now read, so its amount is known. It's still "partly"
  because totals and paid status need facts per bill.
- The two "not found" questions stayed not found. The extra year holds only shop marketing from that country, so
  the years they need are probably earlier still.
- New friction for an agent: showing an email lists its attachments' names but not their text; `from:` with an
  address needs quotes; and common words combined with a date range or `NOT mailbox:bulk` exceed the search time
  budget.

### Run 4 — after the search fixes, 2026-10-16

memo 0.49.0 (cli-core 0.295.0, cli-base 0.40.0), installed: `messages show` gives each attachment's text, `from:`
takes an unquoted address, and a mailbox filter no longer runs past the time budget ([search](../search/README.md)).
Same three questions as run 3. 10 memo calls in total.

| | Run 3 | Run 4 |
|---|---:|---:|
| Answered | 1 | 2 |
| Partly answered | 3 | 2 |
| Not found | 2 | 2 |

- The bills question is answered: one search and one `messages show` read the unpaid notice's amount and due
  date from its attachment, where run 3 needed a hunt through PDFs.
- The two "not found" questions now get real answers instead of a time-budget error, but every hit is a digest or
  a newsletter: the mail they need is from before the imported years.

## What it showed

- **Stored text is sometimes raw HTML** for template-built emails such as flight itineraries. The facts are in the
  store but need hand extraction.
- **An attachment named in an email can be missing from the store.** The fact the question needed was in that PDF.
- **Mass mail crowds the results.** Newsletters and digests that mention the place outrank the few real bookings, and
  no query term excludes mail decided by an envelope rule or bulk senders.
- **A Gmail label alone is too slow:** `mailbox:<label>` with no other word exceeds the search time budget.
- **Bills need facts, not text.** "How much did I pay, is it all paid" needs each bill's amount, due date and payment
  state; today an agent opens every PDF.
- `--account` on search takes the address, while other mail commands take the account name.

## Not measured

- Answer quality against a written key: this run judged answers by hand.
- Search by meaning in isolation; every query used the default mixed search.
- Years before 2018 (run 3 added 2018), and the second mail account.
