# Mail

Measurements of reading a mailbox into the shared store with memo.

- [gmail-import](gmail-import/README.md): importing a 305,000-email Gmail account — one email per call against
  batches, a header-only probe, and where Gmail starts throttling (2026-10-14).
- [spam-scoring](spam-scoring/README.md): how much of Gmail's Spam memo's sender score catches, and how many
  replied-to senders it wrongly flags (run 1: 24% of spam caught, 1.6% false alarms, 2026-10-15).
- [spam-scoring/stored-mail](spam-scoring/stored-mail/README.md): how much stored mail ranking by the sender score
  would push down, and the false alarms that measurement found.
- [indexing](indexing/README.md): why the scheduled sync held memo's lock for hours after 44,000 emails were cut
  to envelopes, and the fix that drains the same queue 266 times faster (2026-10-15).
- [search](search/README.md): why searches with `NOT mailbox:bulk` never answered on a 257k-email store, and the
  same searches after cli-core 0.295.0: 67 s → 0.7 s (2026-10-16).
- [agent-questions](agent-questions/README.md): six everyday questions an agent answers from an imported mailbox —
  run 4: 2 answered, 2 partly, 2 not found (before the imported years), and what memo made hard (2026-10-16).
- [types](types/README.md): what typing every email costs cli-core's store (store version 76) — 100,000 emails typed
  on the first filtered read in 1.7–11.6 s, one batch of 5,000 under the write lock in 0.1–0.6 s; the first
  `type:` search in 18 s on a writable open, 1.5–1.8 s on a read-only one, warm 33–105 ms (2026-11-26).
- [rules](rules/README.md): what mail sorting rules cost cli-core's store (store version 77) — 50 rules add about 0.35 s
  per 100,000 emails typed, a `gmail.com` rule over 30,000 emails applies in about 1 s plus 1.5–2 s on the next typed
  read, and moving 500 senders to bots takes 4–6 s (2026-11-25).
- [subscriptions](subscriptions/README.md): cli-core's Subscriptions read, broadcast mail grouped by List-Id and paged
  in SQL, and the bots filter by what they send — 100,000 emails in 1,600 groups: a warm page of 50 in 162 ms, 500 in
  132 ms, no store version needed; bots filters under 60 ms (2026-11-26).
