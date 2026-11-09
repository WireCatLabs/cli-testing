# People

Measurements of cli-core's people: who is listed, and how fast.

- [ties](ties/README.md): can the people list work out every person's tie to the owner on each read? On 51,000
  identities, a first page with its hidden count takes about 95 ms, so cli-core reads the ties on every call and keeps
  no ties table (2026-11-09).
- [kinds](kinds/README.md): what a kind per person, message counts and the newest contact cost the people list. About
  0.5–0.6 s per list on a loaded machine with 1.5 million messages, 1.9 s sorted by the newest contact; a search stays
  under 0.1 s (2026-11-09).
