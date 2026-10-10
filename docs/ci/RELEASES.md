# Validate and pack once

Package release workflows run full validation and release security before publication.
Full validation installs dependencies, checks code/types/tests/coverage, builds, and runs the
project's documentation, parity, runtime, platform, and offline contract checks where configured.

The Linux validation job packs that checked build with `npm pack --ignore-scripts` and uploads
`validated-package`. The reusable workflow exposes the tarball's SHA-256 as `package-sha256`.
Release callers opt in with `pack: true`; ordinary manual and monthly validation do not pack.

The release handoff job waits for full validation and security, downloads the immutable artifact
from the same workflow run, and fails on a missing or mismatched digest. It retains the existing
version-not-published check and uploads the verified tarball under the publisher's `package` name.
It does not install dependencies, rerun tests, rebuild, or repack. The publishing job installs
nothing and publishes that tarball with its existing npm environment and permissions.

MAX and Telegram retain their extra release checks before packing: a release-ready changelog,
package allowlists, and MAX's web-client version age. Their local `release:check` commands still
run all checks; `--artifact-only` is used by the CI path after full validation has passed.
Generation, test-matrix, tree-drift, and documentation checks remain in full validation.

Separate Bun and OS/install jobs retain their builds because they verify different environments.
Release security still scans history and source independently; this change removes the repeated
Linux installation, full test suite, and packaging build, without weakening those gates.

For a workflow check without publishing or tagging:

```sh
gh workflow run release.yml --ref <review-branch> -f dry_run=true
```

Only that explicitly selected release validation runs; this command does not start a monthly
validation round. A successful dry run verifies the artifact handoff and npm's package checks.
