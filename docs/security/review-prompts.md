# Manual review — reviewer prompts

The six read-only reviewers of a run (step 4 of [`RUNBOOK.md`](RUNBOOK.md)), one per area, run in
parallel. Each gets the same preamble, its own checklist items from [`METHOD.md`](METHOD.md), and
the same report shape.

## Preamble, for every reviewer

> You are a security reviewer. READ-ONLY: do not edit files, do not run the CLIs, do not contact any
> messenger or network service, never print the contents of token or session files. Code: a clean
> export of `origin/main` at `<export-dir>/{<repos>}`. These are Node/TypeScript CLIs driving the
> owner's real messenger accounts; shared code lives in the libraries they depend on. Report ONLY
> real candidate issues plus a one-line "safe because …" per area. Skip tests, `scripts/`, `bench/`
> unless shipped.

## Report shape, for every reviewer

> 1. Per checklist item: verdict (safe / candidate finding / not applicable) with the key evidence
>    as `repo/path:line`.
> 2. Candidate findings: title, `repo/path:line`, who the attacker is and what they must control,
>    concrete impact, severity guess, confidence, and "verified by reading" kept apart from
>    "inferred".
> 3. What you could not check.

## The six areas

1. **Install, update, processes — S1, S2, S3.** The install script and what it imports; the
   self-update path (can a registry answer reach a shell or a path?); every process spawn — shell or
   not, where arguments come from, `$EDITOR`/`$BROWSER`, Windows `cmd.exe` and `.cmd` lookups.
2. **Local servers and write gating — S4, A4, A6.** Bind address, authentication, OAuth, Host and
   Origin checks; every tool and command that writes, traced to the permission gate; can an agent
   change its own permissions; do tool annotations match behaviour.
3. **Text from other people reaching the agent — A1, A2, A3, A5.** Where untrusted text enters tool
   results, descriptions, instructions, prompts, errors; hidden Unicode classes in machine output;
   spoofed structure; every way an agent could move private content out. Ends with benign payload
   ideas for the agent test.
4. **Secrets, downloads, network — S5, S6, S7.** File modes and races on creation, keyring and log
   redaction, tokens in argv or URLs; remote file names on disk; TLS settings, redirects,
   attacker-chosen hosts.
5. **Parsers and downloaded code — S8.** Wire frames, archives and office formats (size, entry and
   depth caps, entities), images, SVG, encodings, YAML, templates, ReDoS; where models and native
   libraries come from and whether their hashes are checked.
6. **CodeQL triage.** Every open alert: real · not reachable · not shipped · false positive ·
   fixed, with a dismissal reason for each non-real one.
