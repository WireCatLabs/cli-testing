# Isolated project annotations: a synthetic reconstruction proof

## Why we ran it

Project gathering needs a way to compare manually recorded context with later runs without clearing shared
people or source history. Existing document transfer is collection-scoped; it is not a project export.
This proof asks whether a small existing annotation subset can be reconstructed through published SDK
methods with explicit reference bindings. It informs a later export design, not retrieval quality.

## Setup

Node 24.19.0, exact registry Core 0.358.0 and Base 0.47.1. No checkout imports, remote accounts or model calls.
The runner checks package versions and records registry integrity. Install the SDK in an isolated prefix:

```sh
S=$(mktemp -d -p /var/tmp isolated-state-sdk-XXXXXX) && HOME=$S XDG_CONFIG_HOME=$S/config XDG_DATA_HOME=$S/data XDG_CACHE_HOME=$S/cache MESSAGING_STORE=$S/store WIRECAT_STATE_DIR=$S/state TMPDIR=$S npm install --prefix "$S/prefix" --ignore-scripts --no-audit --no-fund --save-exact @wirecat/cli-core@0.358.0 @wirecat/cli-base@0.47.1
T=$(mktemp -d -p /var/tmp isolated-state-run-XXXXXX) && HOME=$T XDG_CONFIG_HOME=$T/config XDG_DATA_HOME=$T/data XDG_CACHE_HOME=$T/cache MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T node performance/projects/isolated-state/run.mjs "$S/prefix" "$T/result.json"
```

Run from the repository root. Use a fresh HOME for every run; existing fixture stores are refused.
Only installation needs the registry. The runner disables `fetch` and uses local public SDK methods.
The tiny stores and a derived-only manifest remain in that temporary HOME; nothing is deleted or reset.
Only synthetic data is created. The output path selects the aggregate report, not a source export.

[`fixture.mjs`](fixture.mjs) independently constructs each baseline with one person, one shared document,
the target project and an unrelated project. The unrelated project already has its own accepted fact and
links to the shared person and document. Target stores have padding records so project/document IDs differ
from the source. The source then receives these explicitly selected annotations:

- One project alias, deliberately specified by the fixture as an owner decision.
- One suggested project-to-person relationship and one suggested key-document link.
- One agent-proposed fact, with a source reference and bot/model provenance.

[`annotations.mjs`](annotations.mjs) serializes only that supported subset, preserving proposal states,
reference evidence and link provenance. It requires explicit bindings to the target project, person and
document. It does not create, merge, claim or delete those reused entities. Missing bindings and a target
already holding annotations are refused. A fresh independently seeded target is used for each reconstruction;
there is no same-target retry or reset implementation.

## Results

Measured 2026-10-19; [`result.json`](result.json) records **11 passing checks** and exact artifact integrity.
Each target reused three entities and reconstructed one alias, two unconfirmed links and one proposed fact.

| Check | Result |
| --- | --- |
| Manifest excludes raw source text and declares its limited scope | Pass |
| Missing bindings are refused before annotation writes, for both targets | Pass |
| Logical annotations match despite different source/project IDs, for both targets | Pass |
| Shared person, source and unrelated annotations remain unchanged, for both targets | Pass |
| Suggested links/facts remain unconfirmed, for both targets | Pass |
| Source annotations and shared state remain unchanged | Pass |
| An over-bound subset is refused instead of silently truncated | Pass |

The recorded manifest digest identifies that run's synthetic artifact; it is not a portable project identity.
The subset has a maximum of eight aliases, links or facts. Fact reads request nine records to detect overflow;
the bounded vocabulary call must report complete coverage. Any overflow aborts capture. `truncated: false`
means only that this supported subset fit; it never claims that all project data was exported.
`notes.links` has no pre-read limit: the maximum is an assertion over this trusted tiny invented fixture,
not a bounded production exporter. The shared source is a folder-imported document created by
`saveFileNote`, not a live Drive fetch.

## What this establishes, and what remains

Published APIs can reconstruct this selected annotation subset with remapped references while preserving
review state. Copying the owner's store or deleting a project is unnecessary to establish that much.
The comparison uses logical annotations and bound entities, not original annotation IDs or creation times.

This is a development acceptance runner, not a production importer. It accepts only its own synthetic
manifest and does not provide general input validation, atomic multi-operation rollback, conflict resolution,
same-target idempotency, concurrent-source snapshots, or complete graph traversal. Source reads are not
wrapped in a cross-area snapshot; the fixtures have no concurrent writers. It does not establish immutable
history fidelity or run ownership. It excludes tasks and their dependencies, tags, memories, generalized
findings, revisions, original derived-record IDs and timestamps. A fact's evidence reference is retained;
its original confirmation/history metadata is not replayed.

Generic proposal staging and generalized findings remain separate work. A production export/restore design
still needs explicit ownership, shared dependencies, complete bounded enumeration, stale-source/conflict
handling and replay semantics. No production command, migration, proposal schema, owner dataset, retrieval
benchmark or AI processing was added here.
