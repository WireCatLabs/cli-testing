# Controlled Google verification

The offline acceptance tests establish package and store compatibility. This checklist answers
the separate question: do real Google changes preserve document identity and local context, and
does native Docs extraction keep the content we claim to search?

The live Google portion remains unrun. The checker below has synthetic tests and installed-package
acceptance; neither establishes Google conversion or public OAuth approval. Nothing starts a live account test automatically.
The owner must explicitly start it with a dedicated test profile/account recorded in the private
cast. A previously connected personal profile is not a test profile. No credential file, token,
document ID, title or passage belongs in the public result.

## Prepare the fixture

Use the released package version under test and record exact Drive/Core/framework/runtime
versions. Keep HOME, config, state, cache, database and model directories in one newly created
temporary test directory for the entire run. Browser sign-in and tokens belong to that test
profile; use default read-only Google permissions. Provider mutations below are made by the
owner in Google's UI on synthetic files, not by an automated write test.

Create a small dedicated Google folder containing:

- A nested folder and a second sibling folder.
- A Google Doc with invented text and distinct markers in its main body, a second tab, a table
  and a footnote. Add a header and a comment to check the documented extraction exclusions.
- Markdown and plain-text files with different synthetic markers.
- A second Google Doc with the same title, so title-based identity shortcuts cannot pass.

Record the selected root URL and fixture IDs privately. Connect only the explicit test profile,
select that root and import. Do not select the whole account. Text search uses the exact mode;
model downloads, embeddings and AI memory extraction are outside this first fidelity check.

## Run and record

### Use the prepared checker

[`live.mjs`](live.mjs) checks a private fixture manifest against the installed Drive **0.7.0**
package. It uses only CLI processes. It never starts login, selects an account, changes a Google
file or downloads a model. Its default is cached/offline verification; `--refresh` permits two
read-only Google syncs, with an idempotency check. `--annotate` adds synthetic local tags/notes.
Unknown options/manifest fields, another selected root, pending work, incomplete answers,
changed references and an existing report path are refused. A failure records its command stage,
without raw CLI output, Google errors or document bodies.

Choose a dedicated account and explicit profile before these steps. `PROFILE` below is the name
the owner chooses; it has no default. `DRIVE` is the installed package directory, not a source tree.
Keep the manifest and result files in a private directory outside this public repository.

```sh
DRIVE=/absolute/path/to/node_modules/@wirecat/drive-cli
PROFILE=OWNER_CHOSEN_TEST_PROFILE
P=$(mktemp -d -p /var/tmp)
W="$P/google-test"
node performance/documents/offline-catalog/live.mjs init --workspace "$W" --profile "$PROFILE"
```

The initializer requires a new directory and creates it with mode 0700. Every connection and
fixture command must use that workspace. For this isolated run, explicitly choosing private-file
credentials avoids using the owner's keyring. Normal CLI installations still default to the keyring.

```sh
drive_test() {
  env -u NODE_OPTIONS -u GOOGLE_APPLICATION_CREDENTIALS -u DRIVE_GOOGLE_CLIENT_ID \
    -u DRIVE_GOOGLE_CLIENT_SECRET HOME="$W" NPM_CONFIG_USERCONFIG=/dev/null TMPDIR="$W" \
    XDG_CONFIG_HOME="$W/xdg-config" XDG_DATA_HOME="$W/xdg-data" \
    XDG_STATE_HOME="$W/xdg-state" XDG_CACHE_HOME="$W/xdg-cache" \
    DRIVE_CONFIG_DIR="$W/config" DRIVE_STATE_DIR="$W/state" DRIVE_CACHE_DIR="$W/cache" \
    DRIVE_STORE="$W/drive.db" MESSAGING_STORE="$W/drive.db" WIRECAT_STATE_DIR="$W/wirecat" \
    node "$DRIVE/dist/bin/drive.js" "$PROFILE" "$@"
}
drive_test session start --credential-storage file
drive_test folders add GOOGLE_TEST_FOLDER_ID
```

Choose the test Google account yourself in the browser. The first login uses WireCat's shared
app. To test a user-owned app, create a second new workspace and explicit profile and use
`session start --credential-storage file --client-file /private/desktop-client.json` there.
Never print that file. A successful existing-account login does not prove an outside-test-user
can connect, or that Google approved the app: record those checks separately.

Copy [`live-manifest.example.json`](live-manifest.example.json) into the private directory and
replace every `REPLACE_*` ID. Match it to the synthetic Google files you created: include every
imported document, folder ancestry, expected names/tabs, searchable markers and separately expected
Markdown markers. Add the duplicate-title document and uploaded text fixtures as extra entries.
The root's parent is optional; nested parents should be explicit. `absent_ids` names fixtures
that should have left the active catalog. Headers/comments are checked manually against the exclusions.

```sh
node performance/documents/offline-catalog/live.mjs check \
  --workspace "$W" --profile "$PROFILE" --drive "$DRIVE" \
  --manifest /private/fixture.json --output /private/first.json --refresh --annotate
```

After renaming, editing or moving synthetic files in Google's UI, update the expected manifest
and use a new output path plus `--baseline /private/first.json`. This checks stable references
and retained local annotations. For an edit, put the replaced phrase in `absent_markers`.
For a removed source, remove its document entry and add its ID to `absent_ids`; retain at least
one indexed document. Omit `--refresh` to check the cache offline. Reports are mode 0600 and
contain private source IDs/references for comparisons; stdout contains totals only. Nothing is
automatically disconnected, removed or overwritten.

The runner automates only the observations listed above. Interrupt/resume, a second-profile
isolation check, person/project links, memory staleness, OAuth refresh/revocation, public-app
verification and real embeddings/AI extraction remain separate manual acceptance cases.

### Complete the behavior matrix

| Step | Action | Required observation |
| --- | --- | --- |
| First import | Select the root, sync, inspect status and cached catalog tree | Root/folder/file hierarchy and metadata exist; pending work drains; no unrelated files appear |
| Read and search | Read cached text and search each synthetic marker | Body, additional tab, table and footnote are searchable; headers/comments match documented exclusions |
| Context | Add a local tag and note to a document and to its folder | Both are readable through their stable source references |
| Rename | Rename one Doc in Google's UI, then sync | Same source reference and local context; new name shown; no duplicate indexed document |
| Move within root | Move that Doc to the sibling folder, then sync | Same source reference/context; parent tree changes |
| Edit | Replace its body marker in Google, then sync | New text is searchable; old text no longer appears; a further unchanged sync does not duplicate data |
| Leave scope | Move the Doc outside the selected root, then sync | Active catalog and search hide it; retained-context behavior agrees with documented retirement/removal semantics |
| Re-enter scope | Move it back, then sync | Re-entry does not create a second source identity; inspect whether owner tags/notes survive and record the actual behavior |
| Trash | Trash only a synthetic fixture in Google, then sync | It disappears from active browsing and ordinary search; other files remain |
| Isolation | Inspect a second explicit test profile with no selected roots | It cannot read the first profile's catalog/text/context |
| Offline | Block Google access and read/search cached retained files | Local reading/search succeeds; operations requiring Google refuse offline mode |
| Repeat | Run an unchanged sync with Google available | No duplicates; local tags/notes remain |

For memory staleness, first create a synthetic local memory tied to the current document hash
using the supported memory command. Edit or remove its source, sync, and inspect that memory's
state explicitly. Do not infer staleness merely because the source vanished from search. Record
this as a separate case; automatic AI extraction needs its own provider and quote-fidelity test.

## Publish the result

Only totals, package versions and pass/fail by behavior go into cli-testing. Keep queries,
markers, source URLs/IDs, observed Google metadata and per-file evidence in cli-private and link
that record by name. A failure is retained as a failure, with its exact package version.

Disconnect the test profile after recording the run. Remote fixture removal and local fixture
cleanup are explicit owner actions. This plan does not establish OAuth app verification,
complete edit history, image inference quality or fidelity for file types absent from the fixture.
