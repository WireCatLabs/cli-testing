# Released search contract

Use this on-demand check to verify explicit discovery in an exact published Telegram or MAX
package. It executes the installed CLI binary for both strict and discovery searches. It is not
part of the published `src/` suite or the ranking benchmark.

## Prepare a runtime

Package installation is the network step. Choose exact versions deliberately; this example
uses the releases verified after the permission-question fix. Installation scripts are disabled.

```sh
mkdir -p /tmp/released-search-runtime
npm install --prefix /tmp/released-search-runtime --ignore-scripts --no-audit --no-fund --userconfig /dev/null @wirecat/tg-cli@0.46.2 @wirecat/max-cli@0.45.3
```

Keep the generated package lock with the run evidence: it records resolved artifacts and
integrity hashes. An existing runtime with those exact packages also works. The verifier resolves
package-directory links before loading dependencies, including pnpm installation layouts.

## Run offline

From the cli-testing root:

```sh
node --import ./performance/search/released/offline.mjs performance/search/released/verify.mjs /tmp/released-search-runtime tg 0.46.2 /tmp/released-search-tg.json --permission-questions
node --import ./performance/search/released/offline.mjs performance/search/released/verify.mjs /tmp/released-search-runtime max 0.45.3 /tmp/released-search-max.json --permission-questions
```

The published store API seeds three synthetic messages in a new temporary database. Published
app metadata selects the tool's configuration; searches are judged through the actual binary,
not an internal search service. The parent asks about a fictional export; its eligible reply
contains the time without the question's keywords. Another author's reply must be excluded.

The verifier checks that discovery retrieves the eligible reply with its parent locator,
respects the author filter, and leaves default strict search empty. It asserts the requested
package version and records its shared messaging dependency. `--permission-questions` additionally
checks English “Can…” and Russian “Могут…” questions through both modes. This option requires the
permission-question fix in messaging 0.229.0 or newer. Omit it for the older baseline contract.
Each binary has a 15-second timeout.
An error or failed assertion exits unsuccessfully; reports are written only after success.

Configuration, XDG paths and the store are isolated; HOME is not inherited. The verifier drops inherited environment
variables except PATH. The preloader denies Node network, DNS and keyring socket access in the
fixture process and both CLI processes. It is a regression guard, not an operating-system sandbox
against malicious native code. Nothing logs into an account, sends a message or reads an owner's
archive. Temporary synthetic stores are retained for inspection.

Reports contain versions, verifier and guard hashes, and assertion outcomes. This tiny fixture proves a released-package
contract, not general ranking quality, archive scaling, live provider behavior or vulnerability
absence. Use the [evaluation guide](../combined-search-evaluation.md) and
[research index](../README.md) for those separate questions.

The 2026-10-11 verification passed for Telegram 0.46.2 and MAX 0.45.3, both using messaging
0.229.0: both permission-question forms passed, discovery retrieved the eligible reply, excluded the other sender and preserved parent
provenance; strict search remained empty. This is a three-message contract check, not a new
ranking-quality or performance measurement. The [synthetic reports](results/) retain the exact
package versions and verifier/guard hashes.

The installed pnpm Telegram/MAX packages also passed through a symlinked synthetic fixture runtime.
[Installed-package proofs](results/) retain the same version, filter and permission-question assertions.
