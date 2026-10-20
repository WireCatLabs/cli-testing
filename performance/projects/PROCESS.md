# How to reproduce and interpret project-context measurements

Use this process when comparing project gathering, cross-tool ingestion or retained annotations. The
goal is to keep the request, fixture, labels, tool artifact and measured result together, so an
improvement can be separated from a changed dataset or an incomplete source. These studies answer
different questions; their numbers are not one project-quality score.

The [reference ledger](provenance.json) identifies existing artifacts by immutable Git commit, byte
count and SHA-256. It contains metadata and links, not copied fixtures or private source bodies.
[Verify it offline](#verify-the-retained-artifacts) before using a recorded result. Verification checks
retained bytes; it does not run the applications or establish that a historical build is reproducible.

## Existing evidence and its limits

The [installed post-fix observation](installed-observation/README.md) is a separate mutable-archive
measurement. It publishes totals through an allowlisted projection; cases, source references and
per-item rows remain private. Do not combine it with the frozen synthetic precision/recall scores.

| Study | What is measured | Runtime provenance | What it does not establish |
| --- | --- | --- | --- |
| [Initial evidence](https://github.com/WireCatLabs/cli-testing/tree/2c821aac468c280a24e0d3a7e806e76a8adc67ca/performance/projects/evidence) | Primary-hit retrieval against 13 invented labels, scoped windows and continuation | Reported built Memo 0.72.0 source 65822ca, Core 0.345.0; no retained build hash/lock | Published-package identity, live-source recall or interpretation |
| [After-fix evidence](https://github.com/WireCatLabs/cli-testing/tree/10cf8aea8a04612997587690e20087c5a4bf60c5/performance/projects/evidence) | Index catch-up, project-key searches and neighbouring context on the same labels | Candidate described as PR #328/Core 0.349.0; result still labels Memo 0.72.0 | Exact candidate build or published Memo 0.72.0 behavior |
| [Original Drive context](drive-context/README.md) | Ten synthetic CLI/MCP acceptance checks | Registry Drive 0.17.1 and Memo 0.75.0; integrities and entry hashes retained | Statistical precision/recall, OAuth or Google conversion |
| [Old site pair](drive-context/result-old-site.json) | First gather assertion failed with `index-pending` | Registry Drive 0.18.0 and Memo 0.73.0; diagnostic metadata retained | Results of later checks, which were not measured |
| [Reviewed Drive context](drive-context/result-reviewed-pair.json) | Same ten checks pass after the reviewed Memo upgrade | Registry Drive 0.18.0 and Memo 0.76.0, original dependency graphs | Complete archive coverage or a real project benchmark |
| [Isolated annotations](isolated-state/README.md) | Eleven logical reconstruction checks on two independently seeded targets | Registry Core 0.358.0 and Base 0.47.1; integrities retained | A production project exporter/resetter, retrieval score or complete history |
| [Large document](large-document/README.md) | Known limitation: five lanes return no hits across initial call and two resumes; separate tiny control returns one | Registry Memo 0.76.0 / Core 0.358.0 / Base 0.47.1; integrities retained | Successful large-document retrieval, infinite execution or all recovery options |

### Historical evidence version ambiguity

Do not relabel the frozen results. The initial README reports a checkout built at Memo
`65822ca36e4c738bae66c04644c23845701e9df4`, whose source manifest says 0.72.0 / Core 0.345.0 /
Base 0.46.0. This corroborates the reported source configuration, not the bytes that were executed.

The after-fix result also prints `memo: "0.72.0"`, because the runner records `memo --version` only.
Its README instead describes the [PR #328 candidate](https://github.com/WireCatLabs/cli-memo/pull/328)
with Core 0.349.0 and Base 0.47.1. That PR's observed head,
`92ea226afdcb4c37db94c439d08ecb7bd3b42141`, has a 0.73.0 source manifest with those pins. No exact
measured checkout head, built-tree digest, tarball integrity or installation lock accompanies this
candidate result. An older compiled version label is possible; its cause is not established here.

Published Memo 0.72.0 declares Core 0.345.0, so installing that version is not a demonstrated replay of
the after-fix candidate. The ledger keeps the conflicting values separately. Current registry integrity
and GitHub tag mappings are recorded as observations made during this audit, not retroactively claimed
as original run provenance. npm metadata exposes no `gitHead` for these observed packages; tag/source
mapping is not cryptographic proof that a historical candidate used the registry tarball.

## Keep these measurements separate

- **Extraction contract:** the [fake-completion study](extraction-contract/README.md) checks structured
  response/quote bounds on released Core 0.358.0, including accepted contradictions and stripped unknown
  fields. Its 33 cases are deterministic contract observations, not LLM accuracy, semantic entailment or
  source-attribution scores. It does not exercise the proposal persistence or review workflow.
- **Primary-hit precision:** relevant primary hits divided by all primary hits. Neighbouring context is
  not an additional primary hit. The historical scorer rounds fractions to two decimals.
- **Project-context precision:** relevant hits labelled `context: project` divided by all such hits.
  Person-only hits are excluded from both sides; they remain in overall precision.
- **Recall, all relevant:** relevant primary hits divided by the fixture's relevant labels inside the
  requested window. There are eight relevant labels for 60 days and nine for the wider run.
- **Recall, reachable:** the same numerator against the historical scorer's fixed denominator excluding
  `t-reply` and `n-own`. That exclusion remains fixed even after the reply appears as neighbouring
  context; it is not a newly judged claim about what an agent can understand.
- **Context-only references:** references found beside hits but absent from the primary-hit set. A
  neighbour can fall outside the primary-hit date window. Check its own date and count it separately.
- **Read counts and bytes:** selected stored-reader usage, not provider history downloaded or total
  process memory. After-fix `around_bytes` is reported separately from primary `read_bytes`. No latency
  or scale result is retained by the historical evidence scorer.
- **Continuation stability:** duplicate count is total returned references minus unique references;
  `same_as_one_run` compares sets. The runner allows at most 20 continuation steps after its first page.
- **Acceptance checks:** the Drive runner groups assertions into ten checks, not ten labelled examples
  from which to calculate accuracy. A first-assertion failure leaves the remainder unmeasured.
- **Reconstruction equality:** the isolated-state proof compares logical bound annotations and keeps
  proposed states/shared records intact. Its maximum of eight items per supported area and
  `supported-subset-only` coverage do not mean a whole project was exported.
- **Oversized-page non-progress:** the large-document diagnostic seeds a 95,200-byte document against
  a 65,536-byte page allowance. Across its initial call and two resumes, all five lanes remain at zero
  pages/hits with checkpoints. Cumulative charged read bytes reach 983,040 while returned excerpt bytes
  remain zero. Conservative failed-read reservations are not hydrated source bytes or JSON output size.
  A one-hit small control rules out broken basic seeding/retrieval in that store. A successful diagnostic
  exit reproduces the limitation; it does not certify acceptable retrieval behavior or an infinite loop.

None of these results measures real-project relevance, entity-extraction accuracy, automatic identity
merging, AI interpretation, model cost or agent review time. Keep such later measurements in separate
records with their own labelled denominator and unknown coverage.

## Verify the retained artifacts

Run from this repository with Node and Git; no dependency installation, account or network is needed:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T XDG_CONFIG_HOME=$T/config XDG_DATA_HOME=$T/data XDG_CACHE_HOME=$T/cache MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T node performance/projects/verify-provenance.mjs
```

The verifier reads only its fixed synthetic-file allowlist and the reviewed ledger. It checks raw Git
blobs at the listed full commits and current files marked `working_copy`. File reads are capped at
256 KiB, symlinks are refused, and it never traverses the repository, loads a CLI or updates hashes.
A shallow clone may lack a referenced commit: obtain that exact public commit intentionally before
verification. The verifier disables Git lazy fetching and all transport protocols through
[Git's environment controls](https://git-scm.com/docs/git/2.53.0.html), rather than allowing a partial
clone to fetch a missing blob implicitly. A matching checksum establishes retained bytes only.

## Make a bounded logical rerun

Use a new temporary state directory and output path for each run. Keep the committed result unchanged.
The existing study READMEs own their exact installation commands and bounds:

1. [Drive context](drive-context/README.md#reproduce): install the specified registry pair in an isolated
   prefix, preserving each dependency graph. The runner uses an injected invented Drive source, its real
   importer/index, actual Memo CLI/MCP and an external-I/O guard. The default pair remains fixed;
   explicit stable version options select the reviewed pair.
2. [Isolated annotations](isolated-state/README.md#setup): install the exact public SDKs, seed fresh
   independent stores and reconstruct only the supported subset. Existing fixture stores are refused;
   nothing is reset or deleted. Do not replace this with a copy of the owner's database.
3. [Historical evidence](evidence/README.md#setup): the runner takes a built Memo checkout and imports its
   installed store module. Preserve that interface and fixture. A new known artifact can produce a new
   comparison, but missing historical build provenance prevents a byte-for-byte replay claim. The
   existing runner does not use the Drive external-I/O guard; no live-source coverage should be inferred.
4. [Large document](large-document/README.md#setup): install the exact registry packages in an isolated
   prefix. The public SDK seeds invented documents; actual CLI subprocesses run under the existing
   external-I/O guard. Keep the bound of one initial call and two resumes plus the separate tiny control.
   Record the result as a known-limitation reproduction, not a passing retrieval-quality measurement.

For example, after creating the reviewed isolated package prefix as the Drive guide describes:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T XDG_CONFIG_HOME=$T/config XDG_DATA_HOME=$T/data XDG_CACHE_HOME=$T/cache MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T node performance/projects/drive-context/run.mjs /absolute/isolated/prefix "$T/result.json" --drive-version 0.18.0 --memo-version 0.76.0
```

Compare logical references, labels, assertions and declared coverage, not entire report hashes. The
evidence/Drive fixtures use relative `Date.now()` windows; isolated-state fixes its clock but still has
generated identifiers. Its manifest digest identifies that run's artifact, not a portable project ID.
The evidence baseline's `frozen` date records label freeze, not a frozen execution clock; its result
does not retain the exact computed cutoff or a request fingerprint.
CLI entry hashes cover bootstrap files, not whole packages. Registry integrity is retained, but complete
historical transitive installation locks and platform/native-engine manifests are not committed.

For a new measurement, retain the request/window/cutoff, fixture and label references, package/lock
provenance, actual binary/build hashes, commands, counts, coverage and failures together. Label a changed
build as a new run. Do not overwrite frozen evidence or infer relationships from names to improve a score.
Public records use invented data or aggregates only; owner requests, source bodies, entity references,
per-item relevance labels and blog planning stay in the private delivery trail.
