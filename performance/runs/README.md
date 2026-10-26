# Recorded runs

Measurements of run records: the `runs` commands that tg-cli and max-cli share through cli-messaging, and what
cli-core writes into a run.

- [search-index](search-index/README.md) — `runs search` and `runs list` before and after the per-day index
  (2026-10-13).
- [secret-masking](secret-masking/README.md) — how many random secrets cli-core 0.442.0 hides by their content,
  and which real ids it hides by mistake (2026-10-26); rerun on 0.444.0, which hides lower-case hex keys
  and names written with a space (2026-10-26).
