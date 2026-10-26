# Stored meeting project suggestions

We ran this check to verify that an installed Zoom host can suggest existing projects from a
meeting without saving associations or widening MCP access. This checks SDK wiring and evidence
boundaries, not the quality of an AI agent’s interpretation.

## Setup and run

The recorded package is [Zoom 0.25.0](https://github.com/WireCatLabs/zoom-cli/releases/tag/v0.25.0),
source `55956cc2c3fe36fed7b6a721c22c28ab19acf091`, with registry Core0.334.0/Base0.44.1 and
one Base runtime identity. The downloaded npm package matches both release artifacts:
SHA-256 `80b59c4370096d370d11a6e7d88f9146d71582b93eeab11b6f3688ad0306e21b`.
The [install lock](install-lock.json) contains only registry dependencies and integrity hashes.

```sh
T=$(mktemp -d -p /var/tmp)
cp performance/agents/meeting-project-discovery/install-package.json "$T/package.json"
cp performance/agents/meeting-project-discovery/install-lock.json "$T/package-lock.json"
HOME=$T MESSAGING_STORE="$T/store" WIRECAT_STATE_DIR="$T/state" TMPDIR=$T \
  NPM_CONFIG_USERCONFIG=/dev/null NPM_CONFIG_GLOBALCONFIG="$T/npmrc" \
  npm ci --prefix "$T" --ignore-scripts --no-audit --no-fund
HOME=$T MESSAGING_STORE="$T/store" WIRECAT_STATE_DIR="$T/state" TMPDIR=$T \
  MEETING_BENCH_LOADED="$T/loaded" MEETING_BENCH_DENIED="$T/denied" \
  node --require ./performance/agents/meeting-workflows/guard.cjs \
  performance/agents/meeting-project-discovery/run.mjs "$T" "$T/results" \
  55956cc2c3fe36fed7b6a721c22c28ab19acf091 \
  80b59c4370096d370d11a6e7d88f9146d71582b93eeab11b6f3688ad0306e21b published
```

The guard refuses network, subprocess and keyring access. All project names, aliases and meeting
text are invented. The runner refuses an existing output directory and records caller-supplied
source/hash provenance; registry/tag/artifact verification is a separate prerequisite.

## Results

The [recorded result](results.json) has `candidate: false` and zero external I/O attempts.

| Boundary | Result |
| --- | --- |
| Existing project alias in title | Cited as metadata evidence |
| Project name in transcript | Retained cue reference |
| Association | Explicitly unconfirmed |
| Archive completeness | Unknown retained |
| Raw MCP unknown argument | Named validation error before opening a store |
| Valid MCP answer | Shared envelope with execution metadata |
| Connection lifecycle | Closed before CLI/MCP output |
| Database bytes | Identical before and after reads |

Core owns matching, bounds, vocabulary reads, strict arguments and answer contracts; Zoom supplies
the captured account and read-only connection lifetime. This Linux/Node24.19 replay uses installed
public exports only. It does not test live Zoom, actual account permissions, the native process
MCP opt-in, ambiguity or every truncation case. Those have separate source/release tests; all six
Linux/Windows/macOS × Node22/24 installed proofs passed in
[the release run](https://github.com/WireCatLabs/zoom-cli/actions/runs/39093783066).
