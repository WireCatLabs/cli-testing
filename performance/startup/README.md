# Startup

Measurements of what a WireCat CLI costs before it does any work: install size and the time to start.

- [cold-start-and-install](cold-start-and-install/README.md): install size, start time and loaded modules of
  tg, max, memo, drive and zm for `--version`, `--help` and `commands --json` (2026-10-15).
- [what-the-cli-entry-loads](what-the-cli-entry-loads/README.md): which imports keep cli-core's files loaded at
  start, the MCP server moved out of the `cli` entry, and Node's compile cache in tg (2026-10-16).
- [standards-split-before](standards-split-before/README.md): what cli-base's `standards` entry costs `max --version`
  and `--help`, and what a runtime-only entry would leave (2026-10-18).
