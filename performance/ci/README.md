# CI

How long the WireCat repositories' pull-request checks take, and where that time goes.

- [cli-core-test-speed](cli-core-test-speed/README.md): why cli-core's `validation / ci / check` took 7 minutes, and
  the two test-setup costs that made up most of it (2026-10-18).
- [consumer-test-speed](consumer-test-speed/README.md): whether tg-cli, max-cli and whatsapp-cli pay the same two costs
  (they do not), and the cost they pay instead: loading cli-core's `cli` entry in each test file (2026-10-18).
