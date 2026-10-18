# Startup

Measurements of what a WireCat CLI costs before it does any work: install size and the time to start.

- [cold-start-and-install](cold-start-and-install/README.md): install size, start time and loaded modules of
  tg, max, memo, drive and zm for `--version`, `--help` and `commands --json` (2026-10-15).
- [what-the-cli-entry-loads](what-the-cli-entry-loads/README.md): which imports keep cli-core's files loaded at
  start, the MCP server moved out of the `cli` entry, and Node's compile cache in tg (2026-10-16).
- [standards-split-before](standards-split-before/README.md): what cli-base's `standards` entry costs `max --version`
  and `--help`, and what a runtime-only entry would leave (2026-10-18).
- [standards-split-after](standards-split-after/README.md): the real split (cli-base 0.45.0, cli-core 0.342.0) on
  two builds of max: 6 fewer files and 87 KB less at every start, 7 standards files instead of 13 (2026-10-18).
- [lazy-store-and-services](lazy-store-and-services/README.md): `openStore` and `servicesFor` loaded on first use:
  the `cli` entry loads 618 of cli-core's modules instead of 704 and imports in about 400 ms instead of 430–450;
  tg and max start within noise of before, and their test steps did not measurably change, so the change was not
  merged (2026-10-18).
