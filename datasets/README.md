# Local datasets

Synthetic data that a check, a benchmark or a sandbox made, kept on this machine so the next run can start from it.
Only this index is in git: each folder lives in the main checkout, `/home/leemour/Projects/AI/cli-testing/datasets/`,
and is git-ignored.

Everything here is synthetic. The owner's real data never comes here: no copy of `~/.local/share/WireCat/wirecat.db`,
of a tool's real store or of a sign-in.

## Add a dataset

1. Copy the data to `datasets/<name>/` in the main checkout. Leave out installed tools, `node_modules` and npm
   caches: they come back with an install and are most of the size.
2. Add a row below: the folder, what it is, what made it, how to use it, how to make it again, its size and date.

## Datasets

| Folder | What it is | Made by | Use it | Make it again | Size | Date |
| --- | --- | --- | --- | --- | --- | --- |
| `desktop-sandbox-msgseed/` | A Desktop sandbox home seeded with demo messages: the WireCat store (`.local/share/WireCat/wirecat.db`), the tg, max, mail, whatsapp and memo stores, memo's config and 56 notes in `Notes/` | wirecat-desktop `bin/sandbox msgseed --seed demo`, for the messenger seed step (wirecat-desktop #295) | Copy it to `~/.cache/wirecat-sandbox/<name>/` and start `bin/sandbox <name>`. The tools the app installs are left out, so the app installs them again | `bin/sandbox <name> --seed demo` in wirecat-desktop | 4 MB | 2026-11-10 |
| `memo-people-split/` | A memo store before and after confirming and undoing an agent's split (`store-before-confirm.db`, `store.db`, `store-unmerge.db`), its records file `env.json` and the review answers in `fx/` | A check of memo 0.131.80's people split and unmerge | `MESSAGING_STORE=<folder>/store.db memo people review --json`, with `DBUS_SESSION_BUS_ADDRESS=disabled:` and a throwaway `HOME` | Seed `env.json` into an empty store with memo 0.131.80 | 8 MB | 2026-11-10 |
| `desktop-analytics-store/` | A small WireCat store used to screenshot the Desktop Analytics page | The Analytics agent's sandbox for Desktop 0.6.0 | `MESSAGING_STORE=<folder>/store.db` with the commands above | A Desktop sandbox with `--seed demo` | 3 MB | 2026-11-10 |
| `desktop-sandbox-<name>/` for `demo`, `seeddemo`, `seedfresh`, `seedfresh2`, `rv289`, `check-150524` | Desktop sandbox homes seeded with demo data, each as a check left it: the WireCat store, memo's and mail's stores and config, notes in `Notes/` (`seedfresh2` also has a `sync.json`) | wirecat-desktop `bin/sandbox <name> --seed demo`, by Desktop checks before 0.6.0 | As `desktop-sandbox-msgseed/` | As `desktop-sandbox-msgseed/` | 3 to 4 MB each | 2026-11-09 to 2026-11-10 |
| `desktop-sandbox-seedtest/`, `desktop-sandbox-seedwork/` | Desktop sandbox homes seeded with tools only, no demo messages | `bin/sandbox <name> --seed tools` | As `desktop-sandbox-msgseed/` | `bin/sandbox <name> --seed tools` | 3 to 4 MB each | 2026-11-10 |
