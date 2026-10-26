# CLI

What the shared command layer in cli-base and cli-core costs every command of every CLI.

- [shared-contract-check](shared-contract-check/README.md): cli-base's check of shared commands, describing each
  command once per pass: one check in tg from 11 to 5 ms warm, building the program from 50 to 35 ms, and a warm
  `run(["--version"])` from 49 to 29 ms, with identical contracts (2026-10-26).
