# OpenClaw skills: does OpenClaw find the WireCat skills `skill install` writes?

Checked 2026-10-29 with OpenClaw 2026.10.8 and tg 0.106.0, max 0.85.0, whatsapp 0.16.0, zoom 0.59.0, memo 0.121.0,
drive 0.46.0.

## Why we ran it

The WireCat CLIs publish their skills for OpenClaw in two ways: on ClawHub as `wirecat-<tool>`, and on the
machine through `<cli> skill install`, which writes `~/.agents/skills/<name>/SKILL.md` with
`metadata.openclaw.requires.bins` naming the CLI. Hermes had been checked on a real install; OpenClaw had not.
The owner asked (NEED-54 A, "be careful with it") to check that OpenClaw finds the skills without touching the
owner's own setup.

The question: does OpenClaw list each WireCat skill from `~/.agents/skills`, and does it mark one as unusable when
its CLI is missing?

## Setup

- AMD Ryzen AI 9 HX 470, Linux 7.0. OpenClaw needs Node 24.22.1 or later, so Node v24.22.1 was downloaded from
  nodejs.org into a scratch folder and checked against its `SHASUMS256.txt`; the system Node was not changed.
- OpenClaw 2026.10.8 (two days old; 2026.10.9 was hours old) installed with npm into a scratch prefix, not globally.
- A throwaway `HOME` holding a copy of the owner's `~/.agents/skills`; `env -i`, so no D-Bus and no keyring, no
  sign-in, no onboarding, no gateway. OpenClaw created its state (`.openclaw/state/openclaw.sqlite`) inside that
  throwaway `HOME`, which is why the real one was kept out.
- Command: [`run.sh`](run.sh) `<node 24.22.1 bin dir> <PATH entries with the CLIs>`.

## Results

| Skill | Source OpenClaw reports | CLIs on PATH | CLIs not on PATH |
|---|---|---|---|
| `tg-cli` | `agents-skills-personal` | ready | missing `tg` |
| `max-cli` | `agents-skills-personal` | ready | missing `max` |
| `whatsapp-cli` | `agents-skills-personal` | ready | missing `wa` |
| `zoom-cli` | `agents-skills-personal` | ready | missing `zm` |
| `cli-memo` | `agents-skills-personal` | ready | missing `memo` |
| `drive-cli` | `agents-skills-personal` | ready | missing `drive` |

## What it showed

- OpenClaw reads `~/.agents/skills`, as its own docs say (`docs/help/faq/skills-and-automation.md` in the package:
  `<workspace>/skills` → `<workspace>/.agents/skills` → `~/.agents/skills` → `~/.openclaw/skills` → bundled), so
  `skill install --for all` is enough for OpenClaw; there is no `--for openclaw`.
- `metadata.openclaw.requires.bins` works: without the CLI on PATH each skill is listed as not ready, naming the
  missing command.

## Not checked

- An OpenClaw agent actually running a CLI through the skill (needs a model provider and a gateway).
- Installing from ClawHub (`openclaw skills install @wirecat/wirecat-<tool>`); `wirecat-tg` and `wirecat-whatsapp`
  are still waiting for ClawHub's review.
- macOS and Windows.
