# CI

How long the WireCat repositories' pull-request checks take, and where that time goes.

- [cli-core-test-speed](cli-core-test-speed/README.md): why cli-core's `validation / ci / check` took 7 minutes, and
  the two test-setup costs that made up most of it (2026-10-18).
- [consumer-test-speed](consumer-test-speed/README.md): whether tg-cli, max-cli and whatsapp-cli pay the same two costs
  (they do not), and the cost they pay instead: loading cli-core's `cli` entry in each test file (2026-10-18).
- [test-shards](test-shards/README.md): splitting tg-cli's and max-cli's test runs across 4 runners — the tests take
  half the time, but the whole run barely moves while every job waits for one of the account's 20 runners (2026-10-26).
- [lazy-store-and-services](../startup/lazy-store-and-services/README.md): whether loading cli-core's store and
  services on first use shortens the consumers' test steps (it does not, measurably; the change was not merged) and their start (2026-10-18).
