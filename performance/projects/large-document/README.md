# Large project documents: stalled resume reproduction

## Why we ran it

A project-context run repeatedly returned a checkpoint while document lanes made no progress. This isolated
reproduction asks whether the default page byte allowance alone can trigger that behavior. It uses invented
documents and the actual published CLI, without changing the gathering service or its frozen evidence benchmark.

**Classification: known limitation reproduced, not successful large-document retrieval.** The runner exits
successfully only when its assertions reproduce the observed limitation and the separate small control works.
It is a manual diagnostic; it is not added to CI and does not establish acceptable retrieval behavior.

## Setup

Measured 2026-10-19, Node 24.19.0, exact registry Memo 0.76.0, Core 0.358.0 and Base 0.47.1.
Install into an isolated prefix, then run from the repository root:

```sh
S=$(mktemp -d -p /var/tmp large-doc-sdk-XXXXXX) && HOME=$S XDG_CONFIG_HOME=$S/config XDG_DATA_HOME=$S/data XDG_CACHE_HOME=$S/cache MESSAGING_STORE=$S/store WIRECAT_STATE_DIR=$S/state TMPDIR=$S NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix "$S/prefix" --ignore-scripts --no-audit --no-fund --save-exact @wirecat/cli-memo@0.76.0 @wirecat/cli-core@0.358.0 @wirecat/cli-base@0.47.1
T=$(mktemp -d -p /var/tmp large-doc-run-XXXXXX) && HOME=$T XDG_CONFIG_HOME=$T/config XDG_DATA_HOME=$T/data XDG_CACHE_HOME=$T/cache MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T node performance/projects/large-document/run.mjs "$S/prefix" "$T/result.json"
```

The runner refuses an existing store. Public SDK methods seed a folder-imported document of 95,200 UTF-8
bytes. Its project name, key and three aliases produce five matching lanes. A separate small document names
a different control project. Source bodies remain inside the temporary synthetic store; results contain
only aggregate measurements, unit states and artifact integrity, without bodies or opaque checkpoints.

The existing [external-I/O guard](../../documents/drive-shared-store/guard.mjs) wraps seeding and every actual
Memo CLI subprocess. It refuses network, browser/keyring subprocesses and sockets. Installation alone needs
the registry. No owner store, login, source fetching, MCP request or AI processing is involved.

## Results

[`result.json`](result.json) records the exact measured artifacts and three invocations: the initial command
and at most two resumes using its returned checkpoint and the same arguments.

| Invocation | New references | Unit pages | States | Charged bytes this call | Cumulative charged bytes | Excerpt bytes |
| --- | --- | --- | --- | --- | --- | --- |
| Initial | 0 | Five lanes, all 0 | All read-limited / validation_error | 327,680 | 327,680 | 0 |
| Resume 1 | 0 | Unchanged | Unchanged | 327,680 | 655,360 | 0 |
| Resume 2 | 0 | Unchanged | Unchanged | 327,680 | 983,040 | 0 |

Each invocation reports a checkpoint and `complete: false`; `stopped` is null. Its ordinary JSON output is
roughly 3.6 KiB, including coverage and the checkpoint, while no excerpt is returned. The separate small
control returns one reference and charges 184 bytes across its two search lanes. That confirms seeding,
source selection and ordinary indexed retrieval function in this same isolated store.

## Interpretation and limits

The default page allowance is 65,536 bytes. This document exceeds it even before reference/metadata overhead.
The inspected reader checks matching page bytes before hydration; a failed read reservation is charged
conservatively. **Charged bytes are not returned excerpt bytes or proof that the whole document was hydrated.**
The three observations show repeated non-progress for this unchanged source/request. They do not measure an
infinite run, all possible resume options, peak memory or runtime performance.

The producer needs a separately reviewed recovery contract for an oversized item or page: useful partial
evidence, an explicit bounded alternative, or a terminal actionable condition. This reproduction prescribes
no fix and does not alter orchestration, byte budgets, indexing policy or proposal semantics. A page with
many smaller matching records may behave differently; this fixture isolates one oversized matching document.
It does not claim complete project coverage, full history, semantic extraction or successful recovery.
