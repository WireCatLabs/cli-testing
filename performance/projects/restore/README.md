# Published selected annotation restore

Project gathering needs a way to reconstruct selected annotations in an independent test store before
broader extraction comparisons. This check asks whether the released SDK preserves explicit reference
bindings and proposed state, rejects a stale preview and refuses a repeated restore. It supports
adoption by Memo; it does not establish that a live project can be cleared safely.

## Reproduction

Linux x64, Node24.19.0, independently installed published `@wirecat/cli-core@0.374.0`, lifecycle scripts
disabled. Run from this checkout with temporary state on the same line:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T XDG_CONFIG_HOME=$T/c XDG_DATA_HOME=$T/d XDG_CACHE_HOME=$T/k MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/s TMPDIR=$T NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix "$T/package" --ignore-scripts --no-audit --no-fund @wirecat/cli-core@0.374.0 && HOME=$T XDG_CONFIG_HOME=$T/c XDG_DATA_HOME=$T/d XDG_CACHE_HOME=$T/k MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/s TMPDIR=$T node performance/projects/restore/check.mjs "$T/package/node_modules/@wirecat/cli-core/dist/store/index.js"
```

The driver accepts only a package entry, creates its own invented source and target and uses public
store APIs. It seeds destination padding so project, document and author IDs differ, while retaining
an unrelated project's facts. Snapshot and native preview run after both seed writers close.
The store port operates on its existing connection, so it takes no destination filename.

## Result and limits

All retained assertions pass in [result.json](result.json):

- Snapshot and preview preserve source bytes; preview also preserves target bytes.
- Explicit different-ID bindings restore one alias, one proposed fact and one evidence link.
- The bound destination author and two unrelated facts survive.
- A namespace change invalidates the first preview without inserting selected facts.
- A fresh check permits restore; a repeated restore refuses without duplicating the fact.
- External source bodies are omitted; no implicit store or owner data is used.

The registry tarball matches the release CI artifact byte-for-byte, SHA-256
`3cb5bb585803c28420f9a31588fdc4dfd7bf96c6a70d5363531fa815d241be79`.
The source commit, release run, integrity and installed entry hash accompany the assertions.
The earlier [Core0.373 snapshot result](../snapshot/README.md) remains unchanged.

This is functional acceptance of selected project descriptor metadata, aliases, facts and generic
links. Notes, specialized meeting memberships, tasks, memories, labels and findings remain omitted.
It does not measure retrieval quality, model extraction, performance, connector authorization,
full project backup, injected mid-transaction rollback or concurrent processes. Those require
separate fixtures; no live source was reset. Memo CLI/MCP acceptance is a separate host check.

## Check the Memo command boundary

A working SDK does not establish that the CLI publishes a private file, enforces its caller policy
or transports validation errors through MCP. The [Memo0.83 result](result-memo083.json) records a fresh
npm installation with Core0.374, Base0.47.4 and MCP client2.2.0. Its registry tarball matches release
validation, SHA-256 `8df6a8f5c2d290c32e88a21b65f92f30f4bfa29446f3f033164078912d728852`.

Use the retained [manifest](package-memo083.json) and [lock](lock-memo083.json) to reproduce the same
dependency graph rather than resolving newer transitive packages:

```sh
T=$(mktemp -d -p /var/tmp) && mkdir "$T/package" && cp performance/projects/restore/package-memo083.json "$T/package/package.json" && cp performance/projects/restore/lock-memo083.json "$T/package/package-lock.json" && HOME=$T XDG_CONFIG_HOME=$T/c XDG_DATA_HOME=$T/d XDG_CACHE_HOME=$T/k MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/s TMPDIR=$T NPM_CONFIG_USERCONFIG=/dev/null npm ci --prefix "$T/package" --ignore-scripts --no-audit --no-fund && HOME=$T XDG_CONFIG_HOME=$T/c XDG_DATA_HOME=$T/d XDG_CACHE_HOME=$T/k MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/s TMPDIR=$T node performance/projects/restore/check-memo.mjs "$T/package/node_modules/@wirecat/cli-core/dist/store/index.js" "$T/package/node_modules/@wirecat/cli-memo/dist/bin/memo.js" "$T/package/node_modules/@modelcontextprotocol/client" 0.83.0
```

The driver creates both stores through the shared invented fixture; it accepts no existing store.
Export/check/restore run as real CLI processes. Snapshot/preview run through an actual stdio MCP
client, including read-only mode, unknown-field errors and semantic snapshot refusal. It verifies
private export permissions on Unix, preview target bytes, agent restore refusal, repeated restore
refusal, preserved proposed facts and unrelated records. CLI error JSON is on stderr with empty
stdout; successful CLI and MCP answers keep their standard envelopes.

Owner-labelled and agent-labelled processes are exercised only on newly created synthetic stores.
Caller environment labels are a CLI policy, not operating-system isolation. MCP calls retain their
normal audit writes, so only the export's source bytes and the preview's target bytes are compared.
The driver never claims the entire source remains byte-identical after MCP auditing.

The shared fixture was extracted without changing the earlier SDK assertions or frozen results.
This host check adds no retrieval/extraction quality, OAuth, live-source or full-project backup claim.
