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
