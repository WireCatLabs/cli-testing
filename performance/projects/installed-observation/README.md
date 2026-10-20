# Installed project gathering after the document pagination fix

A local project gathering run previously stopped on large documents while continuing to return
checkpoints and charge reserved bytes. This observation asks whether the published fix finishes
the same bounded request and exposes useful document evidence. It informs whether to continue
with source review; it does not score the real project's answers.

## Setup and reproduction

Linux x64, Node 24.19.0, installed Memo 0.79.0, Core 0.367.0 and Base 0.47.1. The Memo registry
package matches the release's validated artifact (SHA-256
`6e1864b1dfbf9f28dd891884ba06eaad5736ac44f30b5e155c957ded8a07ecc5`). Packaged and installed
CLI/real stdio MCP smoke checks passed with invented data and temporary state before the live read.

The private case reuses the earlier explicit start and exclusive end, aliases, questions and
100-item/96-read budgets, allowing at most four CLI invocations per phase. Phases read the existing
index, perform normal catch-up, then repeat. Before/after observed runtime JavaScript and manifests
match. No source fetching, proposal creation, reset or model call is part of these timed phases.

The executed case, installed-tool runner, software observations and result stay in cli-private under
`tools/context-gathering/` and `reports/`. The result's checksum identifies those retained bytes;
it cannot reproduce a mutable archive. Public synthetic reproduction remains in
[large documents](../large-document/README.md).

The one-off projection check uses invented private-label/body sentinels, refuses invalid version
and token metadata, and verifies that distinct paragraphs sharing a reference retain their bytes:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T XDG_CONFIG_HOME=$T/c XDG_DATA_HOME=$T/d XDG_CACHE_HOME=$T/k MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/s TMPDIR=$T node performance/projects/installed-observation/check-projection.mjs
```

Generate the committed totals from the retained private result, offline:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T XDG_CONFIG_HOME=$T/c XDG_DATA_HOME=$T/d XDG_CACHE_HOME=$T/k MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/s TMPDIR=$T node performance/projects/installed-observation/project-totals.mjs /PATH/TO/PRIVATE-MEASUREMENT.json
```

The public script is an allowlisted aggregate projection. It never opens a store or launches an
application. Do not publish the private input: it contains source/account references and query
metadata. The private report is `2026-10-20-installed-project-workflow.md`.

## Results

| Phase | CLI calls | Wall time | Direct refs | Distinct combined refs | Pagination |
| --- | ---: | ---: | ---: | ---: | --- |
| Existing index | 1 | 1,023.13 ms | 67 | 144 | Finished |
| Normal catch-up | 1 | 1,411.83 ms | 67 | 144 | Finished |
| Normal repeat | 1 | 609.80 ms | 67 | 144 | Finished |

Every phase returned 41 messages, 25 documents and one meeting cue, with 119 distinct surrounding
references. Direct and surrounding sets overlap. No continuation or no-progress stop was needed;
no record was excluded as oversized. All three phases returned the same direct references and
excerpt hashes. A bounded project-review snapshot was unchanged, not a whole-store diff.

Each phase charged 1,285,955 primary budget bytes and 35,434 surrounding bytes. Returned direct
excerpts contained 21,481 bytes; 196 distinct surrounding excerpts contained 29,171 bytes. Different
paragraphs can share a document reference, so excerpt bytes are deduplicated by reference **and**
text hash. Charged bytes are reservations, not actual I/O or text shown to an agent. The released
cross-lane large-document reread inefficiency remains separately measured by the synthetic study.

## What this establishes and leaves open

The previous fixed-window observation returned 45 direct/122 combined references and stopped
after a stalled continuation. The new one retains those references and their excerpt hashes and
adds 22 document references. The aliases/window are unchanged, but an additional account is now
registered and the archive is mutable. This is no controlled speedup or exhaustive recall claim.

Finished pagination leaves archive completeness unknown. Native provider discovery, missing source
imports, reading complete relevant passages, project attribution, contradictory versions and
proposal review remain separate work. Agent reading/reasoning, manual tool calls, remote imports,
model accuracy and token costs were not timed. The repeated phase returns evidence again; it does
not establish an incremental AI-analysis cache.
