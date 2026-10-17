# Selected communications in meeting preparation

We ran this check because upcoming-meeting preparation needs evidence from selected messages,
mail and documents without widening access or choosing between conflicting statements. It answers
whether the packed Zoom host can use the shared SDK through public exports, retain citations and
coverage, and leave the existing database unchanged. This is a correctness check, not a latency
benchmark or an evaluation of an AI agent's reasoning.

## Setup and run

The recorded candidate is Zoom PR [#156](https://github.com/WireCatLabs/zoom-cli/pull/156), source
`fede662715071328e1d35223bd8e7f6465782889`, packed after a clean build on Linux x64/Node 24.19.0.
Its package metadata still says 0.23.2; this is an unreleased candidate, not the registry 0.23.2
release. The artifact SHA-256 is
`919f15b3e6891de6498e0727f8e4397e42c5d36d6ee9d3c1cad4bde9cf250c2a`.
It installs actual registry Core 0.326.0 and Base 0.43.1, with one runtime Base identity. The
[install lock](install-lock.json) retains dependency integrity; only the candidate's local tarball
location is normalized to `candidate.tgz` beside it.

Supply that candidate tarball, then run from this repository. The scripts import only installed
public package exports. All data and credentials are invented; the injected Zoom transport returns
one canned schedule response and never makes an HTTP request.

```sh
T=$(mktemp -d -p /var/tmp)
cp /path/to/candidate.tgz "$T/candidate.tgz"
cp performance/agents/meeting-communications/install-package.json "$T/package.json"
cp performance/agents/meeting-communications/install-lock.json "$T/package-lock.json"
HOME=$T NPM_CONFIG_USERCONFIG=/dev/null NPM_CONFIG_GLOBALCONFIG="$T/npmrc" \
  npm ci --prefix "$T" --ignore-scripts --no-audit --no-fund
HOME=$T MESSAGING_STORE="$T/store" WIRECAT_STATE_DIR="$T/state" TMPDIR=$T \
  MEETING_BENCH_LOADED="$T/loaded" MEETING_BENCH_DENIED="$T/denied" \
  node --require ./performance/agents/meeting-workflows/guard.cjs \
  performance/agents/meeting-communications/run.mjs "$T" "$T/results" \
  fede662715071328e1d35223bd8e7f6465782889 \
  919f15b3e6891de6498e0727f8e4397e42c5d36d6ee9d3c1cad4bde9cf250c2a
```

Verify the supplied tarball against the recorded hash before installing it. The runner records
caller-supplied source/hash provenance; it does not establish that provenance by itself. For a
new candidate, rebuild and pack its exact commit and record its actual hash. The existing output
directory is refused. The preload guard rejects network, subprocess and native-keyring access;
only the injected transport and local store are available.

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

This run does not prove live Zoom authorization, real archive completeness, installed Windows/Bun
behavior, narrower chat/sender grants, or AI interpretation quality. It does not refresh indexes or
save facts/tasks. The candidate uses the actual published vocabulary/source-label fixes and compatible dependency pair.
The final versioned Zoom artifact and platform validation remain separate release gates.


## Registry-pair follow-up

The captured run adopts published Core 0.326.0/Base 0.43.1 and the shared test sandbox rebase. Its
packed production bytes are identical to the independently installed proof before that source-only
rebase. The source suite additionally passes 499 cases, 98.42% lines/93.67% branches and the complete
command matrix (252 tested, one existing interactive exception, zero missing); the registry-pair
SDK/MCP run above checks the installed public boundary without repeating the source suite.

The runner accepts an optional fifth argument, `candidate` (default) or `published`, and refuses
other statuses or extra arguments. This records the supplied artifact's status; it does not verify
npm publication itself. Use `published` only after separately verifying registry, tag and captured
release source. Versioned release acceptance must retain its own source/hash/dependency receipt.
