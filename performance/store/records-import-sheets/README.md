# First real import of two payment spreadsheets into memo's records store

## Why it was run

The owner keeps project money in Google Sheets: invoices and payments, per project and direction. The question was
whether the v1 records envelope import (cli-core) reproduces a sheet exactly, including payments split across
several invoices. The answer fed three changes:

- per-relation `amount` on `settles` (cli-core #2476, 0.571.0);
- an owner-only correction of a confirmed payment's split (cli-core #2500, 0.573.0);
- `memo payments unlink` (memo 0.131.29).

## Setup

- memo 0.131.27 to 0.131.29 on cli-core 0.571.0 to 0.573.0, Linux.
- Two real sheets, converted to a v1 records envelope by converters kept in a private repo. Each converter reads one
  sheet and writes the envelope: persons, organizations, projects, invoices and payments, with the links between them.
- The envelope is imported with the records import, proposals are reviewed with `memo review`, and totals are read
  back with memo.

Real data stays private. This page holds counts and outcomes only: no amounts, names or ids.

## Results

### Sheet A: service rental, client billing

Envelope: 36 records (1 person, 2 organizations, 1 project, 12 invoices, 20 payments). The sheet holds 18 split
amounts.

| step | outcome |
|---|---|
| First import, before amounts were carried | One split payment was settled greedily and over-covered an invoice. The owner's confirm was refused with `finance.over-invoice`. This led to #2476. |
| Trial run after #2476 | 1 payment refused: an earlier confirmed payment held the wrong split. |
| Owner correction | 3 commands: unlink, allocate, allocate. |
| Re-import | 3 created, 14 updated, 19 unchanged, 0 refused. 13 confirmed payments were flagged and not changed. |

### Sheet B: partner billing

Envelope: 38 records (2 persons, 1 project, 32 invoices, 3 payments).

| step | outcome |
|---|---|
| Import | 38 created, 0 refused. |
| Links | 35 waited for owner links until the owner ran 3 link commands. |

### Review

The owner confirmed all 39 proposals with one `memo review confirm` command using id ranges.

### Reconciliation

Every total memo reports per project and direction (7 totals) equals the sheet's own summary tab. 7 of 7 matched.

## What it showed

- Carrying the split amount per link is needed. Without it the import guesses, and a wrong guess shows up as an
  over-covered invoice.
- A confirmed payment with a wrong split needs an owner-only way to correct it. The re-import flags such payments and
  does not change them.
- Two further sheets of 36 and 38 records import with no refusals once the amounts are carried.

## Not measured

Speed, larger sheets, more than one currency, re-import after the sheet changes.
