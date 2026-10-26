# Drive ingestion into project context

Manual project research found useful Google documents through a connected Drive app, but those reads did
not retain the documents in Memo. Before building another ingestion bridge, this check asks whether the
existing Drive importer already supplies Memo's project evidence command. It does: the missing step in
that research workflow was an explicit bounded Drive sync, rather than another document storage layer.

## Reproduce

Use Node 24 and an isolated install containing exactly Drive 0.17.1 and Memo 0.75.0. Keep npm's original
dependency graphs: Drive uses Core 0.331.0 and Memo uses Core 0.351.0. No dependency override is needed.
Those versions remain the runner's defaults; its original recorded result is unchanged.

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T XDG_CONFIG_HOME=$T/config XDG_DATA_HOME=$T/data XDG_CACHE_HOME=$T/cache MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix $T/packages --ignore-scripts --no-audit --no-fund @wirecat/drive-cli@0.17.1 @wirecat/cli-memo@0.75.0
```

Keep that installation path, then run from the repository root:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T XDG_CONFIG_HOME=$T/config XDG_DATA_HOME=$T/data XDG_CACHE_HOME=$T/cache MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T node performance/projects/drive-context/run.mjs /absolute/install/prefix /absolute/result.json
```

The runner creates its own isolated HOME, XDG, configuration, store, state and temporary paths. It passes
only a small allowlist of environment values to children. Every importer, CLI and MCP process runs under
the existing [external-I/O guard](../../documents/drive-shared-store/guard.mjs), which refuses network,
browser, keyring and further subprocess access. The runner itself starts those explicit local children.
No owner configuration, credential, source document or account is opened.

The only application import is Drive's built public `createProgram` export. Its source-injection option
provides invented source metadata and content; the default index is left intact. Therefore actual Drive
sync, Core ingestion, saved checkpoints and indexing execute, rather than a fixture directly populating
document rows. Memo's compiled executable then creates the project and gathers evidence. A real stdio
MCP process runs `project_evidence` against the same store.

To reproduce another reviewed pair, install those exact stable versions in a separate prefix, then
pass `--drive-version` and `--memo-version`. The runner checks both installed manifests against that
selection and passes the expected pair to synthetic sync children through its environment allowlist.
Inherited version-selection environment variables cannot change the top-level defaults. For example:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T XDG_CONFIG_HOME=$T/config XDG_DATA_HOME=$T/data XDG_CACHE_HOME=$T/cache MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix $T/packages --ignore-scripts --no-audit --no-fund @wirecat/drive-cli@0.18.0 @wirecat/cli-memo@0.76.0
```

Keep that separate prefix and run:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T XDG_CONFIG_HOME=$T/config XDG_DATA_HOME=$T/data XDG_CACHE_HOME=$T/cache MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T node performance/projects/drive-context/run.mjs /absolute/install/prefix /absolute/result.json --drive-version 0.18.0 --memo-version 0.76.0
```

Version options change only the expected artifacts. The synthetic scenario, assertions and external-I/O
guard remain the same. The result records the actual versions, Core dependencies and npm integrities.

## Results

[The pinned registry run](result.json), on Node v24.19.0, passed ten checks:

| Check | Result |
| --- | --- |
| Drive's real ingestion adapter feeds Memo project gathering | Pass |
| Canonical `document:` reference survives ingestion and retrieval | Pass |
| Google URL and source modification time are retained | Pass |
| Explicit Drive profile excludes the other principal | Pass |
| A source modified 200 days ago, imported today, stays outside the default 60 days | Pass |
| Extending discovery to 365 days includes that older document | Pass |
| Unchanged sync fetches zero bodies and keeps the reference | Pass |
| Real stdio MCP returns the same reference and a complete envelope | Pass |
| MCP refuses an unknown argument and names its field | Pass |
| Updates retain identity and change the body; removals stop matching without affecting the other principal | Pass |

The first primary-profile sync fetched two synthetic bodies; its unchanged repeat fetched zero.
The report records exact package versions, original Core versions, npm artifact integrities and executable
SHA-256 hashes. Checks group related assertions; table rows and assertion counts are not test-case counts.

## Reviewed release comparison

The documentation release review found that a syntactically valid gather command could still miss a
just-imported document. Comparing the exact reviewed pairs established whether the missing piece was
Drive ingestion or Memo's search-index catch-up.

| Drive / Core | Memo / Core | Outcome | Measurement |
| --- | --- | --- | --- |
| 0.17.1 / 0.331.0 | 0.75.0 / 0.351.0 | Pass | Original ten-check [result](result.json); default pair rerun also passes |
| 0.18.0 / 0.348.0 | 0.73.0 / 0.348.0 | Fails first assertion | [Diagnostic record](result-old-site.json): expected one hit, got zero, `index-pending`; later checks were not measured |
| 0.18.0 / 0.348.0 | 0.76.0 / 0.358.0 | Pass | Ten checks on the unchanged scenario with explicit version options: [reviewed-pair result](result-reviewed-pair.json) |

The old-site diagnostic came from a temporary copy of the original runner with only its two expected
versions changed and serialization of the first result added. It resolved the registered Drive folder
correctly, had no unread sources, and read zero bytes because the index was pending. Its failure does
not establish anything about the remaining checks. To reproduce that assertion failure with this runner,
install the old pair and pass `--drive-version 0.18.0 --memo-version 0.73.0`; the process exits nonzero
before producing its final success report.

Memo's reviewed upgrade resolves the first-run index gap without manually warming the fixture. The
final pair fetches two synthetic bodies initially and zero on unchanged sync, while preserving source
dates, document references and explicit account scope. Both successful pairs use their original
dependency graphs. No result claims live Google behavior or completeness of a real project archive.

## What this means for the workflow

Once a Drive profile is connected, selected folders can be synced through `drive PROFILE sync`. With the
same shared WireCat store, `memo projects evidence PROJECT --source drive:PROFILE` can already find those
imported documents. Adding a new project ingestion database or exporting and reimporting Markdown would
duplicate existing functionality. Reading a document through a connected app alone does not perform this
sync. Project gathering also does not automatically choose Drive folders or fetch their remote contents.

This check does not certify OAuth, live Google conversion, nested remote-folder discovery, metadata-only
coverage, memory invalidation, annotations, project relationships, AI extraction or proposal review. It does
not exercise the legacy database transfer path. Those remain separate checks; the general cross-tool path
is covered by [Drive shared-store acceptance](../../documents/drive-shared-store/README.md).
