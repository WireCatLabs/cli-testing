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
- [fast-start](fast-start/README.md): a bare `--version` answered before the program loads (56–73 ms in tg, max
  and wa, from 0.6–1.0 s), tg's mtcute and drive's Google libraries loaded on first use, what still loads, and a
  bundle of tg (2026-10-25).
- [where-the-time-goes](where-the-time-goes/README.md): where a tg command's ~450 ms goes (83% importing about
  1,110 files, a third of the CPU resolving imports, 10% building the program), what serve and MCP pay per request
  (~11 ms of a 20 ms request rebuilds the program), whether the compile cache is hit, and the options; none was a
  quick win (2026-10-27).
- [packed-install](packed-install/README.md): packed releases installed with npm, pnpm and Bun in isolated directories (2026-10-24).

- [WhatsApp on npm 12](wa-npm12/README.md): whether an unapproved global install hook runs, and the scoped approval flag.
