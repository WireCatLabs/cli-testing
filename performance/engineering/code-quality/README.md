# CLI code structure

The owner asked whether MAX and its shared library are readable, modular and easy to extend.
The decision is which responsibilities and dependencies to refactor. Test coverage is supporting
regression evidence; it does not determine the architecture assessment.

## Setup

Reviewed local main snapshots on 2026-10-13, using Node 24.19.0 and pnpm 11.20.0 on Linux x86_64:

| Repository | Version | Commit |
| --- | --- | --- |
| max-cli | 0.49.0 | 3f908c8f |
| cli-messaging | 0.261.0 | b00ae58c |
| cli-base | 0.26.0 | c75a1f5 |

MAX's dependency pins are messaging 0.256.0 and base 0.21.0. Latest library main and the installed
consumer are different subjects. The future name cli-core refers to cli-messaging in this review.

Run the inventory with explicit checkout paths:

```sh
python3 inventory.py --repo max="$HOME"/Projects/AI/max-cli --repo messaging="$HOME"/Projects/AI/cli-messaging --repo base="$HOME"/Projects/AI/cli-base
```

The script reads package.json and TypeScript source only. It excludes tests, generated modules,
the private test setup and vendored Snowball. Import counts include type imports and are a
structural inventory, not a runtime dependency or complexity analysis.
The [recorded inventory](inventory.json) preserves the reviewed source counts and commit identifiers.

## Structural findings

- MAX's [client](https://github.com/WireCatLabs/max-cli/blob/3f908c8f/src/client.ts) is 3456 lines.
  Resource methods share session state, upload handling, retry, journaling and enrichment inside
  one class. Extraction needs independently understandable modules with narrow dependencies.
- The shared [store](https://github.com/WireCatLabs/cli-messaging/blob/b00ae58c/src/store/store.ts)
  is 1791 lines; MessageStore combines more than 100 members. Contracts and resource composition
  share a file imported by 101 local source modules in the inventory.
- Shared [messages services](https://github.com/WireCatLabs/cli-messaging/blob/b00ae58c/src/services/messages.ts)
  mix reads, writes, search and helpers. messages-search imports chatAmong/senderAmong back from
  messages, which imports messages-search. This is a concrete runtime cycle.
- Store imports retentionQuery; [retention](https://github.com/WireCatLabs/cli-messaging/blob/b00ae58c/src/store/sqlite/retention.ts)
  imports calendarKey from messages-search; messages-search imports CHAT_LIST_KEY from store.
  Move pure helpers/constants below both layers to remove this dependency cycle.
- Services import provider descriptions and adapter ports from CLI modules. Some imports are
  type-only; capability and thread parsing also create runtime dependencies. Neutral contracts
  should be owned outside the presentation layer.
- Static capability flags and optional adapter methods describe support separately. MAX edits
  already built Commander options. Capability-driven factories should construct the correct
  command before registration.
- Shared attachment preparation reads files into bytes even though MAX's bot uploader already
  accepts file-backed Blobs. Preserve a file-backed source through the whole operation.
- Meeting details hydrates every transcript row, chat message and summary. Paged search paths
  exist, but bounded compact output does not bound the legacy details read.

## Validation observations

The exact commands were `pnpm test` and `pnpm test:coverage` in MAX/base, and
`pnpm test:coverage` in messaging. `pnpm lint` and `pnpm typecheck` ran in all three repositories.
These commands use synthetic fixtures and do not evaluate real provider behavior.

| Subject | Passing tests | Skipped tests | Line coverage | Branch coverage |
| --- | --- | --- | --- | --- |
| MAX | 1571 | 2 | 92.65% | 79.78% |
| messaging | 3729 | 4 | 94.94% | 84.57% |
| base | 586 | 2 | 97.15% | 86.78% |

Typechecking passed in all three. MAX lint passed; base lint passed with eight warnings in
literal template-string fixtures. Messaging whole-checkout lint failed on an existing untracked
.mcp.json parse error; `pnpm exec biome check src scripts` passed. That local file was not changed.
Coverage exclusions differ by repository; worker/runtime entry points are not all measured.

## Decision and limitations

Prioritize neutral contracts, removal of runtime cycles, cohesive resource modules, explicit
command construction and bounded configurable I/O. Retain current provider and output behavior.
The owner explicitly excluded adding behavioral PR checks.

No load benchmark, live messenger action, security assessment, exhaustive function review or
measured developer task timing was performed. File length is evidence of concentration, not a
standalone quality score. Architecture findings above were verified by reading their owning source.

## Implementation prepared for review

The approved work is on separate branches and remains unmerged. The rename of cli-messaging,
behavioral PR CI, meeting-history pagination and SQLite worker offloading are outside this change.

| Responsibility | Before | After |
| --- | --- | --- |
| MAX client | 3456-line implementation | composition root plus resource factories; session, request, delivery and upload transport have separate owners |
| Shared messages | 1161-line implementation | composition plus read, write and search services with narrow contracts |
| Shared store | 1791-line implementation | resource contracts and factories; flat public compatibility interface retained |
| Embeddings | 851-line reviewed baseline | runtime, readiness, maintenance and search modules |

The composition files now contain 333, 22, 186 and 15 lines respectively. A TypeScript AST
inspection found zero static runtime import/re-export cycles involving services or store after
the refactor. The [cycle script](runtime-cycles.mjs) ignores explicit type-only edges and uses
TypeScript 5.9.3's compiler API; run it from the messaging checkout:

```sh
WIRECAT_TYPESCRIPT_API=/path/to/typescript-5.9.3/lib/typescript.js node /path/to/runtime-cycles.mjs
```

This checks local static edges, not dynamic imports or package initialization.

Draft changes: [MAX #609](https://github.com/WireCatLabs/max-cli/pull/609),
[shared #1092](https://github.com/WireCatLabs/cli-core/pull/1092),
[base #109](https://github.com/WireCatLabs/cli-base/pull/109),
[Telegram #483](https://github.com/WireCatLabs/tg-cli/pull/483).
GitHub renamed the shared repository to cli-core during this work; local package names and paths
still say cli-messaging. The [after inventory](inventory-after.json) records implementation commits.

Neutral ports and domain helpers remove services' dependency on CLI presentation. Store factories
retain transactions and lazy optional sources. Commander factories construct commands from provider
capabilities before registration. These boundaries make a resource change local and give lifecycle
state one owner; they do not establish a measured developer productivity improvement.

Uploads retain file-backed sources through MAX and Telegram adapters. Buffered voice preparation
checks the aggregate budget before conversion. Upload scheduling preserves order and stops scheduling
after failure. Output and subscriber queues honor backpressure; failed configuration reads propagate
instead of looking like an absent file. MAX session setup is single-flight and cancellation cannot
leave a late successful login ready after close.

Defaults are deliberately generous and configurable through flags, environment and profiles:
64 MiB machine output, 256 MiB buffered uploads, four concurrent uploads, 64 MiB per subscriber
and 256 MiB across subscribers. Ordinary file uploads have no additional CLI byte cap by default;
provider limits still apply. MAX retains its legacy error envelope and all-event run view. Command
discovery deliberately adopts shared contract version 1.

### Regression evidence

The latest MAX full run passed 1597 tests with two skipped across 133 files. Base passed 589
with two skipped across 39 files. Telegram's adapter/upload/map selection passed 202 tests.
Messaging's full run passed 3749 with four skipped and one failed generated-catalogue assertion;
the catalogue's old 4 MiB metadata was corrected and its tests rerun separately.
Type checks and builds passed. MAX repository lint and Markdown checks passed; base retained
eight existing fixture warnings. Node and Bun smoke checks passed. No new PR CI was introduced.

Consumers were validated against locally built shared source packages, including shared Commander
and MCP SDK identity where needed. Their current released version pins do not contain these new
exports. Release the shared changes and update consumer pins before shipping MAX or Telegram;
this review does not publish any package. A clean install using only the current published
dependencies is not evidence for the consumer refactor.

The [validation script](validate.sh) accepts explicit worktree paths and records commands and exit
statuses. Run the [inventory script](inventory.py) against those same checkouts for structural
counts. Synthetic regression tests support behavior preservation; they do not prove production
load capacity, real provider compatibility or the quality of every remaining module.

Before validation, install dependencies independently in isolated worktrees. Point messaging's
`node_modules/@wirecat/cli-base` at the base worktree; point each consumer's `@wirecat/cli-base`
and `@wirecat/cli-messaging` links at those worktrees. Point consumer Commander at messaging's
Commander, and MAX's Valibot and MCP server SDK at messaging's copies to retain shared runtime
and type identity. Do this only in the isolated worktrees. Avoid dependency reinstall during
validation: pnpm's automatic verification can replace these links with published packages.

```sh
bash validate.sh /path/to/base /path/to/messaging /path/to/max /path/to/tg
```
