# memo

Measurements of `memo`, the CLI that joins what the owner knows across the stored sources.

- [lists-paging](lists-paging/README.md) — `memories`, `facts` and `actions list` past 500 rows with `--page`: a later
  page costs the same as the first, and no brief flag beyond `actions list --brief` is needed (2026-11-10).
- [people-list](people-list/README.md) — `people list` with each person's kind kept in the store (cli-core store
  version 62): 0.7 to 2.4 s down to 30 to 40 ms on 113,000 people, the same answers, and the kind counts in 4 ms
  (2026-11-10).
