# Architecture

Published as `@wirecat/cli-testing`, a development dependency of max-cli and tg-cli.

| Path | What |
|---|---|
| [`src/index.ts`](../../src/index.ts) | `SUITE_GROUPS`, the groups every suite belongs to |

## The seams

1. **A CLI is reached from outside only** — its binary, its MCP server over stdio, its packed
   tarball. A CLI supplies a small config file in its own repository; nothing per-CLI lives here.
2. **A run writes a folder** — what was scanned (commits, tool versions, exit codes), the raw output,
   and a report — in the same layout for every run of a suite, so any two runs compare.
3. **Results go where the caller says** — for the owner's CLIs, the private `cli-private`
   repository. This package keeps none.

The order the suites are built in is [`BACKLOG.md`](BACKLOG.md).
