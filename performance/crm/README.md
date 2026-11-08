# CRM

Measurements of cli-core's CRM sync, which b24 and the other CRM CLIs run.

- [sync-scaling](sync-scaling/README.md) — does saving deals grow linearly on a large portal? Two relationship
  lookups read every link of a deal's owner; a fix halved a 20,000-deal first sync and made per-deal cost flat
  (2026-11-08).
