# Importing a 305,000-email Gmail account

## Why

The owner asked memo about trips, homes and years abroad, and memo found nothing: only the last 30 days of mail
had been imported. Importing everything then failed at once ("Maximum call stack size exceeded"), and after the
fix it read one email every ~2 seconds — more than a week for the whole account. The questions: how fast can
memo read Gmail, what does Gmail allow, and is it worth downloading all of it? The answers fed memo 0.25.0
(batched reading, a header-only probe, keep/skip rules, Takeout mbox accounts).

## Setup

- One gmail.com account (not Workspace): 305,550 emails, 22.9 GB (sizes from IMAP `RFC822.SIZE`), median
  38 KB, 176 emails over 10 MB, the largest 46.7 MB.
- Linux laptop, Node 24.19.0, himalaya 2.2.1 over IMAP, a machine under heavy load from other work (load
  average 25–55 during the runs).
- memo 0.24.0 (one `himalaya message read` per email) against memo 0.25.0 (`himalaya imap fetch` of up to 50
  emails or 20 MB per call); all with `--no-embed`.
- Commands: `memo sync --mail --account <account> --since-time 2004-01-01 --limit 5000 --no-embed --json`;
  [probe.sh](probe.sh) for the probe.

## Results

| What | Result |
|---|---|
| One email per call (memo 0.24.0) | 300 emails in 733 s — 2.4 s per email |
| One `imap fetch` of 36 emails | 1.8–2.2 s — about 0.06 s per email |
| Batched import, fetch and parse only, 300 emails (33 MB) | 25–31 s, parse 0.8 s |
| Batched import into the store, first 5,000 emails | 1,030 s including listing 305,000 emails — ~5 emails/s |
| Same, after Gmail began throttling | 5,000 emails in 19,893 s — ~0.25 emails/s |
| Header-only probe of the whole account (`memo mail probe`) | 305,550 emails in 950–1,580 s, ~600 MB peak memory |
| Store size per email (text, word indexes, no vectors) | ~9 KB — the whole account ≈ 2.8 GB, not 22.9 GB |

What the probe saw, totals only: 21,815 sender/list groups; 57% of emails carry `List-Id`, `List-Unsubscribe`
or `Precedence: bulk`; 380 groups that memo's rule suggests skipping (≥20 emails, ≥80% list or bulk, never
written to) hold 41% of all email; 69% was never opened.

## What it showed

- Batching removes almost all of memo's own cost: the time per email was the process and IMAP login per call.
- Gmail, not memo, is the limit. Answers began carrying `[THROTTLED]` after roughly 1 GB in a day (≈0.4 GB of
  mail plus two header probes) — below the 2,500 MB/day Google publishes for Workspace accounts
  ([Gmail bandwidth limits](https://knowledge.workspace.google.com/admin/gmail/gmail-bandwidth-limits)); the
  consumer limit is not published. Throttled, IMAP gives ~20,000 emails a day.
- For years of mail, a Google Takeout mbox is the practical source; IMAP keeps the newest mail current.
- Probing headers first is cheap (~300 bytes an email) and shows most mail is automated, so skipping it saves
  both the download and the store.

## Not measured

- The exact Gmail threshold and how long throttling lasts; whether it is per hour, per day or per connection.
- Import from a Takeout mbox (the file had not arrived).
- Embedding (search by meaning) of the imported mail.
- Search quality on the full mailbox.
