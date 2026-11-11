# Tools search: task phrases

## Why it was run

An agent connected to `memo mcp serve` sees three tools. It finds a command with `memo_tools_search` and then
calls it. The CRM relationships scenario ([../../crm/relationships](../../crm/relationships/README.md), check 12)
showed that the search found every new command by a short phrase such as "deal context", but only 6 of 13 by
the way an agent words a task, such as "who reports to whom". The search needed every word of the query to
appear in the command's name, title or help.

The question: does ranking by the words that match, with each command's help examples and aliases counted, find
the command for a task phrase without burying the short phrases? The answer decided whether
[cli-core #2878](https://github.com/WireCatLabs/cli-core/pull/2878) ships its new `search` (in
`src/mcp/surface.ts`).

## Setup

- Node v24.19.0 on Linux. [run.mjs](run.mjs) starts a real `memo mcp serve` over stdio in a throwaway home
  with an empty store and no keyring (`DBUS_SESSION_BUS_ADDRESS=disabled:`). The search reads only the command
  catalogue.
- 26 queries: the 13 commands of check 12, each asked once by a short phrase and once by a task phrase. The
  phrases are those of check 12, written before the change.
- A command counts as found when it is among the items the search returns. The search shows at most 8.
- **Before**: `@wirecat/cli-memo` 0.131.84 on cli-core 0.640.0, from npm.
- **After**: unreleased builds. cli-memo branch `feat/owner-leftovers` (`c069588`) on cli-core `main` at
  `97e78f3b2` (0.643.0, which carries #2878), both packed with `pnpm pack` and installed with npm into one
  prefix.
- Command: `node run.mjs PREFIX OUTPUT.json`.

## Results

| Phrases | Found, before → after | First, before → after | In the top 3, before → after |
| --- | --- | --- | --- |
| Short (13) | 13 → 13 | 9 → 9 | 12 → 12 |
| Task (13) | 6 → 13 | 6 → 9 | 6 → 10 |

[before.json](before.json) and [after.json](after.json) have each query's rank and its first three commands.

## What it showed

- **Every task phrase now finds its command**, and no short phrase lost its place.
- **The new rank** is 1000 for the exact name, plus 10 for each query word that matches, plus that word's best
  weight: 4 in the name or an alias, 2 in the title, 1 in the help, the example words or the arguments. Common
  words ("a", "the", "to") are dropped, and words match by stem or by a start of three letters or more.
- **What still ranks low.** "record that a person reports to another" puts `relationships add` 8th: the words
  "person" and "another" also fit commands about records and contacts. "who reports to whom" puts
  `relationships list` 4th. The command's help names "who reports to whom", but `vocabulary show` and `context`
  share more of the words. An agent sees eight results, so both are still found.
- **A side effect for tests.** A query now returns commands that match any of its words, so a test that searches
  "facts list" also gets other `list` commands. In drive-cli, the availability check of those commands read the
  OS keyring in a test, and cli-core's release parity failed on it (cli-core
  [#849](https://github.com/WireCatLabs/cli-core/issues/849)).

## What was not measured

- Other CLIs' catalogues. The change is in cli-core, so every CLI's `<app>_tools_search` ranks this way.
- A model choosing from the results: this measures where the command lands, not whether an agent calls it.
- Phrases in other languages. Stems here are English only.
- The released packages: the after run used local builds. Rerun on the release that carries #2878.
