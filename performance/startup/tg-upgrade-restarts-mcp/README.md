# `tg upgrade` restarts the HTTP MCP server and names the stdio sessions

Run 2026-10-27 on tg-cli `main` (69f9d32) built against cli-core
[#2117](https://github.com/WireCatLabs/cli-core/pull/2117), with the scripts beside this page.

## Why we ran it

The [tg-bundle-upgrade](../tg-bundle-upgrade/README.md) run found that `tg upgrade` restarts only background `serve`
processes. The HTTP MCP server and the MCP sessions over stdio that agent apps start kept running the old version,
and nothing said so. The owner chose to have `upgrade` restart the HTTP server, and name the stdio sessions without
touching them, since only the agent app that started a session can restart it.

The question: after a real `tg upgrade`, does the HTTP server come back on the new version with the limits it had,
and is the stdio session named with its PID and left running?

## Setup

- **Machine.** Linux 7.0.0-38-generic, Node 24.19.0, npm 11.17.0.
- **Isolation.** Its own `HOME`, XDG folders, `MESSAGING_STORE`, `TMPDIR` and npm prefix. No Telegram account: an empty
  session file, fake app keys, a proxy on a closed port. The HTTP server uses port 18765.
- **Builds.** tg-cli `main` with `@wirecat/cli-core` pointed at a pack of the cli-core branch, packed twice with
  `npm pack`: `A` at version 0.100.90, and `B` at 0.100.91 with every chunk renamed (`chunkNames: "[name]-b-[hash]"`
  in `scripts/bundle.ts`), the worst case for an upgrade.
- **The upgrade is the real `tg upgrade`.** It cannot install a tarball, so two things stand in for npm:
  [`fake-latest.mjs`](fake-latest.mjs), loaded with `NODE_OPTIONS=--import`, answers npm's "latest" for tg as
  0.100.91, and [`fake-npm/npm`](fake-npm/npm), first on `PATH`, turns `npm install -g @wirecat/tg-cli@latest` into
  `npm install -g <B>`.
- **What a run does** ([`run.sh`](run.sh)): install A; `tg demo mcp server start --port 18765 --permission
  messages.send=deny`; one stdio session, `tg demo mcp serve`, held open by [`stdio-client.mjs`](stdio-client.mjs)
  after `initialize`; `tg upgrade --json`, then `tg upgrade` again; status; stop both.

  ```sh
  ./run.sh <A.tgz> <B.tgz> 0.100.91
  ```

## Results

| | Before | After `tg upgrade --json` |
|---|---|---|
| HTTP MCP server | PID 2186989, 0.100.90 | PID 2187782, 0.100.91, same port, same `--permission messages.send=deny` |
| stdio session | PID 2187113 | still PID 2187113, running, named in the answer |

The answer:

```json
"mcp_servers": [{ "name": "tg demo", "pid": 2186989, "restarted": true, "from": "0.100.90", "to": "0.100.91", "new_pid": 2187782 }],
"stale_sessions": { "checked": true, "sessions": [{ "pid": 2187113, "version": null }] }
```

and on stderr: `1 MCP session over stdio still runs tg 0.100.90 or older (PID 2187113) — restart them from your agent
app (start a new chat, or reload its MCP servers)`. The second `tg upgrade` found 0.100.91 the newest and restarted
nothing. The upgrade took 4.4 s, the npm install included.

## What it showed

1. **The HTTP server restarts on the new code with its limits.** `mcp server start` saves what it ran beside its
   lock, and `upgrade` runs that again from the new package's `bin`. The new process's command line was
   `… dist/bin/tg.js mcp serve --http --port 18765 --public-url https://laptop.example.ts.net --permission
   messages.send=deny`.
2. **The stdio session is found through the npm bin link.** Its command line names `<prefix>/bin/tg`, a link; the
   check resolves it into the installed package.
3. **Renamed chunks did not break the restart.** It runs in the old process after its files were replaced and loads
   nothing lazily.

## What was not measured

- pnpm and Bun global installs. pnpm puts the version in the package's folder, so the old process may restart the
  server from the old folder; the answer would then show `from` equal to `to`.
- macOS and Windows: their process listing (`ps`, `Get-CimInstance`) ran only in unit tests with fakes.
- A server started by hand or by an older version, and the time-outs: unit tests in cli-core cover them.
- A connected Telegram account.
