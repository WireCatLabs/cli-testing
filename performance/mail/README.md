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
