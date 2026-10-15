# Drive decision history

Drive could record a decision but could not record its replacement or that it stopped holding.
This check asks whether the new commands preserve history, respect document/account boundaries
and behave the same through an installed executable as through the shared store.

## Repeat

Install the exact published package into temporary state, then give the runner its package directory:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix "$T/installed" --ignore-scripts --no-audit --no-fund @wirecat/drive-cli@0.13.0
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state node performance/documents/drive-decisions/run.mjs /absolute/path/to/installed/node_modules/@wirecat/drive-cli
```

Use the first command's installation path in the second command. The runner creates a separate
synthetic config, database and snapshots under `/var/tmp`. Core's public store API seeds the fixture;
all checks invoke the installed Drive bin in a child process. The child preloader denies fetch,
HTTP requests, subprocesses and keyring construction. No Google account is connected.

## Results

The [released result](results-released.json) records 24 executable invocations of Drive 0.13.0,
with exact Core 0.294.0 and Base 0.35.0 dependency pins. [npm metadata](npm-integrity.json)
records the published version and integrity. Source changes shipped in
[Drive #87](https://github.com/WireCatLabs/drive-cli/pull/87).

| Case | Result |
| --- | --- |
| Agent proposal before review | Earlier decision remains accepted; proposed decision cannot be reversed |
| Confirmation | Replacement becomes accepted and earlier decision becomes superseded |
| Owner replacement | Accepted immediately, retaining the earlier reference and normalized event time |
| Different document/account | Reversal and replacement refused; no extra fact or status change |
| Dry-run/read-only | Accepted decision remains unchanged |
| Offline reversal | Reversed status persists in a subsequent process |
| Ordinary fact/unknown argument | Refused; decision history remains queryable |

The runner checks behavior with synthetic local records. It does not measure live Google access,
remote writes, AI accuracy or model transfers. MCP filtering and public command effects are covered
by Drive's source tests; this runner measures CLI execution only.
