# People

Measurements of cli-core's people: who is listed, and how fast.

- [ties](ties/README.md): can the people list work out every person's tie to the owner on each read? On 51,000
  identities, a first page with its hidden count takes about 95 ms, so cli-core reads the ties on every call and keeps
  no ties table (2026-11-09).
