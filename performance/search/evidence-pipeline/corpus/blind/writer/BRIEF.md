# Brief: a test set of work conversations

You are writing a synthetic test set for a search tool that answers questions over a person's work messages,
documents and meeting transcripts. Everything is invented: people, companies, numbers. Write it the way real work
communication looks, in English and Russian (mixed, as real bilingual teams do).

Work only in this folder. Do not read anything under `/home/leemour/Projects` or anywhere else; this folder has
everything you need.

## What to write

Three projects, one file each, at `corpus/blind/<project>.json`, and their questions at
`questions/blind/<project>.json`. Invent new project ids; do not use any of these, which exist elsewhere:
dentavita, devdays, harrowfield, kelpwise, meeplehaus, mirlo, pulsefit, rentatech, solovey, stackyard, zelenydvor.
Prefix every unit id with a short project code so ids are unique across all three files.

Each project: a few chats, one or two documents (split into sections) and one or two meetings (split into
transcript turns), spread over a few weeks to a few months, 120–200 units per project. A project is a real piece of
work with a team, decisions, side topics, small talk and noise, not a list of answers.

Message length should look like real work chat: most messages are short, some are a paragraph, a few are long
(a status write-up, a pasted spec, a long argument), up to 8,000 bytes. Documents and transcript turns may be long
too.

## Questions

About 14 per project, in the language a team member would ask in (mix English and Russian). Each project must
include all of these:

1. a real answer phrased as a denial ("do not keep logs longer than 21 days")
2. a conditional yes ("yes, if security passes")
3. approval of a heading, not of the content under it
4. a proposal that nobody accepted
5. two competing current versions
6. a decision that was later cancelled or reversed (see below; five of these per project)
7. two different people or projects with the same name
8. a question whose answer is absent from the corpus

**Cancelled or reversed decisions: five questions per project, `kind: "revoked"`.** Something was decided, and
later it was cancelled, reversed or replaced. The question asks what the current state is. Write the cancellation
however it would really happen in that team, and vary it across the five as real life varies. Grade the unit that
states the current state as 3 and the original decision as 2.

**Decisions that still stand: two questions per project, `"control": true`.** Something was decided, and later
messages come back to the same subject without changing the decision. The question asks what was decided; the
answer is the original decision. Give these a `kind` that fits (usually `fact` or `approval`).

At least a third of all questions are negative, conditional, conflicting, cancelled or unanswerable.

## Format

See [FORMAT.md](FORMAT.md). Every grade-3 unit of a question gets a `spans` entry with the exact sentence(s)
of that unit that state the answer, copied character for character.

## Check

Run `python3 -I validate.py blind` from this folder until it prints no errors. It prints only counts and hashes.

When done, reply with only: the three project ids, the number of units and questions per project, and the last
`validate.py` output. Do not describe or quote the content.
