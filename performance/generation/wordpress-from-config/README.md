<!-- cspell:words attio wordpress -->

# A content CLI from one config: wordpress-cli against attio-cli

Measured 2026-11-19 on the first release of `wordpress` (`@wirecat/wordpress-cli` 0.1.0).

## Why it was run

The connector-factory plan says a new WireCat CLI should come mostly from one file, `wirecat.config.ts`. attio-cli
tested it on a CRM with an OpenAPI description, and linear-cli on an issue tracker over GraphQL. wordpress-cli is the
third pilot and tests three pieces that had never had a user: the `wp-json` spec kind (a WordPress site describes its
own API), sign-in with an application password, and the `content` category (posts, pages, tags and authors, with
writes and publishing). The owner asked to publish it on 2026-11-18.

The question: with no hooks, how much does the builder still write by hand, how long does it take to a green
`cli-dev ready`, and what can the config not say? The answer decides what the shared packages fix before the next
content CLI (Ghost is planned next).

## Setup

- `npx @wirecat/cli-template@0.32.0 new --from-config wirecat.config.ts` at 07:10:03, on cli-core 0.707.0 and
  cli-base 0.123.0. It finished on cli-base 0.124.0, which carries the `ready` fix below.
- The config started from the template's own WordPress case. It changed only the names and the address of the index.
- The API description came from a plain WordPress 6.9.4 in Docker, with no plugins: one request to
  `/wp-json/?context=help`. No request reached a real site.
- Hand checks of the built CLI ran on the same Docker site with three test users: a Contributor, an Author and an
  Editor, each with its own application password, credentials in a file in a temporary folder.
- One builder agent, with two helper agents (the docs) and four reviewer agents (two for the shared packages, two
  for the CLI).
- Lines are counted with [count.mjs](../yandex-disk/count.mjs), with the first commit (the output of `new`) as the
  baseline, as for linear-cli. attio-cli's numbers are from [source-manifest](../source-manifest/README.md).

```sh
node ../yandex-disk/count.mjs <wordpress-cli checkout> cb205b1
wc -l <wordpress-cli checkout>/wirecat.config.ts
```

## Results

| | wordpress-cli | attio-cli (first build) |
|---|---|---|
| Template | 0.32.0 | 0.28.0 |
| `wirecat.config.ts` lines | 117 (3 kinds, 6 calls, 5 writes) | 64 (3 kinds) |
| Hook lines | 0 | 23 |
| Source written after `new`, hooks included | 81 (10 before the review, 71 from it) | 42 |
| Scripts written after `new` | 52 (43 counted, 9 inside the first commit) | not counted |
| Tests written after `new` | 223 | 98 |
| Generated lines | 23,324 (147 operations) | 107 operations |
| `new` to the first commit, generated and checked | 3 min (07:12) | not measured |
| `new` to every `cli-dev ready` row verified except the live check | about 40 min (07:10 to 07:50), the cli-base release included | about 2 h 40 min |
| `new` to the release commit, after two reviews and the live check | 1 h 20 min (08:30) | not measured |

The hand-written lines, by what they are for:

- **Source (81 lines):** 10 lines of texts a user and WireCat Desktop see (tagline, sign-in texts, what the MCP
  answers carry), then 71 lines from the reviews, almost all in `src/config.ts`: the permission keys. The template's
  content wiring did not pass the content write keys to the permission preview, the `api` group could make an
  application password and print it, writes that change the whole site ran without a question, and a deny on
  `posts.create` did not stop `api posts-create`. Each is a gap of the shared packages, logged and fixed here in
  the CLI's own config until they move.
- **Scripts (52 lines):** the live check (`scripts/live.sh` signs in with `--site` and `--login`, syncs, and checks
  posts, pages and tags), and in `scripts/generate.ts` two command names and the permission key form. The first 9
  lines of names went into the first commit, because `pnpm generate` could not run without them, so `count.mjs`
  does not see them. They are added here by hand.
- **Tests (223 lines):** every `api` option with its value and `--all` over two pages, every content command
  option with what it changed on the fake, the content sync contract, and the permission defaults. The first 130
  moved into cli-template the same day ([#204](https://github.com/WireCatLabs/cli-template/pull/204)).

## What it showed

- **The config carried the whole source, with no hook.** Posts and pages in every status, the trash too, changes by
  `modified_after` with a keyset, an id pass for deletions, tags and categories as the store's tags, authors as
  people, and writes with publishing and scheduling: 117 lines of data. The hook module the plan allowed (under 100
  lines) was not needed.
- **The template's WordPress case was tested on 19 routes, a real index has 127.** On the full index, two routes
  took the same command name and `pnpm generate` stopped, and a route with `_` (`wp_pattern_category`) gave a
  permission key the settings check refused, so all 151 `api` tests failed. Both were fixed in the template.
- **A real WordPress found what the fakes could not.** The fakes accept any call the API description allows. The
  Docker site refused by role:
  - An Author or a Contributor may not read tags with `context=edit` (fixed in the config: a term's name is public).
  - An Author or a Contributor gets HTTP 400 on the pages list, and that stops the sync of all posts (logged for
    cli-core, not worked around).
  - An Editor may not list users, so authors do not become people for an Editor.
- **The writes worked on the live site on the first run:** a draft from Markdown, a title change that kept the
  embed of a block post, a refused body write on that post, a refused write after a change on the site, the trash,
  a delete for good, publishing now and scheduling. WordPress refused publishing to the Contributor, as it should.
- **Two fresh reviews found what every check passed.** The first found that the `api` group offered
  `users-application-passwords-create`, whose answer holds a new password in clear: the wp-json converter marks no
  field secret, so cli-core could not leave it out. It also found that the permission preview showed `allow` for
  writes that ask, and that the new tests checked only the exit code. The second found that a deny on a content
  command did not cover the same write through the `api` group. All were fixed before the push.
- **`cli-dev ready` did not know the content category.** Fixed in cli-base 0.124.0 (#664). The test matrix found
  501 options with no test, as it did for linear-cli: the template's tests did not cover the `wp-json` and content
  seeds.

## What was not measured

- A real WordPress site: every live check ran on WordPress 6.9.4 in Docker, with no plugins. Sites with plugins,
  caching or a security layer that hides routes were not tried.
- An Administrator: the users list (authors as people with their e-mail) was checked against the fake only.
- WordPress.com and Jetpack sites, and view counts: not supported.
- attio-cli again: its numbers are its own measurement's. The scopes differ (content with writes against a CRM that
  only reads).
- Hours a person spent: the owner answered no question during the build.
