# Offline upgrade checks

Run these checks to verify that a candidate CLI preserves synthetic state made by the supported
published version. They use actual Node binaries and installed npm aliases in a separate test dependency directory, never CLI source APIs
for assertions. Dependency installation happens before isolation and can access the registry;
the CLI processes cannot use the network, keyring, native addons or child processes.

## Baselines and coverage

| CLI | Supported previous package | Retired-schema probe | State checked |
| --- | --- | --- | --- |
| MAX | `@wirecat/max-cli` 0.44.0 | 0.43.1 | config migration, cached messages, tasks, recorded logs |
| Telegram | `@wirecat/tg-cli` 0.45.0 | 0.44.1 | config migration, cached messages, tasks, recorded logs |
| Zoom | `@wirecat/zoom-cli` 0.2.1 | none | profile config, imported transcript, meetings, search and export |

The previous alias is the release baseline for the next candidate, so its version can equal the
checkout's package version until the next version bump. The previous packages have their own frozen lockfile under `contracts/previous/`, installed only
by the full-validation gate. Their bins cannot shadow normal development commands.
Update the baseline deliberately after a release;
keep the legacy-schema probe pinned separately. The runner checks `--version` before using it.

MAX/Telegram use a caller-owned fixture generator that resolves the previous executable's real
path and its installed store dependency. It writes invented rows and account hints, without a
credential or network call. Assertions then use the actual previous and candidate CLI binaries.
This preserves the previous runtime's schema rather than accidentally seeding with the candidate.
Zoom creates its state entirely through the previous binary's file import command.

Legacy permission configuration is previewed without changing bytes, applied while retaining
limits and effective read-only levels, then applied again with `changed: false`. Stored messages
remain readable after the candidate opens and explicitly migrates the supported database. Tasks
are created, read and closed across processes; reviewed error codes and JSON streams are checked.
Zoom verifies the same meeting ID and transcript after reopening, repeat-import deduplication,
search, exact exported content and refusal to overwrite that content.

## Retired stores

MAX 0.43.1 and Telegram 0.44.1 use a retired store baseline. The current store uses a new baseline
and default filename; it does not automatically migrate those old databases. The separate probe
passes an explicit synthetic `MESSAGING_STORE` and verifies a configuration error, an unchanged
SHA256 and successful reread by the old binary. This proves safe rejection for that explicit path,
not migration of every historical default store or preservation by reset commands.

## Leak coverage and limits

MCP stderr is capped at 64 KiB and scanned before returning schemas. Every process's stderr is scanned for credential/phone patterns and synthetic canaries. Requested
synthetic data on stdout may explicitly allow its canaries, while credential/phone patterns remain
checked. Other stdout must be clean. MAX/Telegram's `--trace` and `--record` cases exercise recorded
success and failure paths; the generated run tree is scanned without copying its contents into
reports. Static checks scan the reviewed plans, fixtures and testing guide.

The standalone `security no-leak` policy contains `paths` relative to one root and optional
`canaries` of at least eight characters. Bearer, JWT, credential-field and international-phone
patterns are heuristics; arbitrary unknown messages require explicit canaries. Findings contain
only rule identifiers, relative paths and lines. Sensitive filenames use hashed labels; line zero
marks a filename finding. Binary files, symlinks, missing artifacts,
more than 1,000 visited entries, a file over 8 MiB or total files over 32 MiB fail closed.

## Run

```sh
pnpm build
pnpm contracts:check
pnpm contracts:upgrade
pnpm security:no-leak
```

These gates run on release, monthly validation and manual full validation. They add no commit,
push-hook or ordinary PR test suite. Live protocols, arbitrary account casts, all command-table
paths and reset/downgrade behavior remain separate tests.
