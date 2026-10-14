# Drive standards gaps

The owner asked whether the output upgrade also established full MAX alignment. This review
separates the shipped compatibility contract from inherited naming findings and newer source
changes, so the next release does not accidentally mix those claims.

## Reviewed artifacts

- Published Drive 0.5.0: exact npm installation, Core 0.268.0, framework 0.27.2, discovery contract 2.
- Previous Drive 0.4.0: exact npm installation, Core 0.265.0, framework 0.27.1, discovery contract 1.
- Source snapshot: Drive main `d8a74f57ccce957505ac7bd54ed6368b12892799`, containing PRs
  [36](https://github.com/WireCatLabs/drive-cli/pull/36) and
  [37](https://github.com/WireCatLabs/drive-cli/pull/37). It pins Core 0.273.0/framework 0.28.1.
  Its package version still says 0.5.0, but these changes are marked Unreleased. That does not
  make them part of the npm 0.5.0 artifact.

All executable checks used synthetic fixtures and temporary state. See [reproduction and
results](README.md#output-migration-acceptance) and [run.mjs](run.mjs). The source snapshot was
read for this comparison, not built or certified by this run.

## Findings

| Area | Published 0.5.0 | Newer source / remaining work |
| --- | --- | --- |
| Config migration | Verified: camelCase loads, rewrites once, preserves permissions | Keep this regression in every artifact check |
| Machine responses | Verified strict item/list envelopes; snake_case search; provider keys retained | Source adds contract 3, `effects`, `api_operation`, `meta.complete`, page paging and JSONL end records; test the next exact package before claiming those are shipped |
| MCP argument failures | Verified over stdio: bad type, unknown field and missing field return named validation errors and are audited without argument values | Keep the protocol test outside Drive as well as its unit suite |
| Core error registration | Shipped by PR35 with `failureContext`; CLI error envelopes verified here | A core-origin reason/detail round trip remains covered by Drive's own tests, not independently exercised by this runner |
| Command naming and options | 69 inherited findings; no new findings against the checked-in baseline | 10 unknown verbs, 3 resources and 56 option-role findings need review and a shrinking baseline |
| Google conversion and sync | Synthetic catalog/import/search behavior verified | Controlled live edits, moves, removals and native Docs fidelity remain unverified by this run |
| Other runtimes/platforms | Release validation covers Node/Bun package smoke; this run uses Node 24.19.0 on Linux | No independent Windows Google sign-in or live ingestion result here |
| Native developer documentation | Current source alignment page still names Core 0.231.0/framework 0.19.4 and says no Drive release exists | Refresh it alongside the next source release; the public portal already reviews the released 0.5.0 user guides |

The command lint check was run from the clean PR35 checkout so it could read the exact reviewed
baseline, while targeting the fresh npm executable:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node /var/tmp/drive-check-050/node_modules/@wirecat/cli-base/dist/dev/bin.js lint --cli /var/tmp/drive-check-050/node_modules/@wirecat/drive-cli/dist/bin/drive.js
```

Result: `69 violations — 69 in the baseline, 0 overridden (budget 10), 0 new` and `lint: ok`.
Running outside that checkout reports the same findings as new because it has no baseline;
that is not evidence of a release regression. The baseline and override budget were not edited.

## Order of work

1. Coordinate release of the already-merged contract-3 changes, with independent checks for
   discovery effects, retry safety, page metadata, JSONL termination and unknown-argument refusal.
   Do not publish the current package version over the existing 0.5.0 tag.
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
