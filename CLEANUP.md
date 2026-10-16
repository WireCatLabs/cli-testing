# Cleanup

What should be removed, recorded instead of removed mid-task: the path, why, the date. Removed in
one batch after the owner confirms.

- `.worktrees/security-paths/cli-messaging` — development or publication checkout; remove only after this task and its releases finish — 2026-10-09.
- `.worktrees/security-unicode/cli-core` — development or publication checkout; remove only after this task and its releases finish — 2026-10-09.
- `.worktrees/security-limits/cli-messaging` — development or publication checkout; remove only after this task and its releases finish — 2026-10-09.
- `.worktrees/security-restart/tg-cli` — development or publication checkout; remove only after this task and its releases finish — 2026-10-09.
- `.worktrees/security-delete/max-cli` — development or publication checkout; remove only after this task and its releases finish — 2026-10-09.
- `.worktrees/security-ci/cli-core` — development or publication checkout; remove only after this task and its releases finish — 2026-10-09.
- `.worktrees/security-core-release/cli-core` — development or publication checkout; remove only after this task and its releases finish — 2026-10-09.
- `.worktrees/security-mcp/cli-messaging` — development or publication checkout; remove only after this task and its releases finish — 2026-10-09.
- `.worktrees/security-messaging-release/cli-messaging` — development or publication checkout; remove only after this task and its releases finish — 2026-10-09.
- `.worktrees/security-messaging-publish/cli-messaging` — development or publication checkout; remove only after this task and its releases finish — 2026-10-09.
- `.worktrees/security-max-release/max-cli` — development or publication checkout; remove only after this task and its releases finish — 2026-10-09.
- `.worktrees/security-tg-release/tg-cli` — development or publication checkout; remove only after this task and its releases finish — 2026-10-09.
- `.worktrees/security-suites/cli-testing` — development or publication checkout; remove only after this task and its releases finish — 2026-10-09.
- `.worktrees/security-format/cli-messaging` — development or publication checkout; remove only after this task and its releases finish — 2026-10-09.
- `.worktrees/private-security-fixes` — keep until the journal and handoff land in private main and the task finishes — 2026-10-09.
- `/tmp/cli-core-security-unicode.tgz`, `/tmp/cli-messaging-security-candidate.tgz` — temporary local dependency builds; keep until published pins replace them — 2026-10-09.
- `~/Projects/AI/cli-testing-wt-tasks-duplicates` — worktree of branch `perf/tasks-duplicates` (PR for the duplicate-tasks test set); remove after the PR merges — 2026-10-14.
- `performance/tasks/duplicates/.cache/` — downloaded `@wirecat/cli-core@0.277.0` tarball, ignored by git; remove with the worktree — 2026-10-14.
- `~/Projects/AI/cli-private-wt-blog-duplicates` — detached cli-private worktree used to push POST-61 (`efff825f`); remove any time — 2026-10-14.
- `~/Projects/AI/cli-testing-wt-tasks-dates` — worktree of branch `fix/tasks-duplicates-dates` (date-pattern fixes in the duplicate set), with its `.cache/`; remove after its PR merges — 2026-10-14.

- 2026-10-16: `.worktrees/meeting-workflows`, `.worktrees/private-meeting-workflows` and `.worktrees/meeting-workflow-run` — synthetic meeting benchmark worktrees, pinned installs and retained fixture stores; remove in the owner's cleanup batch after reviewing `performance/agents/meeting-workflows/README.md`. `/tmp/meeting-workflow-*` logs/probes belong to the same task.
