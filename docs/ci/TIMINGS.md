# Approximate check timings

These figures are planning ranges, not CI deadlines. Baseline CI and local hooks were measured
on 2026-10-10. The CI ranges include headroom above the first successful updated runs;
release durations remain estimates for the revised profile. Local CLI typechecks measured about 1–6 seconds each, with several
projects checked concurrently; allow 5–30 seconds on CI runners. Queues, cold dependency downloads, registry propagation, and deployment can
add time. Parallel jobs overlap; their durations should not be summed.

## By project

| Project/package | Local commit | GitHub push with an open PR | Main after PR merge | Full release |
| --- | --- | --- | --- | --- |
| cli-core | About 1 s | 20–40 s | 20–40 s | 3–5 min |
| cli-meetings | About 1 s | 20–40 s | 20–40 s | 3–6 min |
| cli-memo | About 1 s | 30–50 s | 30–50 s | 3–5 min |
| cli-messaging | About 1 s | 30–60 s | 30–60 s | 10–15 min |
| cli-tasks | About 1 s | 20–40 s | 20–40 s | 3–5 min |
| cli-testing | About 1 s | 20–40 s | 20–40 s | 3–7 min |
| max-cli | About 1 s | 40–70 s | 40–70 s | 8–15 min |
| tg-cli | About 1 s | 30–60 s | 30–60 s | 6–12 min |
| zoom-cli | About 1 s | 20–40 s | 20–40 s | 3–5 min |
| cli-docs | About 1 s | 40–60 s | 40–60 s plus deployment | 10–20 min deployment |
| cli-messaging-onnx | Messaging hooks | Messaging ordinary CI | Messaging ordinary CI | 5–15 min |
| cli-messaging-sqlite | Messaging hooks | Messaging ordinary CI | Messaging ordinary CI | 5–20 min |

There is no local push check. A feature-branch push without an open PR does not start ordinary CI;
the workflow listens to PR events and pushes to `main`. Ordinary checks repeat after merging.
The docs site also retains its automatic main-branch deployment with full site checks.
Community has no npm release; its static checks previously took about 13 seconds.

Monthly validation uses the full-validation portion of a release, plus security scans and any
separately scheduled native probes. It omits npm publishing and site deployment.

## By check

| Check | Runs when | Approximate cost |
| --- | --- | --- |
| Staged Biome | Commit | Usually below 1 s |
| Staged Gitleaks | Commit | Usually below 1 s; parallel with Biome |
| Checkout, tool setup, dependency install | CI | About 10–30 s with caches; longer cold |
| Config integrity | PR/main | Below 1 s |
| Repository lint | PR/main | About 1–3 s |
| Markdown lint | PR/main | About 1–3 s |
| New-commit Gitleaks | PR/main | About 1–3 s including scanner download |
| CLI typecheck | PR/main, full validation | Allow about 5–30 s depending on package |
| Docs synthetic unit tests | PR/main, full validation | About 2 s locally for the PR subset; 5 s in the first updated CI run |
| Full unit tests and coverage | Release/monthly/manual | Seconds for small packages; 1–3 min for large packages |
| Build, docs/contracts, parity, Bun smoke | Release/monthly/manual | Seconds to a few minutes |
| OS/install matrices | Release/monthly/manual | Several minutes |
| Browser checks and site export | Site deployment/monthly/manual | Several minutes; full pipeline about 10–20 min |
| Dependency/workflow audits and CodeQL | Release/monthly/manual | Seconds to several minutes |

Some projects have an additional mandatory secret-security job that scans the entire Git history.
It remains enabled, so secret checking is not exclusively limited to new commits.
Production dependency and source checks block critical findings; other findings need owner review.
Scanner failures must be fixed rather than treated as a clean result.

Previously measured complete fast jobs, before `ci:quick`, took 16 s for core, 37 s for docs,
16 s for meetings, 28 s for memo, 19 s for messaging, 15 s for tasks, 22 s for testing,
26 s for MAX, 22 s for Telegram, and 16 s for Zoom. Typical complete commit hooks took 0.3–1.5 s.

The first successful updated PR jobs, including `ci:quick`, took 18 s for core, 34 s for docs,
19 s for meetings, 27 s for memo, 29 s for messaging, 21 s for tasks, 17 s for testing,
22 s for MAX, 29 s for Telegram, and 20 s for Zoom. Community took 14 s.
These are job durations, excluding queue time and independently posted third-party checks.

Some release checks currently repeat between full validation and the original release build.
Keep that duplication visible when measuring; reducing it is a separate change.
