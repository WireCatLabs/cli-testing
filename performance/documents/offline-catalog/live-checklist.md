# Controlled Google verification

The offline acceptance tests establish package and store compatibility. This checklist answers
the separate question: do real Google changes preserve document identity and local context, and
does native Docs extraction keep the content we claim to search?

This is an unrun test plan. Nothing in this directory starts a live account test automatically.
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
