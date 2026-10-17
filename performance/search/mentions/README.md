# Mentions: what rules find in one person's messages, and how long it takes

## Why we ran it

cli-messaging now finds phones, e-mail addresses, links and Google documents in stored message text and keeps
each one where it was written ([mentions plan](https://github.com/WireCatLabs/cli-core/blob/main/docs/dev/mentions-plan.md)).
The owner chose rules over libraries: phones are found by "looks like a phone", not checked against a numbering
plan, because `libphonenumber-js` installs 10 MB. The questions: how long a full `mentions rebuild` takes on a
real store, how much it adds to the file, and whether the rules find mostly real values. It decided whether the
rules ship as they are and whether finding mentions on every store write is cheap enough.

## Setup

- AMD Ryzen AI 9 HX 470 (24 threads), Node 24.19.0, `node:sqlite`. The full cli-messaging test suite was running
  at the same time, so the times are an upper bound.
- cli-messaging branch `feat/mentions-phase1` (store version 7), built with `tsc --build`.
- A backup copy of the owner's store (`sqlite3 .backup`), 4,436 messages, at store version 5; the copy is upgraded
  to 7 on open. The real file was opened read-only for the backup and never written.
- `node rebuild.mjs <cli-messaging checkout> <copy.db>` — three rebuilds, the median; totals only.

## Results

| | |
|---|---|
| upgrade 5 → 7 on open | 21 ms |
| full rebuild, 4,436 messages | 655 ms (about 0.15 ms a message) |
| mentions found | 861 |
| space in the file (table and indexes) | 256 kB |

| kind | mentions | different values | mean confidence |
|---|---|---|---|
| link | 763 | 589 | 0.86 |
| document | 59 | 49 | 0.95 |
| e-mail | 31 | 7 | 0.95 |
| phone | 8 | 7 | 0.80 |

201 of the links were written without `http` (a bare `site.ru`); the links name 219 sites.

## What it showed

- **Cheap enough for every write.** 0.15 ms a message: a sync that stores 500 messages spends under 0.1 s on
  mentions.
- **Phones: 8 of 8 were phones** on a look by the owner's agent at each one in place (not recorded here).
- **Links without a scheme caught code on the first run.** Method calls and a type name in pasted program code
  read as sites under `.at`, `.parts` and `.map`. The rule now skips a bare domain followed by `(` or `[`, or whose
  ending has a capital letter; the numbers above are after that change. The other bare sites looked real on the
  same check.

## What was not measured

- Recall: how many phones or links the rules miss. That needs a labelled sample.
- Stores much larger than this one; time is expected to grow in a straight line with the number of messages.
- Transcripts, file texts, notes, documents and mail: phase 1 reads message text only.

## Second run: files, voice notes and known people's names (2026-10-14)

Why: phase 1e reads the text of files and voice notes, and phase 2 finds names of people the store knows. The
questions: what the extra texts add, how many names the rules link without a person deciding, and whether the
rebuild stays cheap.

Setup: same machine; cli-core 0.269.0 (released) on the real store for files and voice notes, then cli-core
branch `feat/mentions-people` ([cli-core#1182](https://github.com/WireCatLabs/cli-core/pull/1182)) on a backup
copy for names. 5,435 messages and 80 file or voice-note texts. Totals only.

| | |
|---|---|
| full rebuild with 0.269.0, real store | 1.1 s, 1,055 mentions (96 from files and voice notes) |
| full rebuild with names, copy | 0.7 s, 1,627 mentions |
| names found | 572 |
| names linked by rule | 70 |
| people whose names are looked for | 88 (of 3,870 persons; the rest are known only from e-mail, by the look of them mostly companies and mailing lists — not counted) |

What it showed:

- **Latin profile names matter.** Of 41 name stems seen in the text, 13 matched only through the transliterated
  spelling (`Valery` → «Валерий»).
- **Short stems are ordinary words.** One two-letter stem matched 138 capitalized words, 135 of them the word «Или»;
  words under four letters are now skipped.
- **Few names link by rule.** A name links only to the one fitting person who wrote in that chat. One human is
  often a person row per messenger, so a first name fits two to five rows; 357 single-candidate names are in
  chats where that person never wrote.

Not measured: whether the found names are right (precision) or how many are missed (recall) — both need a
labelled sample, planned for phase 3.

## Third run: names with the released tg 0.55.0 (2026-10-14)

Why: the names rule shipped in cli-core 0.272.0 and reached the owner in tg 0.55.0. This checks that the released
build gives the same totals as the branch run above, on the real store this time.

Setup: same machine; installed `@wirecat/tg-cli` 0.55.0 (cli-core 0.275.0); command
`tg <profile> mentions rebuild person-name --json`, timed with `time`. Totals only.

| | |
|---|---|
| texts read | 5,435 messages, 80 file or voice-note texts |
| names found | 572, the same as the branch run |
| wall time | 3.4 s for the whole command, including start-up and opening the store |

What it showed: the released rule finds the same names as the branch. The 3.4 s is the whole process, not the
rebuild alone as in the 0.7 s row above, so the two are not comparable. A name search by person
(`mentions:"person:<id>"`) answered on the real store. Not measured: the time names add to `messages sync`.

## Fourth run: tracking links in mail (2026-10-15)

Why: store version 16 (cli-core 0.285.0) reads mail too. A full `mentions rebuild` on the owner's store made the
file grow by about 0.4 GB, nearly all of it links in mail. The question: how many of them are one-off tracking
links, and what keeping one per letter and site saves without losing a letter or a site from `domain:` search. It
decided the mail rule in [cli-core#1310](https://github.com/WireCatLabs/cli-core/pull/1310).

Setup: same machine; a `sqlite3 .backup` copy of the owner's store (store version 16, 92,444 letters with text);
cli-core branch `feat/mentions-other-sources` built with `pnpm build`;
`node rebuild-url.mjs <cli-core>/dist <copy.db>` (rebuilds `url` only), then `sqlite3 <copy.db> < mail-links.sql`
before and after. "Tracking-like" means a query string or a run of 24+ `[A-Za-z0-9_-]`. Totals only; the copy was
deleted after.

| | before | after |
|---|---|---|
| mail link rows | 733,311 | 450,118 |
| distinct mail link values | 409,635 | 98,611 |
| link text stored, MB | 99.8 | 14.3 |
| `mentions` table and its indexes, MB | 428 | 172 |
| letters with a link | 76,332 | 76,332 |
| sites in mail links | 20,838 | 20,838 |
| message link rows | 5,013 | 5,013 |
| rebuild of `url`, all sources | | 39 s |

Before the rule: 388,309 mail link rows were tracking-like (320,209 distinct values); only 9,389 of those values
were in more than one letter. They held 88 of the 100 MB of link text. 93% of all distinct mail link values were in
one letter only.

What it showed: tracking links are most of the mail link weight and almost never repeat, so an exact `url:` search
for one finds nothing useful. Keeping one per letter and site, valued as the site, removes 60% of the table and its
indexes and keeps every letter findable by `domain:`. Not measured: how many tracking-like links were real pages a
person would search for (a YouTube `watch?v=` link is collapsed too); the effect on `messages sync` time.

## Fifth run: finding a letter by its tracking link (2026-10-15)

Why: after the fourth run mail keeps a tracking link only as its site, so `url:"<the link>"` found nothing for it.
The owner wants a letter found by the whole link, by a part of a link and by site, without storing every link again.
The question: is reading the stored letter text fast enough for that. It decided the SQL in cli-core's
`mention-links.ts`: `url:` narrows to letters with a row of the link's site, then looks for the link in their body;
`link:` (a part of a link) matches stored links and the body of letters that hold a tracking link.

Setup: same machine, Node 24.19.0; a `sqlite3 .backup` copy of the owner's store with the `url` rule version 2
rebuilt on it (51 s); cli-core branch `feat/mail-link-search` built with `pnpm build`;
`node mail-link-search.mjs <cli-core>/dist <copy.db> 30 --no-rebuild`. It takes 30 random letters that hold a
tracking link, reads the first such link from each in memory, and runs three mail searches over both mail accounts
of the copy, 50 results a page: `url:` with the link as written, `link:` with its path, and `domain:` with its site.
Totals only; the copy was deleted after.

| | letters searched | median | slowest | the letter found |
|---|---|---|---|---|
| `url:` the whole link | 23 | 86 ms | 385 ms | 23 of 23 |
| `link:` its path | 22 | 504 ms | 861 ms | 8 of 8; 14 more had over 50 results, not checked |
| `domain:` its site | 23 | 27 ms | 71 ms | |

The copy has 257,020 letters; 67,429 of them (460 MB of body text) hold a tracking link, and `link:` reads all of
those bodies. Before the body was read only inside a subquery of letters with the site's row, `url:` took 0.9 s
(the `OR` read every letter's text); `lower()` on the body made `link:` take 1.06 s, `LIKE` 0.5 s.

What it showed: `url:` costs one indexed lookup plus a few bodies, so it is as fast as before for a person.
`link:` reads every body that holds a tracking link and stays under a second on this mailbox. Not measured: how
often `link:` finds a part outside a link in such a letter (it reads the whole body); stores with more mail.

## Sixth run: the url rebuild on the real store with the released tg 0.61.0 (2026-10-16)

Why: the fourth run measured the mail link rule on a copy; the owner's store kept every mail link until a rebuild
with a released tg that carries the rule (cli-core ≥ 0.292.0). The question: does the real store shrink the same.

Setup: same machine; the owner's store itself, `tg personal mentions rebuild url` with the released tg 0.61.0
(cli-core 0.292.0), counts read with `sqlite3 -readonly` before and after. Totals only.

| | before | after |
|---|---|---|
| mail link rows | 733,515 | 450,296 |
| distinct mail link values | 409,702 | 98,641 |
| letters with a link | 76,383 | 76,383 |
| sites in mail links | 20,842 | 20,842 |
| message link rows | 4,921 | 4,921 |
| `mentions` table and its indexes, MB | 428 | 172 |
| rebuild of `url`, all sources | | 41 s |

What it showed: the same cut as on the copy, with no letter or site lost. The file stays 2.4 GB: SQLite keeps the
freed pages inside the file for later writes. Not measured: a `VACUUM`, which would return them to the disk.

## Seventh run: unknown names and street addresses (2026-10-16)

Why: mentions plan phase 3 adds names of people the store does not know and street addresses (Russia, the rest of
Europe, the United Kingdom, the United States), read in every stored text. The questions: how many rows each adds,
where they come from, how long a rebuild of both takes, and whether the chats hold enough addresses to review.
It fed two choices: reading mail as well as chats, and drawing the precision sample from mail too.

Setup: same machine; a `.backup` copy of the owner's store (chats 7,629 messages, 257,139 letters, 325 documents);
cli-core branch `feat/mentions-phase3` (cli-core#1384) built;
`node rebuild-names-places.mjs <checkout> <copy>` runs `rebuildMentions({ kinds: ["person-name", "place"] })` once.
Totals only; the copy is deleted after the owner's labelling.

| | chats | mail | documents |
|---|---|---|---|
| unknown names (confidence 0.4 / 0.5) | 494 | 70,868 | 517 |
| known names, undecided or linked (0.6 / 0.9) | 877 | 105,755 | 1,141 |
| street addresses | 2 | 20,793 | 18 |
| addresses with a postcode beside them | 0 | 4,878 | 1 |

| | |
|---|---|
| rebuild of `person-name` and `place`, all sources | 103 s |
| `mentions` table and its indexes, MB | 172 → 188 |

What it showed: almost all of both kinds are in mail; the chats hold two addresses, so a review of addresses has
to read mail. The table grows by about 16 MB. A first build read «Отлично», «Логично» and «Основной» as
patronymics; the rule was fixed before these totals.

Precision, labelled by the owner on a random sample (his answers stay private; totals only):

| | sample | right | partly | wrong | right, share |
|---|---|---|---|---|---|
| unknown names in chats | 15 | 10 | 1 | 4 | 67% |
| unknown names in mail | 15 | 13 | 0 | 2 | 87% |
| street addresses | 30 | 30 | 0 | 0 | 100% |

At this size each share is a rough signal (about ±25 points). Every address was a real one, but the span stops at
the house number or the postcode: the city, the flat and the rest of the line are left out.

Whole addresses, after the span was extended over the rest of the address: the owner marked 4 of 10 as whole and 6
as partly; three more random samples of 30 were read on the copy with his leave, and the rule was fixed after each
(flat and suite words, `|` separators, a city with no comma before its postcode, the country on the next line of a
signature, Luxembourg and Swiss postcodes, the region before a Russian street). In the last sample about 22 of 30
were whole; the rest were addresses of countries outside the rule (Canada, Singapore, Armenia).

Not measured: recall — how many names and addresses the rules miss. It needs whole texts read.

## Eighth run: names and addresses on the real store with the released cli-core 0.308.0 (2026-10-17)

Why: the seventh run measured the phase 3 rules on a copy; the owner asked to bring them to his store before tg
moves to the new cli-core. The question: the same totals on the real store, and whether the build tg uses still opens
it after store version 18.

Setup: same machine; a `.backup` of the store taken first (deleted after the checks); a script that imports the
released `@wirecat/cli-core@0.308.0` from npm and runs `mentions.rebuildMentions({ kinds: [kind] })` for
`person-name`, then `place`; counts read with `sqlite3 -readonly`. Totals only.

| | chats | mail | documents |
|---|---|---|---|
| unknown names | 494 | 68,055 | 517 |
| known names, undecided or linked | 877 | 105,765 | 1,141 |
| street addresses with a postcode or city beside them | 0 | 12,625 | 1 |
| street addresses without | 2 | 8,168 | 17 |

| | |
|---|---|
| rebuild of `person-name`, all sources | 180 s |
| rebuild of `place`, all sources | 160 s |
| `mentions` table and its indexes, MB | 172 → 187 |
| `places` rows (confirmed addresses) | 0 |

What it showed: the real store matches the copy. With the address tail read, 61% of the addresses now carry a
postcode or city, against 23% in the seventh run. The released cli-core 0.303.0, which tg 0.63–0.64 is built on, still
opens the store after the migration to version 18. Not measured: a `VACUUM`.
