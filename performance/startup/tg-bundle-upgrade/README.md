# Upgrading tg in place while its servers run

Measured 2026-10-27 on tg-cli, with the scripts beside this page.

## Why we ran it

The next tg release is the first that runs from an esbuild bundle ([tg-bundle](../tg-bundle/README.md)). Its chunk files
have a content hash in their names, and an upgrade deletes the old ones. A `tg serve` or an MCP server started before
an upgrade keeps its old code in memory. It can still need a chunk that it has not loaded yet, and that chunk is no
longer on disk. Nobody had tested this before the release.

The questions:

1. Do a running `tg serve` and a running MCP session keep answering after `npm install -g` replaces the package?
2. Does a restart bring them back on the new version, and do new commands work?
3. Is this worse than before the bundle?

The answers decided whether tg-cli could release the bundle, and led to
[tg-cli#767](https://github.com/WireCatLabs/tg-cli/pull/767).

## Setup

- **Machine.** Linux 7.0.0-38-generic, Node 24.19.0, npm 11.17.0.
- **Isolation.** Each run has its own `HOME`, XDG folders, `MESSAGING_STORE`, `TMPDIR` and npm prefix. The real
  keyring and the systemd user manager are out of reach (`DBUS_SESSION_BUS_ADDRESS` is unset). No Telegram account is
  used. `tg serve` runs offline: it has an empty session file and fake app keys, and its proxy points at a closed
  local port.
- **Builds.**
  - `0.98.0` and `0.99.0` are from npm, from before the bundle.
  - `A` is tg-cli `main` at bd4c46f, packed with `npm pack` (version 0.99.0, the bundle).
  - `B` is the same code at version 0.99.1, with every chunk renamed (`chunkNames: "[name]-b-[hash]"`). Every chunk
    then has a new name, so this is the worst case for an upgrade.
  - `A'` and `B'` are the same two builds with the fix from tg-cli#767.
- **What a run does** ([`run.sh`](run.sh)):
  1. It installs the first build.
  2. It starts `tg demo server start`, then an MCP session over stdio ([`mcp-driver.mjs`](mcp-driver.mjs)). The MCP
     session answers [two requests](calls-before.json).
  3. It upgrades: `npm install -g <second build>`, or the real `tg upgrade` from npm.
  4. The same MCP session answers [twelve more requests](calls-after.json): store reads, the skill, the prompts.
  5. It runs new commands, watches the old serve for 70 seconds, then runs `server restart`, `stop` and `start`.
- **The load trace.** [`trace-loads.mjs`](trace-loads.mjs) is loaded with `NODE_OPTIONS=--import`. It writes down
  every module a process loads from `@wirecat/*`, and every import that fails, with the time and the process ID.

  ```sh
  ./run.sh c-bundle-to-bundle <A.tgz> <B.tgz>
  ./run.sh b-prebundle-to-bundle @wirecat/tg-cli@0.99.0 <B.tgz>
  ./run.sh a-prebundle-tg-upgrade @wirecat/tg-cli@0.98.0 tg-upgrade
  node measure.mjs <dist/bin/tg.js or dist/bundle/tg.js>   # MCP start time and memory
  ```

## Results

| Upgrade | Store reads in the running MCP session afterwards | `tg://skill` | Old serve |
|---|---|---|---|
| 0.98.0 → 0.99.0, `tg upgrade` (before the bundle) | answer; the old process loads the store driver from the new files at the same path | fails: `ENOENT` | keeps running 0.98.0, loads nothing |
| 0.99.0 → B (from before the bundle to the bundle) | answer, as above | fails: `ENOENT` | keeps running 0.99.0, loads nothing |
| A → B (bundle to bundle) | **fail**: `internal_error: command.crashed`. The process asks for `./node-sqlite-CQ33A3R2.js`, which is gone | answers | keeps running, loads nothing |
| A' → B' (with the fix) | answer, as before the upgrade | answers | keeps running; it loaded all 99 chunks 2 s after start |

What else the runs showed:

- **New commands.** After every upgrade, `tg --version`, `tg --help`, `tg demo chats list --offline`,
  `tg bot api --help` and `tg demo doctor` work on the new version. The compile cache writes new entries for the new
  chunks and reads them back on the next run.
- **The skill fails in both runs from before the bundle.** That is not the bundle. 0.98.0 and 0.99.0 read
  `skills/wirecat-tg/SKILL.md`, and tg-cli#763 renamed it to `skills/tg-cli/`. An MCP session that was open across
  that upgrade cannot read `tg://skill` until it restarts.
- **`tg upgrade`.** It runs `npm install -g @wirecat/tg-cli@latest`, then `server restart` for each profile whose
  serve is running. A serve started by hand is warned about, not restarted. `tg upgrade` cannot install a tarball:
  it checks the version on npmjs.org and installs `@latest`. From the code
  ([`upgrade-command.ts`](https://github.com/WireCatLabs/cli-core/blob/main/src/cli/upgrade-command.ts),
  [`lock.ts`](https://github.com/WireCatLabs/cli-core/blob/main/src/background/lock.ts)), it restarts neither a
  stdio MCP session, which the client app owns, nor the HTTP MCP server, which has its own lock.
- **Restart in this offline setup.** `server restart` and `tg upgrade`'s restart timed out after 30 seconds, and the
  old serve kept running. Serve stops after the step it is on, and here that step is a connection that never
  completes. A second `stop` ended it, and `start` then ran the new version (0.99.1, and 0.99.0 in the `tg upgrade`
  run). A serve that is connected was not tested.
- **The cost of the fix.** The MCP server answers `initialize` as fast as before (0.37–0.52 s in three runs each). Its
  memory, 4 s after start, is 273 MB instead of 212 MB. `tg --version` (≈45 ms) and `tg messages list --help`
  (≈250 ms) start as before; short commands load nothing extra.

## What it showed

1. **The bundle made upgrades worse for a long-running process.** Before the bundle, an old process found its files at
   stable paths. It ran a mix of old and new code, and that worked in these runs. With the bundle, a chunk that the
   old process had not loaded yet is gone after the upgrade, and the command fails.
2. **Loading the chunks early was not enough.** Node's resolver checks that the file exists again for each new
   importer, even when the module is already loaded. tg-cli#767 does two things, for `serve`, `watch` and the MCP
   servers only. It loads every lazy chunk 2 s after start. It also resolves imports between chunks without looking
   on disk.
3. **The fix must ship in the bundle's first release.** The next upgrade removes this release's chunks, so the
   process that runs this release must already hold them.

## What was not measured

- A serve or MCP session that is connected to Telegram. `mtcute` stays outside the bundle in the package's
  `node_modules`, so after an upgrade it loads like before the bundle: the new files, from the same paths.
- pnpm and Bun global installs. Bun has no `module.registerHooks`, so the loader only preloads the chunks there.
- A real release-to-release upgrade. Build B renames every chunk. A real release renames only the chunks whose
  content changed.
- macOS and Windows.
