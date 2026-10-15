# Mail

Measurements of reading a mailbox into the shared store with memo.

- [gmail-import](gmail-import/README.md): importing a 305,000-email Gmail account — one email per call against
  batches, a header-only probe, and where Gmail starts throttling (2026-10-14).
- [spam-scoring](spam-scoring/README.md): how much of Gmail's Spam memo's sender score catches, and how many
  replied-to senders it wrongly flags (run 1: 24% of spam caught, 1.6% false alarms, 2026-10-15).
- [indexing](indexing/README.md): why the scheduled sync held memo's lock for hours after 44,000 emails were cut
  to envelopes, and the fix that drains the same queue 266 times faster (2026-10-15).
- [agent-questions](agent-questions/README.md): six everyday questions an agent answers from an imported mailbox —
  1 answered, 3 partly, 2 not found (before the imported years), and what memo made hard (2026-10-15).
