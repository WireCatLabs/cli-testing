# Conventions

What is shared with the sibling CLIs is written once, in max-cli's
[`CONVENTIONS.md`](https://github.com/leemour/max-cli/blob/main/docs/dev/CONVENTIONS.md): Biome decides
formatting, strict TypeScript with no `any`, comments only for *why*, the environment as arguments,
documents that state current facts. Command and MCP names follow cli-messaging's
[`STANDARD.md`](https://github.com/leemour/cli-messaging/blob/main/docs/dev/STANDARD.md). This page
adds only what differs.

## Code

**`src/` is the package.** Every `.ts` file under it is published. A new entry point is a new
`exports` entry in `package.json` and a line in [`scripts/smoke.ts`](../../scripts/smoke.ts).

**The clock, the id and the process runner are arguments.** A suite takes `now`, `newId` and how
to start a process; the real ones are only defaults, so a test never waits, never guesses an id and
never starts a real CLI.

## Documents

English. `README.md` is the user page: current facts only, no correction marks, no backlog or
decision ids. `docs/dev/` is for whoever works on the code and states current facts too: a claim that turns out
wrong is rewritten with no mark, and git keeps the old text. A finished plan is deleted.

## The changelog

`CHANGELOG.md`, newest first. The top section is `## Unreleased` while work is merged; a release
dates it as `## <version> — DD.MM.YYYY`. Headings, each at most once per version: `Added`,
`Changed — may break callers`, `Fixed`, `Security`, `Removed`. Every entry says what changed as a
caller sees it, why, and what to watch for. `pnpm docs:check` checks the shape.
