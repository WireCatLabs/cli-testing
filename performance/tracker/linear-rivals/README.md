# linear-cli against its rivals: the same questions on one Linear workspace

Measured 2026-11-25 on `@wirecat/linear-cli` 0.3.1, `@wirecat/cli-memo` 0.152.0, Linear MCP 1.0.2, Linearis
2026.8.0 and schpet/linear-cli 3.1.0.

## Why it was run

The owner asked how linear-cli compares with its rivals. The comparison that existed was on paper only: it was built
from linear-cli's code and the rivals' READMEs. None of the rivals was run, and search quality was never measured on
a Linear workspace. The questions:

1. Which tool finds the issue, comment or document a user asks about, when the user asks the way people really ask?
2. What does each answer cost an agent: time, size and requests to Linear?
3. Do the features the paper comparison lists (documents, cycles, writes) really work?

It feeds the order of linear-cli's next work: documents, meaning search, and writes.

Thresholds, written before the run:

- If ours (its issue search and its document search together, keywords) is within 2 questions of the best rival at
  hit@5, search does not block anything, and documents and writes stay first.
- If ours trails the best rival by 3 or more, word forms and meaning search for tracker items move first.
- If ours finds under 1/3 at hit@5 on sentences while a rival finds 2/3, the skill must tell agents to send keywords,
  or `issues search` must stop requiring every word.
- A difference of 1 or 2 questions out of 27 is noise.

## Setup

- Machine: AMD Ryzen AI 9 HX 370 laptop, Linux 7.0, Node 24.19.0. Other sessions' builds shared the machine, so read
  single milliseconds as rough. The embed phase ran while the feature checks (with one `sync`) and other sessions'
  jobs used the CPU, so its times are rougher still. The live tools' times include the network time to Linear.
- Workspace: the owner's Linear **test** workspace. It held no real data: one team, one member and 4 onboarding
  issues. [seed.mjs](seed.mjs) added the synthetic set from [dataset.mjs](dataset.mjs):
  - 2 projects, 62 issues (each labelled `wc-bench`), 9 comments and 3 documents. 6 issues are in Russian.
  - Each topic has a look-alike: "Currency rounding on refunds" next to "Invoice PDF export drops the currency
    symbol", "Session expires on slow networks" next to "Biometric sign-in with Face ID".
  - Some answers sit only in a comment ("Decided: we store the idempotency key…") or only in a document.
  - The script is idempotent: a rerun finds every item by its title and makes nothing new (3 requests).
- Questions: 30 in [questions.json](questions.json), written before any run. 27 have one expected item, and 3 have no
  answer in the data. They follow [AGENT-TESTS.md](../../../docs/dev/AGENT-TESTS.md): typos ("postgress upgade"),
  synonyms ("junk" for spam, "dark theme" for dark mode), other word forms ("restoring" for "restored"), Russian
  word forms, questions in English about a Russian issue, "what did we decide about…", and answers in comments and
  documents. Each question has two forms: the user's sentence, and the keywords an agent would type from that
  sentence. The keywords were written from the question only, never from the data. Across the 27, a median of 50% of
  a keyword query's words appear as written in the expected item, from 0% to 100% per question
  ([report.md](report.md)).
  - One agent wrote both the data and the questions. A second writer, as AGENT-TESTS.md asks, would keep the data's
    words out better. The word-overlap column shows how direct each question is.
- Contestants, each with its own search, the way its docs say to use it. Every tool ran in its own empty folder with
  its own `HOME` and `XDG_*`, `DBUS_SESSION_BUS_ADDRESS=disabled:`, and `LINEAR_IGNORE_ENV_FILE=1` for schpet. The
  token came from the keyring inside the scripts. It went to the rivals through their environment, and to ours on
  stdin, stored as a file credential in the scratch folder.
  - **ours: issues search**: `linear bench issues search <words> --json --limit 10`, each word a separate argument.
  - **ours: issues search (one quoted argument)**: the same command with the words in one quoted argument, as the
    command's own example writes it (`issues search "invoice currency"`).
  - **ours: search**: `linear bench search "<query>"`, the documents search.
  - **ours: both**: both of the above for every question, the way an agent that does not know the answer's kind
    would search.
  - **ours: memo search all**: `memo search all "<query>"` over the same store. This is the search that ranks
    tracker issues, comments and documents together.
  - Each of ours once after a plain `sync`, and again after `sync --embed` with EmbeddingGemma. The model was
    downloaded by memo into the scratch folder.
  - **ours: api semantic-search (live)**: `linear bench api semantic-search --query <q>`. This is Linear's own
    `semanticSearch` through our raw API command.
  - **Linear MCP**: `https://mcp.linear.app/mcp` with the API key as a bearer token, through
    `@modelcontextprotocol/sdk` 1.20.0. It accepted the key. Each question runs `list_issues {query}` and
    `list_documents {query}`.
  - **Linearis**: `linearis issues search <q> --limit 10`. It has no document search.
  - **schpet/linear-cli**: `linear issue query --search <q> --search-comments --all-teams --json`. It has no document
    search.
- Scoring: [bench.mjs](bench.mjs) reads each answer as a list of seed items, ordered by where each item's id, key or
  exact title first appears. A comment counts for its issue. When a contestant runs two searches, the item counts at
  its best place in either list. hit@1 and hit@5 count the 27 answerable questions. For the 3 questions with no
  answer, the column counts the answers that held no seed item at all. Items outside the seed (the 4 onboarding
  issues, the write checks) are skipped, so they push nothing down.
- Time: the wall time of the whole command or MCP call. Ours ran 3 times and the median is kept. Live tools ran once,
  2.5 s apart, to stay under Linear's 30 searches a minute.
- Size: the characters of the answer's JSON divided by 4, a rough token count. It is not a tokenizer.
- Requests: counted inside each Node process by [count-requests.mjs](count-requests.mjs), from Node's diagnostics
  channels. For MCP it is one per tool call. schpet is a Rust binary, so its requests were not visible.
- Features: [features.mjs](features.mjs) ran each tool's documents list and read, document search, cycles list, a
  filter ("open bugs with no assignee") and a write: one issue labelled `wc-bench-write` and one comment.

Commands, from this folder (`LINEAR_BENCH_WORK` is a scratch folder; the token's keyring account is the test
workspace's):

```sh
export LINEAR_BENCH_WORK=/var/tmp/wirecat-bench/linear-rivals LINEAR_BENCH_ACCOUNT=<keyring account>
node seed.mjs
node setup.mjs && node bench.mjs words
node setup.mjs --embed && node bench.mjs embed
node features.mjs
node report.mjs > report.md
```

Raw answers stay in `$LINEAR_BENCH_WORK/raw`, because they hold the workspace's URLs and the member's email. The
committed [results-words.json](results-words.json), [results-embed.json](results-embed.json) and
[results-features.json](results-features.json) hold only seed keys, times, sizes and counts.

## Results

The best row of each tool, keyword form ([report.md](report.md) has every row and every question):

| Contestant | hit@1 | hit@5 | Answers to the 3 no-answer questions that held nothing | Median ms | Median tokens of an answer | Requests to Linear |
|---|---|---|---|---|---|---|
| ours: memo search all, after `sync --embed` | 26/27 | **27/27** | 0/3 | 4,204 | 1,509 | 0 |
| ours: api semantic-search (live) | 25/27 | 25/27 | 0/3 | 1,199 | 76 (ids only) | 1 |
| Linear MCP | 14/27 | 24/27 | 0/3 | 779 | 971 | 2 |
| Linearis | 22/27 | 22/27 | 0/3 | 576 | 1,621 | 1 |
| schpet/linear-cli | 22/27 | 22/27 | 0/3 | 366 | 984 | not visible |
| ours: both, after `sync --embed` | 10/27 | 10/27 | 0/3 | 3,887 | 432 | 0 |
| ours: memo search all, plain sync | 8/27 | 8/27 | 3/3 | 526 | 187 | 0 |
| ours: issues search, separate words | 7/27 | 7/27 | 3/3 | 376 | 39 | 0 |
| ours: issues search, one quoted argument | 1/27 | 1/27 | 3/3 | 475 | 39 | 0 |

The user's sentence instead of keywords:

| Contestant | hit@5, keywords | hit@5, sentence |
|---|---|---|
| ours: memo search all, after `sync --embed` | 27/27 | 27/27 |
| ours: api semantic-search (live) | 25/27 | 25/27 |
| Linearis, schpet/linear-cli | 22/27 | 22/27 |
| Linear MCP | 24/27 | **12/27** |
| ours: issues search, separate words | 7/27 | 2/27 |

Features, checked by running each tool:

| | ours | Linear MCP | Linearis | schpet/linear-cli |
|---|---|---|---|---|
| Documents: list, read | yes | yes | yes | yes |
| Document search | yes (`search`; with meaning after `sync --embed`) | yes (`list_documents {query}`) | no | no |
| Cycles | yes, only through `api cycles` | yes | yes | yes |
| Filter: open bugs with no assignee (17) | 17/17, after `labels list` and 3 lists; `label:Bug` by name finds 0 | 17/17, one call | 17/17, one call | 17/17, one call |
| Create an issue | yes, after a `sync`: a label made after the last sync is refused (`tracker.reference`) | yes | yes | yes |
| Comment | yes | yes | yes | yes |
| Works offline | yes | no | no | no |
| Cost before the first question | none | the tool list: 60 tools, 100,208 characters, about 25,000 tokens | none | none |

## What it showed

- **With memo and vectors, ours is the best.** `memo search all` over linear-cli's copy found all 27 in the top 5,
  26 at the top, with no request to Linear. It also found the two questions every live tool missed: a typo
  ("postgress upgade") and an English question about a Russian issue. The price is time: a median of 3.7–4.2 s a
  question (2.4–12.9 s for single questions), against 0.4–0.5 s for memo without vectors and 0.3–1.2 s for the live
  tools. memo starts a new process and loads the model for each question; how much of the time that takes was not
  measured apart. Its answers are about 1,500 tokens at the median, less than Linearis (1,621) and more than MCP
  (971).
- **linear-cli on its own, without memo, is far behind.** Its `issues search` matches words only, even after
  `sync --embed`: 7/27 with keywords, 2/27 with sentences. The vectors that `sync --embed` builds for issues and
  comments are read by memo's `search all`; `linear commands` lists no command of linear-cli that searches issues by
  meaning (its MCP server serves the same commands). `linear search` searches documents only (3/27, the three
  document questions).
- **By the thresholds written before the run, two outcomes fired.** linear-cli's own two searches together find
  10/27 after `sync --embed`, 14 behind Linear MCP (24/27): meaning search for issues in linear-cli's own commands
  moves first, or its skill sends agents to `memo search all`. With sentences, `issues search` finds 2/27 against
  22/27 for Linearis: the skill must tell agents to send keywords, or `issues search` must stop requiring every
  word. memo's 27/27 does not change either: it is a second program, and an agent that has only linear-cli does not
  reach it.
- **A quoted query is a phrase.** `issues search "canary islands tax"` finds nothing, and `issues search canary
  islands tax` finds the issue "Tax calculation wrong for the Canary Islands". One quoted argument matches only
  words in that order next to each other. A check by hand gave the same: "password reset" found the issue, "reset
  password" did not. The help
  says "every word must match, in any form", and the command's own example quotes its words. An agent that copies
  the example gets 1/27 instead of 7/27. `linear search` is the other way round: it takes exactly one argument and
  refuses two words without quotes.
- **`label:` takes an id, not a name.** `issues list label:Bug assignee:none` returns nothing, with no error. The
  label's id works. The list also shows each issue's state and labels as ids, so an agent reads `labels list` and
  `states list` first. Every rival did the same filter in one call.
- **Linear's own search is strong.** Linearis and schpet gave identical ranks on all 27 questions, which suggests
  both call the same Linear search. It found 22/27, including the Russian word forms and the paraphrase that shares
  no rare word with its issue. Its misses are the 3 documents (neither tool has a document search), the typo and the
  cross-language question. `semanticSearch` found the same issues and the 3 documents too, 25/27. It returns ids
  only, so an agent needs a second command to read the issue.
- **Linear MCP orders hits by update time, not by relevance.** The schema of `list_issues` offers `orderBy`
  `createdAt` or `updatedAt` only, default `updatedAt`, and its answers came newest-updated first. So it finds 24/27 in the top 5 but only 14/27 at the top. Given the user's
  full sentence, it drops to 12/27. Before the first question, its tool list costs about 25,000 tokens.
- **Few tools say "nothing found".** On the 3 questions with no answer, every live tool returned 2–9 items, and so
  did ours after `sync --embed`; the "apple watch" question returned the Apple Pay issue first. Only ours without
  vectors returned nothing with keywords, and it returns nothing for most real questions too.
- **The paper comparison is out of date for ours.** It said ours writes only through `api` and has no documents in
  the copy. 0.3.1 has `issues create`, `issues comments create` and `documents list/show`, and they worked.

## What was not measured

- An agent answering questions. Each tool's search was called directly with a fixed query; no model chose the
  command, read the hits or followed up. The ranks show what the agent would see, not what it would answer.
- Scale. 62 issues favour word search and short lists; a workspace with thousands of issues was not built.
- Linear MCP with OAuth, and its read-only endpoint. Only the API key as a bearer token was tried.
- `mcp serve` of ours: the MCP tools of linear-cli were not called, only its commands.
- schpet's requests, and the network time apart from the tools' own work.
- e5-small, or any model other than EmbeddingGemma.
- Timing of the feature checks: they ran while the embed phase loaded the CPU, so their milliseconds are rough.

## Left in the workspace

The seed stays for later checks: projects "Billing revamp" and "Mobile app 3.0", 62 issues labelled `wc-bench`, 9
comments, 3 documents, and 4 issues labelled `wc-bench-write` with one comment each.
