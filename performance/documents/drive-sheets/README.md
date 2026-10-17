# Native Sheets CLI acceptance

The owner asked whether Drive can edit spreadsheet cells after the Google connector release
polish. XLSX import/search did not provide live range operations. This check verifies the new
compiled candidate's public command path before shipping it, without using a Google account. Source: [Drive #105](https://github.com/WireCatLabs/drive-cli/pull/105),
candidate `1e3e41a3a9a22c579684ed25428fa7079e59160c`.

## Setup and command

The candidate adds Google's pinned `@googleapis/sheets` 18.1.1 SDK, a SHA-256-verified Sheets v4
Discovery snapshot (revision 20261014), 17 generated methods and five friendly commands. Shared
pins are Core 0.307.0 and Base 0.40.0. The package still reports 0.15.1 because its source changes
are unreleased; this is not evidence that npm 0.15.1 includes Sheets editing.

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state node performance/documents/drive-sheets/run.mjs /absolute/path/to/drive-candidate performance/documents/drive-sheets/results-candidate.json 1e3e41a3a9a22c579684ed25428fa7079e59160c
```

`run.mjs` starts the compiled executable with fresh config/state/store/cache paths and a preload
that refuses sockets, HTTP, browser launch and keyring subprocesses. Inputs use only invented
spreadsheet IDs and cell values. Results record Node, the executable hash and invocation count.

## Results

[Machine-readable result](results-candidate.json): **seven checks, 17 guarded CLI invocations**.

| Boundary | Result |
| --- | --- |
| Account-independent discovery and generated read-only POST effects | Pass |
| Explicit profile required | Pass |
| Exact source/range and formula-render preview | Pass |
| Update, append (`add`) and clear previews identify writes | Pass |
| Unbounded ranges, overflowing rows, unsafe numbers and nested cell objects | Refused |
| Offline/read-only/unknown arguments | Refused before remote execution |
| Raw write acknowledgment and generated body validation | Enforced |

Separate Drive source checks passed 257 unit tests (90.13% lines), 10 CLI/MCP contracts and five
prior-store upgrade cases. The SDK seam tests inspect request URL/body, literal/formula mode,
returned-value requests, repeated ranges and uncertain-write handling; MCP tests reject invalid
cell dimensions and unknown arguments without invoking the provider. Those synthetic source
checks complement this executable test; they are not live Google results.

The command lint baseline stays unchanged. Six dated spreadsheet-domain vocabulary exceptions
remain until the [central cli-base vocabulary](https://github.com/WireCatLabs/cli-base/pull/178) is adopted; zero new unhandled violations.

## What this does not prove

No live Google request, account authorization, cell write or independent live readback occurred.
Enabling Sheets API in the shared OAuth project and testing a dedicated synthetic spreadsheet
remain launch checks. Google data-access verification is independent of these tests.

The friendly commands bound input to 10,000 supplied cells and finite A1 rectangles. Generated
batch operations retain Google's broader request semantics. Append finds a table inside the
search rectangle and can insert rows beyond it; this check does not claim otherwise. The report
also does not measure extraction fidelity, latency or real-model quality.

## Stateful public-client roundtrips

The first executable checks stop at previews/refusals. They do not show a separate read after
an SDK write. `client-roundtrip.mjs` exercises Drive's public compiled package exports
(`createProgram` and `googleApi`) through the pinned Sheets SDK and OAuth transporter. A stateful
in-memory provider responds while the same socket/browser/keyring-subprocess guard blocks real I/O.

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state node performance/documents/drive-sheets/client-roundtrip.mjs /absolute/path/to/drive-candidate performance/documents/drive-sheets/results-client-roundtrip.json
```

[Client result](results-client-roundtrip.json): **four checks, ten in-memory SDK requests**.
Updates have separate readback and unchanged-neighbor assertions. Formula mode is explicit;
null skips a cell. Append destinations are inspected and selected values cleared. An
apply-then-503 append leaves one new row, returns `outcome_unknown` and is not replayed; a
subsequent read observes that single row. Errors do not return the synthetic bearer or provider
body. The source suite adds four equivalent command/SDK boundary cases in
[Drive#107](https://github.com/WireCatLabs/drive-cli/pull/107).

These are public-client integration checks, separate from the 17 actual CLI process invocations
above. The provider fixture does not calculate formulas, reproduce Google's table detection or
model cell formatting. No live Google write, dedicated fixture validation, Cloud project API
setting or data-access approval is established. Published npm 0.15.1 still lacks these commands.
