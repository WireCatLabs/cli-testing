# Offline CLI contracts

`cli-contract` drives built Node command-line tools and their MCP stdio servers from the outside.
MAX, Telegram, and Zoom keep their plans and reviewed snapshots in `contracts/` in their own
repositories. The shared runner is also exported as `runContracts` from `@wirecat/cli-testing`.

## Toolkit distribution

The first rollout pins the validated
[0.2.0 toolkit preview](https://github.com/WireCatLabs/cli-testing/releases/tag/toolkit-v0.2.0)
tarball as a development dependency, with its SHA512 integrity recorded in each CLI lockfile.
It is the exact artifact checked by release run `38092344081`; npm publication failed after
validation and remains pending the package trusted-publisher configuration. The GitHub preview
tag does not imply that npm version 0.2.0 was published. Repository installs resolve the pinned
asset normally; no local npm login is required to run the contract checks.

## Checks

- Help output matches a reviewed snapshot.
- Discovery is exactly one JSON object or array on stdout, with empty stderr.
- Invalid options and command paths return the documented exit code and one JSON error on stderr,
  with empty stdout and the expected error code.
- MCP initialization and `tools/list` work through the SDK. Tool names, input/output schemas,
  and annotations match reviewed snapshots; descriptions and tool ordering are not frozen.

The first plans cover shared metadata commands and errors. They do not claim coverage of every
command, store migration, messenger protocol, HTTP MCP transport, or live-account behavior.
Those remain separate testing tasks.

## Isolation

Each run starts with a fresh temporary home, config/state/cache directories, and synthetic store
path. Tokens, application credentials, proxy configuration, and the owner's keyring environment
are not inherited. A Node preload guard rejects common network, keyring, and child-process entry
points, and native addons are disabled. An attempted external operation fails the run even when
the command catches its exception. The runner accepts only the current Node executable.

This is a regression-test guard for trusted CLI builds, not a sandbox for arbitrary untrusted code.
Plans must use offline metadata operations. The MCP client only initializes and lists tools;
it never calls a messenger tool. Temporary directories and server processes are closed afterward.
Cases default to a five-second process limit; MCP uses one five-second request budget across
initialization and pagination. Process output has an eight-megabyte limit.

## Run and review

From a CLI repository with its build present:

```sh
pnpm contracts:check
pnpm exec cli-contract contracts/plan.json --update
git diff -- contracts/
```

Ordinary checks never update snapshots. A missing or changed snapshot fails validation.
Use `--update` only when deliberately reviewing a contract change. Output normalization is limited
to line endings and JSON object-key ordering; renamed tools and changed parameter schemas remain
visible. Help snapshots retain command and option descriptions.

Contract checks run during full release, monthly, and manual validation. Local commit/push hooks
and ordinary PR CI keep their existing budgets. The runner returns exit 0 for a passing report,
1 for contract failures, or 2 for setup errors. Reports contain case identifiers and failure reasons;
they do not copy CLI stdout/stderr into public logs.

## Plan format

```json
{
  "command": "node",
  "args": ["../dist/bin/example.js"],
  "cases": [
    {
      "id": "discovery",
      "args": ["commands", "--json"],
      "exit": 0,
      "stream": "stdout",
      "kind": "json"
    }
  ],
  "mcp": {
    "args": ["mcp"],
    "snapshot": "mcp-tools.json"
  }
}
```

Relative executable arguments and snapshot paths resolve from the plan directory.
Add `contains` for a required output fragment, `errorCode` for a structured error, and `snapshot`
to freeze text such as help. MCP is optional for command-line tools without a server.
