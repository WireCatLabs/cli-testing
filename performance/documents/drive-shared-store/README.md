# Drive documents across WireCat tools

Drive's own search passing did not establish that Memo, Telegram and MAX could read the same
imported document, preserve its Google provenance or connect it to messages. This experiment
checks that workflow through packaged executables and one shared temporary database.

## Reproduce

Install the reviewed Drive, Telegram, MAX and Memo packages into one isolated prefix. They must
resolve the same physical Core package, including its document search provenance support. Run:

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/drive-shared-store/run.mjs /absolute/install/prefix /absolute/results.json
```

The runner uses the installed Drive package's public program/source-injection API for synthetic
syncs. Every reader, tagging and cached-document check invokes an actual compiled executable in
a separate process. The seed uses the public Core store. It never imports TypeScript source.
The child-process guard refuses network, browser, keyring and subprocess access. The fixtures
contain invented people, messages and Google URLs, and no remote request is needed.

## Checks

- Import a synthetic document into the shared database with a Google URL and edit time.
- Find that document through Telegram and MAX, narrowed to its recorded Drive profile.
- Find it through Memo's combined search, preserving its document kind and source URL.
- Read document titles through the stored messages that shared their Google URL.
- Tag through Drive, then find the tag through Telegram and MAX.
- Add stored messages after the first import. Sync twice without a source change: both messages
  link to the unchanged document and the second pass does not double the result.
- Read the cached source through the Drive executable after all prior processes have exited.

The output records package versions, Core version and each executable invocation. Synthetic source
syncs and actual subprocess checks are counted separately. Unit tests in Drive additionally cover
reference collisions between databases, annotation safeguards, interrupted rebuilds, missing
snapshots and retrying a failed historical linking pass.

This is an offline workflow evaluation. It does not certify Google OAuth, remote conversion,
live messenger reads, formatted hyperlinks without visible URLs or transfer of owner annotations
between databases. Results will identify whether consumer packages are published artifacts or
locally packed dependency-adoption candidates; a candidate result is not a consumer release claim.

## Results

[Initial candidate](results-candidate.json) and [registry Drive](results-registry-drive.json) each
passed 12 executable checks. The latter uses published npm Drive 0.15.0 with registry Core
0.301.0 and locally packed Telegram/MAX/Memo dependency-adoption candidates. The report explicitly
labels each artifact and records package integrity and compiled executable hashes; it does not
claim those candidate reader versions were published with the new dependency. Their code is
merged in Telegram #547, MAX #685/#686 and Memo's existing Core adoption.

Three synthetic syncs read source content only once. Telegram/MAX found the Google document with
its remote edit time and source URL, found its tag, and returned both old and later sharing
messages without duplicate document links. A combined Telegram search returned both messages and
the document. Memo returned the document with its Google URL. Drive read its cached source after
the preceding processes exited. Every recorded executable answered a complete standard envelope.

Drive's 205-test suite separately passed with 89.33% line coverage, ten CLI/MCP contracts and
five prior-store upgrade cases. The transition cases include a destination row-ID collision,
interrupted rebuilding, annotation refusal with the old file still readable, explicit missing-
snapshot recovery and concurrent cached reading while sync holds the profile lock.
