# Published project annotation snapshot check

Project gathering needs a safe way to retain selected annotations before an isolated reconstruction.
This check asks whether the published SDK can read that selection without copying external source
bodies, accepting proposed facts or creating an implicit store. It informs adoption of the read-only
snapshot API; it does not establish that a project can be cleared or restored.

## Setup and reproduction

Linux x64, Node24.19.0, exact published `@wirecat/cli-core@0.373.0`. Install independently with
lifecycle scripts disabled, then run the driver from this checkout:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T XDG_CONFIG_HOME=$T/c XDG_DATA_HOME=$T/d XDG_CACHE_HOME=$T/k MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/s TMPDIR=$T NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix "$T/package" --ignore-scripts --no-audit --no-fund @wirecat/cli-core@0.373.0 && HOME=$T XDG_CONFIG_HOME=$T/c XDG_DATA_HOME=$T/d XDG_CACHE_HOME=$T/k MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/s TMPDIR=$T node performance/projects/snapshot/check.mjs "$T/package/node_modules/@wirecat/cli-core/dist/store/index.js"
```

The driver seeds its own invented project, alias, imported document and agent-authored proposed
statement through the package's public store API. It closes the writer before using the dedicated
read-only snapshot API. It never accepts an existing input store or starts a provider connector.
Its only argument selects the built package entry; it never reads the owner's archive or config.

## Interpretation

The retained result records assertions, not performance or semantic scores:

- Version2 preserves alias provenance and project description.
- Repeating the same snapshot returns the same fingerprint.
- Proposed facts remain proposed, without confirmation provenance.
- External document bodies and local source paths are absent from the snapshot.
- Unknown fields are refused; a missing store is not created.
- Importing the SDK and calling the explicit APIs do not create the implicit `MESSAGING_STORE` path.

This selected format explicitly omits notes, specialized meeting memberships, tasks, memories,
labels and findings. A document hash checks content equality, not its meaning. This check does not
exercise destination preview, atomic restore, alias namespace collisions, OAuth, a live source,
extraction quality or the version2 planner introduced after this snapshot release.

The public fixture is independent of the private gathering request and any retained real-project
references. [Result and release provenance](result.json) record all assertions passing against the published
package. The registry tarball matches the release CI artifact byte-for-byte; its SHA-256 is
`d7fcf5d3f355095e723bfd2d80cca0d3c6435a6d4ad6f69dfb0bd037cc07ada3`.
The initial registry version lookups returned404 while npm propagated the upload; the check ran only
after the version became visible and the downloaded bytes matched validation.
