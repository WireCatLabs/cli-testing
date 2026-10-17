# Drive documents across WireCat tools

Drive's own search passing did not establish that Memo, Telegram and MAX could read the same
imported document, preserve its Google provenance or connect it to messages. This experiment
checks that workflow through packaged executables and one shared temporary database.

## Reproduce

For the original candidate experiment, install the reviewed Drive, Telegram, MAX and Memo packages into one isolated prefix. They must
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

## Published-reader compatibility

[The all-registry run](results-published-readers.json) passed ten executable checks with Drive
0.15.0, Telegram 0.63.0, MAX 0.56.0 and Memo 0.52.1, each using its original registry dependency
graph. It verifies ordinary shared text/tag search, mixed messages/documents, Telegram document
links and Drive cached reading. These earlier readers do not all expose the enhanced provenance
fields/profile filters. Registry MAX 0.56.0 does not mount `chats documents list`; that capability
is explicitly recorded as not run in this compatibility mode and is covered by the merged-candidate
run above. No compatibility assertion replaces the stricter candidate checks.

To reproduce with exactly those four registry packages in the prefix, append `--published-readers`
to the runner command. The ordinary mode still requires one physical Core package, provenance
fields and both messengers' chat-document commands; it passed again after adding this compatibility
mode. Public recipes deliberately avoid reader profile filters that need the later adoption.

## Current published readers — 17 October 2026

The earlier compatibility run did not establish that enhanced document provenance and MAX chat
links had reached npm. A fresh run against the current releases passes **17 executable checks**,
including both readers' source-profile selection, typed Google provenance, stored-message links,
shared tags and Memo retrieval. No reader release or Drive change was needed.

| Published package | Version | Its original Core | Result |
| --- | --- | --- | --- |
| Drive | 0.16.0 | 0.307.0 | Import, tag, repeated sync and cached text |
| Telegram | 0.69.0 | 0.321.0 | Source-filtered search, chat links, retained tags |
| MAX | 0.58.0 | 0.315.0 | Source-filtered search, chat links, retained tags |
| Memo | 0.61.0 | 0.320.0 | Document and tag retrieval with Google URL |

[Exact results](results-current-readers-2026-10-17.json) record registry integrity, executable hashes,
arguments, exit codes and resolved Core versions. Each tool has a separate npm installation and its
unmodified dependency graph; only the temporary database is shared. This is deliberately different
from the historical candidate mode's single physical Core requirement.

Three synthetic Drive syncs read the source content once. After newer readers open the database,
Drive can still add a tag, sync unchanged content and return the exact cached text. Both messenger
readers retain that tag and show both sharing messages without duplicate links. An unknown source
profile is refused with `validation_error` / `input.invalid` on stderr (exit 2), rather than silently
returning unfiltered results. Memo also finds the tag after the repeated syncs. Fifteen commands
succeed; two commands verify that expected refusal. Every successful answer reports complete results.

To reproduce these exact releases, create four independent installations and run the current mode:

```sh
P=$(mktemp -d -p /var/tmp)
for spec in drive:@wirecat/drive-cli@0.16.0 tg:@wirecat/tg-cli@0.69.0 max:@wirecat/max-cli@0.58.0 memo:@wirecat/cli-memo@0.61.0; do
  T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix "$P/${spec%%:*}" --ignore-scripts --no-audit --no-fund "${spec#*:}" || break
done
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/drive-shared-store/run.mjs "$P" "$P/results.json" --current-readers
```

Measured on Linux x64 with Node 24.19.0, one invented document and two messages in each messenger.
Sockets, browser launch, keyring and subprocess helpers are refused in reader processes. No owner
profile, Google connection, messenger session, AI model or real store is involved. This bounded run
does not establish compatibility for every migration, edited-message linking, document-only search
or transferring annotations between databases; those remain separate work.
