# Monthly validation

Every project runs full validation and release-grade security on the first day of each month.
The scheduled workflow is `monthly.yml`; it calls the existing `ci.yml` and pinned
`release-checks.yml`. Tests, coverage floors, build, documentation contracts, parity, Bun, and
platform/browser jobs run where that project's full workflow defines them.
Security includes production dependency audits, workflow analysis, full-history secret detection,
and CodeQL. Messaging includes C/C++ analysis as well as JavaScript/TypeScript and Actions.

## Schedule

| Repository/workflow | First day of each month, UTC |
| --- | --- |
| cli-core / monthly.yml | 02:17 |
| cli-meetings / monthly.yml | 02:24 |
| cli-memo / monthly.yml | 02:31 |
| cli-messaging / monthly.yml | 02:38 |
| cli-tasks / monthly.yml | 02:45 |
| cli-testing / monthly.yml | 02:52 |
| max-cli / monthly.yml | 02:59 |
| tg-cli / monthly.yml | 03:06 |
| zoom-cli / monthly.yml | 03:13 |
| cli-docs / monthly.yml | 03:20 |
| cli-messaging / onnx.yml | 03:27 |
| cli-messaging / sqlite.yml | 03:37 |
| community / security-release.yml | 03:47 |

GitHub runs schedules on the latest default-branch commit. Times are staggered away from the
top of the hour, but GitHub may delay scheduled jobs. The schedule becomes active after merge.
Public repository schedules may be disabled after 60 days without repository activity; check
that they remain enabled when reviewing the monthly results.
See [GitHub's scheduled event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

These workflows contain no package publication or site deployment. Native workflows retain their
existing publication guard: only a manual run with `publish=true` on `main` can publish.
Scheduled native runs therefore build and probe packages without publishing them.
Live messenger checks and agent payload runs remain manual, with a private test cast.

## Run now

In a repository's Actions tab, choose **Monthly validation**, then **Run workflow** on `main`.
To validate a branch before merge, select that branch in the same menu.
For example:

```sh
gh workflow run monthly.yml --repo WireCatLabs/cli-testing --ref main
gh run list --repo WireCatLabs/cli-testing --workflow monthly.yml --limit 5
```

Native probes use their individual workflows with publication disabled:

```sh
gh workflow run onnx.yml --repo WireCatLabs/cli-messaging --ref main -f publish=false
gh workflow run sqlite.yml --repo WireCatLabs/cli-messaging --ref main -f publish=false
```

Community security can be started from its **Security release** workflow without publishing.
For a tests/build-only investigation, run **Full validation** (`ci.yml`) directly.

## Review a failure

1. Inspect the failed job, its source commit, and any uploaded diagnostics or security alerts.
2. Distinguish a code regression from infrastructure trouble. Retry transient downloads or runner
   failures; a failed scanner is an incomplete check, not a clean scan.
3. Fix regressions through a PR and run that branch's full validation before merging the fix.
4. Review noncritical scanner findings privately; keep credentials, account data, and unresolved
   vulnerability details out of public logs and documentation.
5. Do not publish a release while its required validation or critical security checks fail.

Review the Actions results each month. Scheduling does not itself create an issue, send a message,
or guarantee that someone reviewed the results; notifications follow existing GitHub settings.
