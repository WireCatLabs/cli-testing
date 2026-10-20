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

## Follow-up: import coverage and the newer runtime

A native selected-folder import finished outside the timed phases, and selected missing messages
were retrieved. A new observation reused the request on Memo 0.79.0/Core 0.367.0, then another used
published Memo 0.81.0/Core 0.370.0. The archive and index remain mutable. The three phases in each
observation returned the same direct reference and excerpt-hash sets.

| State | Direct / combined refs | Calls per phase | Pagination | No-progress stop |
| --- | ---: | ---: | --- | --- |
| Earlier 0.79 observation above | 67 / 144 | 1 | Finished | No |
| After source import, 0.79 | 92 / 92 | 3 | Incomplete | Yes |
| After source import, 0.81 | 93 / 170 | 1 | Finished | No |

The 0.79 follow-up adds 25 documents and retains all previous direct references, but one search
unit remains partial with a validation error. Empty continuations stop after unchanged progress.
An initial attempt failed before writing a completed measurement and is retained privately too.
The 0.81 observation retains all 92 direct references and their excerpts, adding one document;
no unit stalls. Source imports are separate from pagination, and a larger direct count alone does
not establish better surrounding context or answer quality.

The 0.81 phases took 1,020.28 / 1,063.35 / 1,131.05 ms, including their single CLI invocation.
Those timings are observations, not a controlled version comparison or end-to-end workflow cost.
The registry package matches its validated release artifact (SHA-256
`e88a1b8290435b37e2175d5d1931980bf0d77dab26a2336dfa996cccbb08e8d1`), and packaged/installed
CLI and stdio MCP smoke checks pass on invented data with temporary state. Initial registry tarball
404s resolved before the registry bytes were compared. Runtime fingerprints match within each trial.

[0.79 after import](post-import-079-totals.json) and [0.81 after import](post-import-081-totals.json)
are produced by the unchanged aggregate projector above. Each includes its private measurement
checksum, three phase totals and qualifications. Neither includes the project's name, query,
source references, source text, per-question answers or labels. Original totals remain unchanged.
Finished pagination still leaves remote completeness and semantic interpretation unknown; source
review and proposed-finding decisions are separate from this measurement.

## Second project on Memo 0.84.0

The owner asked whether gathering works beyond the first project. A second existing project has a
confirmed key document and person relationship. Its key document supplies alternative names and a
warning that some matching documents were copied into another project. The test asks what ordinary
name/key gathering finds, and how explicit name/contact hints change its candidate set.

Linux x64, Node 24.19.0, installed registry Memo 0.84.0/Core 0.377.0/Base 0.47.4;
[release run](https://github.com/WireCatLabs/cli-memo/actions/runs/39485604512) succeeded.
A fixed exclusive cutoff and 60-day window are reused throughout. Each invocation allows 100 items
and 96 reader pages; each phase permits at most four invocations. The expanded request adds three
alternative names and one existing person reference without saving aliases or relationships.

| Request | Direct refs | Messages / documents | Calls per phase | Phase wall times, ms | Pagination |
| --- | ---: | ---: | ---: | --- | --- |
| Existing name/key | 80 | 10 / 70 | 2 | 2,220.24 / 2,638.03 / 1,791.54 | Finished |
| Added names/contact | 115 | 15 / 100 | 4 | 3,623.69 / 3,539.47 / 3,635.13 | Finished |

All 80 original references remain; 35 are added. The expanded set labels 114 as project candidates
and one as person-only. These labels explain matching lanes, not verified membership. Within each
request, all three phases return identical direct reference/excerpt-hash sets and zero duplicates.
The bounded project-review view is unchanged. Expanded-run before/after runtime fingerprints match;
the baseline was not bracketed by a software fingerprint. No claim of whole-store immutability follows.

Finished pagination is not finished reading: 76 baseline and 107 expanded excerpts are truncated.
Eleven baseline and three expanded hits report surrounding-context issues. Internal notes are
reported unread. No meetings matched; this does not establish complete meeting coverage.
A bounded qualitative read found a document explicitly warning that its files describe another
project: name matching usefully retrieves a warning but cannot decide the document's project membership.
No semantic accuracy, blind recall, token savings, current business state or controlled speedup is measured.

Re-run the exact retained private cases only against the installed released binary, using a new
private result path. This intentionally reads the selected real archive; synthetic checks keep temporary
HOME/store/state instead. The script requires explicit opt-in, pins package versions, refuses an existing
output before any archive read, retains references/hashes/coverage, and never writes source bodies:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=/path/to/selected/home TMPDIR=$T node performance/projects/installed-observation/measure-local084.mjs --live-local /PRIVATE/case.json /PRIVATE/new-result.json /ABSOLUTE/installed/memo
```

Project public totals with the unchanged projector above. Cases, runtime fingerprints, source references,
manual reading notes and results are private in `2026-10-20-second-project-gathering.md`.
[Baseline totals](second-project084-base-totals.json) and
[expanded totals](second-project084-expanded-totals.json) contain aggregate counts and input checksums only.
The earlier measurements, cases and frozen synthetic benchmarks remain unchanged.

The exact executed source is retained privately as `measure-pmed084.mjs`, matching each recorded
runner checksum. The public runner differs only in sorted import names for repository lint.
An isolated occupied-output check refused with EEXIST before any Memo invocation; the existing
aggregate projection sentinel checks pass unchanged.

## Detailed audit correction

The [audit](../gathering-audit/README.md) reports previously omitted oversized exclusions (four/six),
measured command totals and a provisional review. Its lane reconciliation corrects the first-emission
114 project/one person-only count above: the later matched-again metadata gives all115 project lanes.
That is search provenance, not accepted membership. Original measurements remain unchanged.
