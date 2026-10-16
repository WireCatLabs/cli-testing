# Drive release polish

Before a broader public release, the owner requested a focused bug and documentation pass rather
than repeating expensive tests that had just passed. This run checks setup/discovery, explicit
profiles, validation and old settings through the compiled CLI with synthetic state.

## Setup and reproduction

Drive candidate `e5b5bfb33334bf0039683a4cbc7015052eca1e9e`, package version 0.15.0,
Core 0.301.0 and Base 0.40.0; Node 24.19.0, Linux. This is a built source candidate, not a new npm
release. Install its locked dependencies and build it first, with temporary state:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state pnpm build
```

From cli-testing, supply the built package and an output path:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state node performance/documents/drive-release-polish/run.mjs /path/to/drive-cli performance/documents/drive-release-polish/results.json
```

The runner starts only the supplied executable. Each run creates isolated state. A reused network/
browser/keyring socket guard refuses network and child processes inside Drive. No real credentials,
Google data, model requests or owner database are used. Temporary fixtures are retained.

## Results

Eight executable checks passed; [machine results](results.json) record the binary hash and pins:

- Help, version and command discovery ignore invalid configuration.
- Discovery reports contract 3 and sync's remote-read/local-write effects.
- A profile remains required even with only one configured account.
- A missing cached document fails offline without fetching Google.
- Unknown options fail validation.
- CamelCase settings migrate once, retain private permissions and are not rewritten by a second read.
- Invalid settings name the key and do not print its synthetic hidden value.

The candidate's focused Google SDK, MCP validation, settings migration and CLI-alignment suites
also passed: 36 tests across four files. Typecheck, build, Markdown and lint passed; the two
preexisting spread-argument warnings were removed without changing the lint baseline or guards.
The error-message fix and array append changes are covered by those existing suites; this small
executable run does not measure live export fidelity or model quality.

## Recent checks reused

[Main validation 38978049659](https://github.com/WireCatLabs/drive-cli/actions/runs/38978049659)
passed on `1faec0d9b6708c073e991e6176cdc7f285f14634` on October 16, including coverage,
API generation, CLI/MCP contracts, previous-store upgrades, security checks and Node/Bun package
smoke. It predates these polish changes. The first polish main run exceeded the existing five-second deadline in the 200-other-memories
fixture (229 other tests passed). Isolated profiling measured about 539 ms to seed that fixture
and 24 ms to search locally. No instrumentation was committed.

Follow-up Drive#99 limits fixture concurrency to two workers without reducing records, changing
assertions, increasing deadlines or lowering coverage floors. All 230 tests passed locally with
89.69% line coverage. [Full main validation 38979187896](https://github.com/WireCatLabs/drive-cli/actions/runs/38979187896)
then passed on `e620947ca94bec97e578384cf76e87d1e0c649cf`, including coverage, generated checks,
contracts/upgrades, security and Node/Bun package checks. This confirms the observed CI failure
is resolved on that run; it does not guarantee every future runner has identical timing.

Portal strict checks passed with 1,333 command-reference entries, zero gaps and zero invalid
examples. All 306 portal unit tests, 24 Drive browser cases across EN/RU/ES and seven browser
smoke cases passed. The development server emitted the existing Sidebar key warnings and one
JSON parsing error during home navigation despite passing smoke assertions; a focused recheck
is separate from these results. Full production-export/browser deployment remains its own gate.

The [shared-store acceptance](../drive-shared-store/README.md) and
[real-model synthetic evaluation](../drive-ai-quality/README.md) remain applicable to unchanged
shared retrieval/extraction behavior. We did not repeat model calls or live Google writes.
Dependency advisories and production OAuth approval are separate release checks; these results
do not certify an advisory-free dependency graph or unrestricted Google sign-in.
