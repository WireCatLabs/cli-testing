# CLI

What the shared command layer in cli-base and cli-core costs every command of every CLI.

- [shared-contract-check](shared-contract-check/README.md): cli-base's check of shared commands, describing each
  command once per pass: one check in tg from 11 to 5 ms warm, building the program from 50 to 35 ms, and a warm
  `run(["--version"])` from 49 to 29 ms, with identical contracts (2026-10-26).
- [mcp-program-build](mcp-program-build/README.md): the command tree an MCP server builds on every tool call, with its
  two self-checks run once per process: a warm build in tg from 12.5 to 6.2 ms and a warm `commands --json` call from
  18 to 12 ms, with identical output (2026-10-29).
- [wcat-umbrella](wcat-umbrella/README.md): two packages that declare the same `wcat` command. npm, pnpm and Volta
  refuse the second install and bun overwrites silently, so `wcat` cannot be a `"bin"` of every CLI; a link cli-base
  makes survives installs and upgrades except pnpm's, and is left dangling on uninstall. `wcat tg` adds 20–70 ms
  over `wcat-tg` (2026-10-30).
- [wcat-umbrella, cross-OS](wcat-umbrella/cross-os.md): cli-base's `wcat` launcher, dispatch and shortcuts on real
  npm, pnpm and bun installs on Linux, macOS and Windows, through bash, cmd and PowerShell. All pass after three fixes
  it found (pnpm 12's bin folder, PowerShell quoting into `.cmd`, bun's leftover `.exe`). The per-start check costs
  0.017 ms; loading it about 2 ms (2026-10-31).
