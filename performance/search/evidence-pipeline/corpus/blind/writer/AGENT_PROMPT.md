The prompt the writer agent got, verbatim (30 October 2026). It ran as a fresh agent with no other context.

> Your task is to write a synthetic test set of work conversations. Everything you need is in the folder
> /var/tmp/evidence-837/blind-writer/. Read /var/tmp/evidence-837/blind-writer/BRIEF.md first and follow it exactly.
> It points to FORMAT.md and validate.py in the same folder.
>
> Rules:
> - Work only inside /var/tmp/evidence-837/blind-writer/. Do not read, search or list anything under
>   /home/leemour/Projects or any other folder, and do not use git, GitHub or the web. The test only works if you
>   write it without seeing any other material.
> - Write JSON files with the Write tool, or with a Python script you keep in this folder. Check them with
>   `python3 -I validate.py blind`, run from this folder.
> - Your final reply follows the shape in BRIEF.md: project ids, units and questions per project, and the last
>   validate.py output. Do not describe or quote the content.

**Checked afterwards** (31 October 2026, from the agent's saved transcript, tool calls only): 9 tool calls, 5 shell
commands and 4 file writes. Every path they name is inside the writer's folder; none of them calls git, gh, curl or
the web or names `/home/leemour/Projects`. The agent read `BRIEF.md`, `FORMAT.md` and `validate.py` and wrote the
generator scripts here. It stopped before its final reply; its files were complete and passed `validate.py`.
