# Selected communications in meeting preparation

We ran this check because upcoming-meeting preparation needs evidence from selected messages,
mail and documents without widening access or choosing between conflicting statements. It answers
whether the packed Zoom host can use the shared SDK through public exports, retain citations and
coverage, and leave the existing database unchanged. This is a correctness check, not a latency
benchmark or an evaluation of an AI agent's reasoning.

## Setup and run

The recorded package is published [Zoom 0.24.0](https://github.com/WireCatLabs/zoom-cli/releases/tag/v0.24.0),
source `5a891e9ff71250963a278c83558a513ef00ff15d`, with registry Core 0.332.0/Base 0.43.2 and
one runtime Base identity. The npm tarball matches the validated release artifact byte for byte:
SHA-256 `e5237af71260f3160a72126ea3293469a6123b219046dbcd9b94e38420be523a`.
The [install lock](install-lock.json) pins registry URLs and package integrity; no candidate tarball
or local dependency override is needed.

Run from this repository. Scripts import only installed public exports. All data and credentials
are invented; the injected Zoom transport supplies a canned schedule and makes no HTTP request.

```sh
T=$(mktemp -d -p /var/tmp)
cp performance/agents/meeting-communications/install-package.json "$T/package.json"
cp performance/agents/meeting-communications/install-lock.json "$T/package-lock.json"
HOME=$T NPM_CONFIG_USERCONFIG=/dev/null NPM_CONFIG_GLOBALCONFIG="$T/npmrc" \
  npm ci --prefix "$T" --ignore-scripts --no-audit --no-fund
HOME=$T MESSAGING_STORE="$T/store" WIRECAT_STATE_DIR="$T/state" TMPDIR=$T \
  MEETING_BENCH_LOADED="$T/loaded" MEETING_BENCH_DENIED="$T/denied" \
  node --require ./performance/agents/meeting-workflows/guard.cjs \
  performance/agents/meeting-communications/run.mjs "$T" "$T/results" \
  5a891e9ff71250963a278c83558a513ef00ff15d \
  e5237af71260f3160a72126ea3293469a6123b219046dbcd9b94e38420be523a published
```

The runner records caller-supplied source/hash provenance; it does not establish publication by
itself. This receipt separately verified npm integrity, the source tag and the captured release
artifact. The existing output directory is refused. The preload guard rejects network,
subprocess and native-keyring access; only the injected transport and local store are available.

## Results

The [recorded result](results.json) passed on one freshly created synthetic store.

| Boundary | Result |
| --- | --- |
| Message, mail and document source reads | Three separately cited excerpts |
| Conflicting dated updates | All three retained; no winner inferred |
| Matching message in an unselected account | Excluded |
| Compact field projection | Communications coverage retained |
| Shared SDK and MCP answer | Same communications section |
| Connection lifecycle | Both calls closed their connection |
| Existing store | Identical SHA-256 before and after both reads |
| External I/O attempts | Zero |

The host keeps grant capture and lifecycle wiring; Core owns the read-only store, source readers,
query/window validation, excerpt assembly, budgets and coverage. These results support that split.
The Zoom source suite separately covers raw MCP unknown-field refusal, captured-ID discovery,
configuration mutation and native read-only opener intent.

This guarded run covers Linux x64/Node 24.19, not live Zoom authorization, real archive
completeness, narrower chat/sender grants or AI interpretation quality. It does not refresh
indexes or save facts/tasks. The separate [release validation](https://github.com/WireCatLabs/zoom-cli/actions/runs/39078749960)
passes all four Linux/Windows and Node 22.16/24.19 installed proofs. Zoom's source suite passes
500 cases, with 98.42% lines/93.67% branches; the command matrix has 252 tested cases, one existing
interactive exception and zero missing cases.

The runner's optional fifth argument is `candidate` (default) or `published`; other statuses and
extra arguments are refused. Use `published` only after verifying registry, tag and captured
source. The shared MCP call explicitly opts into communications, as required by Core's newer API.
