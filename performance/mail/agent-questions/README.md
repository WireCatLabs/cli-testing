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
- Years before 2019, and the second mail account.
