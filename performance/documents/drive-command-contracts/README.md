# Drive command contracts

The Drive handoff called for file downloads, safer status output and MCP parity. This check asks
whether the compiled CLI exposes those commands, refuses writes before authentication under read-only,
and keeps skipped document names out of status. It supports review of the candidate changes before
an owner-authorized live check or release.

## Setup and reproduction

Run on Linux x86-64 with Node 24.19.0 and pnpm 11.20.0 on 24 October 2026. The candidate uses
Drive 0.26.0's version field and cli-core 0.404.0; the new behavior is unreleased. The tested compiled
candidate corresponds to [Drive PR 175](https://github.com/WireCatLabs/drive-cli/pull/175), including
commit `89e09c1` before its documentation-only follow-up and subsequent rebase.

Build the candidate in its isolated checkout, then pass its binary explicitly:

```sh
node performance/documents/drive-command-contracts/verify.mjs /absolute/candidate/dist/bin/drive.js
```

The script drives the binary from outside. It creates a temporary home, configuration, cache, state
and store with one synthetic profile using an empty private-file credential location. No real account, keyring credential or provider request is needed.
It does not install or upgrade the owner's CLI.

## Results

The run returned `{"checks":15,"passed":true,"live_requests":0}`:

- Download and PDF export previews succeeded; both were refused under `--read-only`.
- Status retained a skipped ID and reason and omitted `SECRET-NAME` metadata.
- Command discovery reported contract 4.
- MCP listed seven expected reads/exports/downloads, omitted the ungranted config setter and used
  snake_case argument names.

The implementation repositories also provide synthetic SDK binary-transport, symlink/overwrite,
authority revocation and journal/output ID regression tests. Their full CI records are in
[Drive PR 171](https://github.com/WireCatLabs/drive-cli/pull/171),
[PR 173](https://github.com/WireCatLabs/drive-cli/pull/173),
[PR 175](https://github.com/WireCatLabs/drive-cli/pull/175) and
[PR 176](https://github.com/WireCatLabs/drive-cli/pull/176).

## Limits

This is an offline contract check, not a speed benchmark or a live Google conversion check.
It does not certify PDF/DOCX/XLSX layout, CSV tab coverage, large downloads or Google Vids.
It does not certify installed-package upgrades; the owner's global installation was untouched.
The CLI version string alone cannot identify these candidate changes; use the commit and PR above.

## Combined candidate acceptance

After the implementation PRs merged, the external script passed all 15 checks again against the
compiled 0.27.0 release candidate, commit `5bf4251` in
[Drive release PR 177](https://github.com/WireCatLabs/drive-cli/pull/177). This remains an unpublished
candidate; no live account was accessed. The fixture uses empty private-file credential storage
inside its temporary home, so MCP scope discovery does not consult the OS keyring.

The [final implementation CI run](https://github.com/WireCatLabs/drive-cli/actions/runs/40100277010)
passed 405 tests with 90.75% line coverage, all CLI/MCP contracts, six historical-store upgrade cases,
and Node/Bun installed-package checks. The command matrix recorded 215 tested command/options,
953 explicit exemptions and zero missing entries. Command lint reported zero new violations;
20 historical baseline entries and ten reviewed exceptions remain. These are synthetic checks,
not evidence of live conversion fidelity or installation upgrades on the owner's machine.


## Published package and approved live checks

The package was published by the mirrors lane before the owner approved this lane's release gate.
[Drive 0.27.0](https://github.com/WireCatLabs/drive-cli/releases/tag/v0.27.0) was published on
24 October 2026 at 14:34 UTC through the [successful release run](https://github.com/WireCatLabs/drive-cli/actions/runs/40102720586).
It includes the handoff changes and mirrors watch, with exact cli-core 0.405.0. Superseded release
draft 177 was closed rather than publishing another version.

A fresh isolated npm installation reported 0.27.0 and passed the 15 offline acceptance checks.
Six relevant compiled modules matched the earlier candidate byte for byte: download, Google API,
remote commands, imported documents, configuration and MCP. This comparison does not claim that
every module or the shared-package pin was unchanged.

The owner explicitly approved bounded read-only Google checks. The same checks passed against the
candidate and the installed npm package. Only aggregate counts and byte sizes are retained here:

| Check | npm package result |
| --- | ---: |
| Uploaded-file download | 3,048,724 bytes |
| Native Doc as PDF | 116,793 bytes |
| Native Doc as DOCX | 11,133 bytes |
| Existing-output refusal | Passed |
| Configured-scope folders inspected | 4 |
| CLI commands | 9 |

There were no Google mutations. These three artifacts come from two source files; they do not certify
all documents, workbook exports, Google Vids, formatting fidelity or the owner's global upgrade path.
The global installation was untouched. Source IDs, names, content and local output paths remain private.

The bounded [live runner](live.mjs) requires a binary, an explicitly chosen profile and `--live`.
Run it only with the account owner's approval. It lists ID/type/size metadata inside selected folders,
visits at most twelve folders, downloads a stored file and exports one Doc to PDF/DOCX. It prints
counts and bytes, and sanitizes failures without printing command output or document identifiers.

## 0.28.0 follow-up and alignment limits

The same external probe passed all 15 checks against the isolated npm installation of
[Drive 0.28.0](https://github.com/WireCatLabs/drive-cli/releases/tag/v0.28.0), with zero live requests.
It was installed by the documentation contract capture; the owner's global CLI remained untouched.
The release pins cli-core 0.406.0 and cli-base 0.50.3. This follow-up does not extend the earlier
approved live observations to 0.28.0 or certify conversion fidelity.

A focused check on source `b8bffc5` plus the documentation correction in
[Drive PR 187](https://github.com/WireCatLabs/drive-cli/pull/187) passed `standards:check`,
`lint:commands` and `docs:check`. Command lint reports 29 violations: 19 baseline entries and ten
explicit overrides (budget ten), with zero new violations. The historical 20-entry result above
belongs to 0.27.0; it is not the current count.

Passing these checks does not certify complete alignment. The source backlog still tracks entity
metadata, shared progress reporting, `bin/release --local`, a default command deadline and upgrades
from an actual previous Drive release (DRV-31, DRV-33 through DRV-36), alongside further maintenance.
The earlier shared-store upgrade fixtures are not evidence of an installed-Drive upgrade.

## Published 0.28.1 and discoverable denied commands

[Drive 0.28.1](https://github.com/WireCatLabs/drive-cli/releases/tag/v0.28.1) includes HTTP MCP and
permission-aware command discovery, using Core 0.408.0 and Base 0.50.3. The
[release workflow](https://github.com/WireCatLabs/drive-cli/actions/runs/40130620975) passed full
validation and platform checks before publishing its verified package.

A fresh isolated npm installation passed 16 external checks with the current discovery mode:

```sh
node performance/documents/drive-command-contracts/verify.mjs /absolute/installation/node_modules/@wirecat/drive-cli/dist/bin/drive.js --availability
```

The result was `{"checks":16,"passed":true,"live_requests":0}`. The probe now verifies that the
ungranted configuration setter stays discoverable with `available: false`, a reason and the
`mcp.authority` key. It also checks the installed `--http`, `--port`, `--public-url` and `--revoke`
options. Permission denial is still required; visibility is not authorization. The original mode
without `--availability` was rerun against 0.27.0 and still passed all 15 historical checks.

A production audit of the fresh npm resolution reported zero vulnerabilities. The owner's global
installation and Google accounts were untouched. The release's synthetic HTTP suite exercised
loopback OAuth, permission checks and shutdown; this external probe does not certify an actual
public tunnel or a ChatGPT/Claude connection, live conversion fidelity or a real installation upgrade.
