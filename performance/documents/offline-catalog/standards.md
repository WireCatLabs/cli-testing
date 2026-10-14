# Drive standards gaps

The owner asked whether the output upgrade also established full MAX alignment. This review
separates the shipped compatibility contract from inherited naming findings and newer source
changes, so the next release does not accidentally mix those claims.

## Reviewed artifacts

- Published Drive 0.5.0: exact npm installation, Core 0.268.0, framework 0.27.2, discovery contract 2.
- Previous Drive 0.4.0: exact npm installation, Core 0.265.0, framework 0.27.1, discovery contract 1.
- Published Drive 0.6.0: exact npm installation, Core 0.275.0, framework 0.28.2, discovery contract 3.
  Release commit `11008772bde9bc46910a5b8afcd8173fb4be271f`, published through
  [release workflow 38619750507](https://github.com/WireCatLabs/drive-cli/actions/runs/38619750507).
  Earlier review inspected unreleased main at `d8a74f5`; those source changes were not present
  in npm 0.5.0. The later release has now been checked independently.

All executable checks used synthetic fixtures and temporary state. See [reproduction and
results](README.md#output-migration-acceptance) and [run.mjs](run.mjs). Source review and installed artifact checks are separate evidence; the contract-3 results
come from npm 0.6.0, not an unreleased source build.

## Findings

| Area | Published 0.5.0 | Published 0.6.0 / remaining work |
| --- | --- | --- |
| Config migration | Verified: camelCase loads, rewrites once, preserves permissions | Keep this regression in every artifact check |
| Machine responses | Verified strict item/list envelopes; snake_case search; provider keys retained | Verified contract 3: `effects`, `api_operation`, `meta.complete`, page continuation and JSONL end records; old flags are refused |
| MCP argument failures | Verified over stdio: bad type, unknown field and missing field return named validation errors and are audited without argument values | Same three stdio failure/audit cases passed; local-read MCP tools correctly declare no open-world access |
| Core error registration | Shipped by PR35 with `failureContext`; CLI error envelopes verified here | A core-origin reason/detail round trip remains covered by Drive's own tests, not independently exercised by this runner |
| Command naming and options | 69 inherited findings; no new findings against the checked-in baseline | 10 unknown verbs, 3 resources and 56 option-role findings need review and a shrinking baseline |
| Google conversion and sync | Synthetic catalog/import/search behavior verified | Controlled live edits, moves, removals and native Docs fidelity remain unverified by this run |
| Other runtimes/platforms | Release validation covers Node/Bun package smoke; this run uses Node 24.19.0 on Linux | No independent Windows Google sign-in or live ingestion result here |
| Native developer documentation | The release-tag alignment page still names Core 0.231.0/framework 0.19.4 and says no Drive release exists | Correction prepared in [Drive PR40](https://github.com/WireCatLabs/drive-cli/pull/40); portal review must adopt 0.6.0 and the corrected source guide |

The command lint check was run from the clean PR35 checkout so it could read the exact reviewed
baseline, while targeting the fresh npm executable:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node /var/tmp/drive-check-050/node_modules/@wirecat/cli-base/dist/dev/bin.js lint --cli /var/tmp/drive-check-050/node_modules/@wirecat/drive-cli/dist/bin/drive.js
```

Result: `69 violations — 69 in the baseline, 0 overridden (budget 10), 0 new` and `lint: ok`.
Running outside that checkout reports the same findings as new because it has no baseline;
that is not evidence of a release regression. The baseline and override budget were not edited.

## Order of work

1. Keep contract-3 installed-package acceptance in subsequent release checks. It passed 35 CLI
   invocations and three MCP calls on npm 0.6.0. Validation failures are non-retryable; transient
   provider reads/writes remain covered by native unit tests rather than a live injected failure.
   Reconcile conservative handwritten remote-read effects with generated-operation metadata
   if identical local-effect claims become a requirement.
2. Reduce inherited naming findings in small reviewed batches. Prefer shared vocabulary/role
   definitions when they describe an existing standard; use canonical command names with
   compatibility aliases when a name must change. Google wire parameter names and JSON bodies
   need explicit provider treatment, not arbitrary renaming. Never add an override to hide a finding.
3. Run the [controlled live checklist](live-checklist.md) on an explicitly chosen test account/profile.
4. Add Windows sign-in/install coverage if Windows becomes a release claim. HTTP MCP hosting,
   full upload workflows and background watches remain separate product work, not prerequisites
   for certifying this output migration.

This is a bounded review of these artifacts, not a complete MAX parity audit or a Google API
coverage certification. No live credentials, provider writes or owner account data were used.
