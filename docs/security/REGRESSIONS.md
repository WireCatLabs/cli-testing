# Audit regression checks

Use this when preparing or repeating an audit after fixes. It helps reviewers prove that the
selected protection works, ordinary supported workflows still work, and incomplete stages remain
visible. Read the owner's accepted-risk decisions before selecting controls; this checklist does
not authorize account access, settings changes, publication or live messenger actions.

## Record the boundary

For each selected fix, record privately: finding identifier, source commit, released package and
exact dependency pins, owning test, executed command, positive and negative results, limitations
and reviewer. Test current source and the installed release separately when they differ. A test
name or green unrelated CI run is not proof that the changed behavior was exercised.

Use synthetic accounts/data and temporary state for process tests. Never open the owner's store,
read credential files, install a real user timer or send a messenger message as a routine PoC.

## Protection and compatibility controls

| Area | Protection control | Allowed-workflow control |
| --- | --- | --- |
| Source-analysis gate | A synthetic critical SARIF result blocks; missing/unresolvable rule metadata fails | A lower-severity result is reported under the approved policy; resolve rules in driver and extension components |
| Scheduled authority | Under the inherited read-only lock, send and authority-granting config/permissions/recipients/schedule changes refuse before execution | Allowed reads and reply-text preparation work; do not claim the CLI lock sandboxes other programs |
| Credential paths | Enumerate every executable application and environment prefix; synthetic default, configured, symlinked and platform-case protected paths refuse before bytes are read or transferred | Ordinary hidden working folders remain allowed; exercise only the explicitly supported override |
| Credential output | Synthetic opaque attachment references disappear at every depth from camel/snake envelopes, MCP, personal and bot live JSON lines, including event mode | Useful safe fields and required internal store references remain; never use actual keys or tokens as fixtures |
| Relay authority | A server that starts read-only refuses writes when the client omits or clears its lock flag | An unlocked server accepts an authorized synthetic write; client-side locks still apply |
| Go engines | Nested modules receive actual Go source analysis and module/toolchain verification; affected imported symbols remain visible | Unused advisory metadata is retained separately; a JSON checker exit of zero alone never means clean |
| Parser complexity | A bounded adversarial fixture completes inside a measured resource budget or fails with the defined error | Ordinary valid HTML/documents preserve expected text; accepted long-document behavior stays supported |
| MCP text boundaries | Incoming text is framed as data and hidden controls are visible where the released contract promises it | Original Unicode writes and ordinary machine JSON follow the accepted compatibility policy |
| File creation | A pre-existing target/symlink refuses an exclusive temporary/output write and retains sentinel contents | A new target succeeds; normal valid output is not truncated or overwritten |
| Deployment/publishing | Actual secret-name metadata and environment branch rules match the intended credential boundary | The authorized main deployment/publisher succeeds with those scoped credentials; workflow text alone is insufficient |
| Dependency scope | Full development-inclusive advisory inventory accompanies the production/optional closure; missing edges, integrity and unpublished patch suggestions remain visible | Compatible published patches preserve parser, local-server and build behavior; never infer consumer delivery from workspace overrides or hide an advisory with an ignore |
| Audit tooling | Wrong pins, missing source analysis, failed scanners and incomplete/mismatched comparison coverage remain failures or explicit gaps | Canonical symlinks work, supported scanner exit codes retain observations, and a new baseline needs no invented previous run |

Check the scanner report's actual version, including supplemental controls. Put the pinned environment
first on PATH: an absolute launcher can still dispatch a fallback through a global executable. Keep
initial failed/unpinned attempts separate from the final pinned replay.

For secret scanners, use a separate temporary synthetic Git history with a known-positive fixture.
Require a detection, then verify that the intended clean control scans nonzero commits. Record the
actual allowlist and exclusions. Do not copy canaries into maintained source or publish findings.

## Completion ledger

Keep this table in the private run report, with a source/artifact link for every status. Use
`run`, `not run`, `failed`, or `not applicable` with a reason. A successful CLI `scan` means only
that scanner stage completed; it does not fill the other rows.

| Stage | Required evidence |
| --- | --- |
| Preflight | Tooling commit, paths/aliases, tool pins, source and GitHub access, baseline choice |
| Static scanners | Source commits, versions, exit codes, coverage/ignore inventory and retained parser errors |
| CodeQL | Analysis availability, open-alert snapshot and manual triage; 404 is not zero alerts |
| Secrets | Public full-history results; private allowed history scope; positive control and nonzero scanned history |
| Socket | Approved source-upload scope, pinned CLI, same commits, valid successful report; owner-terminal authentication |
| Manual review | Assigned S1–S10/A1–A7 owners, accepted-risk input, source/release boundary and evidence per verdict |
| False-positive verification | Bounded PoC and negative control, reviewer verdict and limitations before dismissal |
| Agent A7 | Approved canonical cast/payloads, available tools, a real canary write with matched host denial, actual useful fixture-read results, attempted writes and sender deletion/readback; a marker copied from the prompt alone proves no read |
| Comparison | Complete comparable scanner records with matching repository/scanner coverage; missing coverage cannot become fixed observations |
| Delivery follow-up | Fix PR, exact published consumer/dependency versions, targeted regression evidence and updated private register |

An audit is complete only when every required row has evidence, or an explicit approved
not-applicable decision. `not run` and `failed` rows keep the audit partial. Keep historical
reports unchanged; record later delivery in a linked closeout and the current findings register.

A newly executable repository joins the scope, dependency closure and applicable runtime checks; remove
its former planning-only exception. Review fresh parser gaps and source deltas before reusing previous
controls. Preserve the failed attempt when a canary could not load its tools or a fixture missed a utility
check; only the later demonstrated result fills the completion ledger.
