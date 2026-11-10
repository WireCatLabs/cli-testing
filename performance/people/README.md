# People

Measurements of cli-core's people: who is listed, and how fast.

- [ties](ties/README.md): can the people list work out every person's tie to the owner on each read? On 51,000
  identities, a first page with its hidden count takes about 95 ms, so cli-core reads the ties on every call and keeps
  no ties table (2026-11-09).
- [ties-senders](ties-senders/README.md): what counting a chat's message senders as its people costs. With 400,000
  messages, a page's ties take 0.7 ms when asked per person and about 93 ms when every message is read; one pass for
  every person takes about 130 ms. cli-core 0.630.0 does the first for a page and the second for everyone (2026-11-10).
- [kinds](kinds/README.md): what a kind per person, message counts and the newest contact cost the people list. About
  0.5–0.6 s per list on a loaded machine with 1.5 million messages, 1.9 s sorted by the newest contact; a search stays
  under 0.1 s (2026-11-09).
