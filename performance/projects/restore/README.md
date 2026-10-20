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
