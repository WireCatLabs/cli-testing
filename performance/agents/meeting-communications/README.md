# Selected communications in meeting preparation

We ran this check because upcoming-meeting preparation needs evidence from selected messages,
mail and documents without widening access or choosing between conflicting statements. It answers
whether the packed Zoom host can use the shared SDK through public exports, retain citations and
coverage, and leave the existing database unchanged. This is a correctness check, not a latency
benchmark or an evaluation of an AI agent's reasoning.

## Setup and run

The recorded candidate is Zoom PR [#156](https://github.com/WireCatLabs/zoom-cli/pull/156), source
`50ead227b0147701ac73e2016f153ebe8cd727b7`, packed after a clean build on Linux x64/Node 24.19.0.
Its package metadata still says 0.23.2; this is an unreleased candidate, not the registry 0.23.2
release. The artifact SHA-256 is
`816749cd16c24c864e3c806ed80adb78bb09ad41d759676a57fdfac6923bb1f5`.
It installs actual registry Core 0.324.0 and Base 0.40.4, with one runtime Base identity. The
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
  50ead227b0147701ac73e2016f153ebe8cd727b7 \
  816749cd16c24c864e3c806ed80adb78bb09ad41d759676a57fdfac6923bb1f5
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
save facts/tasks. Final release adoption still needs the shared vocabulary/source-label updates and
must be rechecked against the dependency versions actually published.
