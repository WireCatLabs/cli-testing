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
- [tg-bundle](tg-bundle/README.md): tg run from an esbuild bundle: a command loads about 55 files instead of about
  1,110 and starts in about half the time (warm `messages list --help` 389 → 192 ms), with every output the same under
  npm, pnpm and Bun once the bundle looks up files and packages from each module's own place; the package grows
  from 0.5 to 3.0 MB (2026-10-27).
- [tg-bundle-upgrade](tg-bundle-upgrade/README.md): tg upgraded in place while `serve` and an MCP session run: from
  bundle to bundle, a running MCP session failed on every chunk it had not loaded yet, where the package from before
  the bundle kept answering; fixed by loading every chunk soon after a server starts (2026-10-27).
- [tg-upgrade-restarts-mcp](tg-upgrade-restarts-mcp/README.md): the real `tg upgrade` restarted the HTTP MCP server
  on the new version with its `--permission` limits, and named the stdio MCP session by PID and left it running
  (2026-10-27).
- [bundle-rollout](bundle-rollout/README.md): the shared `cli-dev bundle` (cli-base 0.64.0) on max, wa, zm, memo,
  drive and cli-template: 43–58% off every warm start, byte-identical under npm and pnpm, a running MCP server survives
  an upgrade between two bundles; about 2.5 MB more to download. tg's own script and the shared command are within
  noise; a server started with a flag before `mcp serve` was missed until cli-base#389 (2026-10-27).
- [packed-install](packed-install/README.md): packed releases installed with npm, pnpm and Bun in isolated directories (2026-10-24).

- [WhatsApp on npm 12](wa-npm12/README.md): whether an unapproved global install hook runs, and the scoped approval flag.
