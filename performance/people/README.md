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
- [bots](bots/README.md): what moving programs off people costs (cli-core store version 75). With 20,000 program
  senders, the first list holds the write lock for about 1 s, the upgrade from version 74 takes 0.3–3.2 s, and warm
  pages of people and bots stay under 60 ms (2026-11-25).
- [newsletter-bots](newsletter-bots/README.md): what making senders of a newsletter only bots costs (cli-core
  `feat/newsletter-bots`, owner's ruling of 2026-11-25). With 20,000 such senders, the check that gives a bot back after
  a 1-to-1 mail costs 31–51 ms under the write lock on each kept list. The first list takes 3.2–13 s on a machine at
  load 15 to 52 (2026-11-26).
