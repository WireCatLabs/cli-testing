# Scheduled-series inventory through installed CLI and MCP

We ran this check because an agent needs possible series before it can prepare a selected call.
It checks that the installed Zoom host uses the shared bounded reader, retains uncertainty and
keeps SQLite out of inventory discovery. This is a correctness replay, not a latency benchmark
or a test of an AI agent's series selection.

## Setup and run

The [published Zoom0.26.0](https://github.com/WireCatLabs/zoom-cli/releases/tag/v0.26.0) source is
`a087a544cf5c203c0250238e9990016c601ffda1`, using registry Core0.336.0/Base0.44.2 and one Base identity.
The npm tarball matches validated/publish artifacts at SHA-256
`9c14d03a0d7e6a84aa7a5cd9e05a484f381451f521b0d91f8dccc9dfb1a30d2f`.
The [install lock](install-lock.json) pins registry URLs and integrity, with no local override.

```sh
T=$(mktemp -d -p /var/tmp)
cp performance/agents/meeting-series-inventory/install-package.json "$T/package.json"
cp performance/agents/meeting-series-inventory/install-lock.json "$T/package-lock.json"
HOME=$T MESSAGING_STORE="$T/store" WIRECAT_STATE_DIR="$T/state" TMPDIR=$T \
  NPM_CONFIG_USERCONFIG=/dev/null NPM_CONFIG_GLOBALCONFIG="$T/npmrc" \
  npm ci --prefix "$T" --ignore-scripts --no-audit --no-fund
HOME=$T MESSAGING_STORE="$T/store" WIRECAT_STATE_DIR="$T/state" TMPDIR=$T \
  MEETING_BENCH_LOADED="$T/loaded" MEETING_BENCH_DENIED="$T/denied" \
  node --require ./performance/agents/meeting-workflows/guard.cjs \
  performance/agents/meeting-series-inventory/run.mjs "$T" "$T/results" \
  a087a544cf5c203c0250238e9990016c601ffda1 \
  9c14d03a0d7e6a84aa7a5cd9e05a484f381451f521b0d91f8dccc9dfb1a30d2f published
```

Only public installed exports are imported. The runner refuses an existing output directory and
records caller-supplied provenance; registry/tag/artifact comparison is a separate prerequisite.
The guard refuses network, subprocess and native-keyring access. Injected transport and memory
credentials are invented; the store callback fails if anything tries to open it.

## Results

The [recorded result](results.json) has `candidate: false` and zero external I/O attempts.

| Boundary | Result |
| --- | --- |
| Installed CLI | One provider page with a continuation |
| Old recurring start | Retained as a date hint outside the window |
| Calendar / occurrence proof | Unknown / not read retained |
| Provider join URL | Discarded |
| Offline command | Refused before another request |
| Explicit inventory MCP tool | Advertised and returns a scoped envelope |
| Caller account override | Named refusal before provider access |
| SQLite | Zero open attempts |
| Runtime dependencies | One compatible Base identity |

Core owns the command/tool contract, bounds and paging; Zoom supplies account/credential binding
and transport. This Linux/Node24.19 replay does not establish real Zoom permissions, calendar
completeness or the correctness of a human/agent's series choice. All six installed Linux/Windows/
macOS Node22/24 proofs passed in [the release run](https://github.com/WireCatLabs/zoom-cli/actions/runs/39096825236).
Source tests additionally cover fixed startup scope, malformed/foreign cursors, cancellation and
missing/invalid host grants. Inventory remains separate from occurrence-verifying preparation.
