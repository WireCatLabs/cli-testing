# Removing CRM contacts outside a narrowed scope

## Why it was run

The owner's Bitrix24 copy held the whole portal: 57,156 deals, 10,130 leads, 2,761 companies and 114,165 contacts.
b24 now copies only the deals and leads of the users the owner chooses (b24 #68), and `sync --rescan` marks
the rest of the deals, leads and companies deleted. Contacts were never removed, because cli-core's deletion check skips
them, and 101,876 of them carried an import's `null #<id>` in their name. The owner asked for all of them to go
at once, without a long wait (2026-11-10).

The questions:

- How long does the single pass that removes them take on a store of that size?
- How many contacts and people does it remove, and how many people stay because of their other data?
- How many names does it clean?

The answers decide whether the pass can run inside `sync --rescan` without an extra step from the owner.

## Setup

- **Machine:** AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0 (its own SQLite).
- **Code:** cli-core [#2825](https://github.com/WireCatLabs/cli-core/pull/2825) on `main` at 0.630.0, built with
  `pnpm build`. Opening the copy moves it from store version 63 to 64.
- **Data:** a `.backup` copy of the owner's store (4.2 GB), taken read-only. Each case starts again from a fresh copy
  of it. Only totals are written here.
- **What a case does:**
  - A dry run of the pass on the copy as it is: `removeContacts({ dryRun: true })`, what `store apply` prints before
    a narrowing.
  - Then it narrows the copy as `sync --rescan` would. Deals and leads go through cli-core's own `removeOutOfScope`.
    For companies the portal decides during a real sync, so the script marks deleted every company no kept deal or
    lead names, own companies aside.
  - Then the real pass, committed with the store's usual drains, and checks on the result.
- **Two scopes:**
  - **A:** one user with no deals and no leads. Nearly every contact goes, the most a pass can remove.
  - **B:** the user with the second-most deals (38,541 deals out of scope).
- **Command:**

```sh
sqlite3 'file:<store>?mode=ro' ".backup <copy>"
CLI_CORE=<cli-core checkout> CRM_CONTACTS_STORE=<copy> CRM_CONTACTS_ACCOUNT=<portal host> CRM_CONTACTS_USERS=<ids> \
  node performance/crm/contact-removal/bench.mjs
```

[`bench.mjs`](bench.mjs) refuses the owner's own store file and prints JSON.

## Results

| Scope | Contacts removed | People deleted | People kept for other data | Names cleaned | Pass | Dry run first |
|---|---|---|---|---|---|---|
| A | 114,165 of 114,165 | 114,165 | 1,907 | 1,834 | 20.2 s | 27.3 s |
| B | 95,638 of 114,165 | 95,638 | 1,777 | 19,643 | 10.1 s | 10.4 s |

- **The dry run** counts slightly fewer contacts than the pass removes: A 113,574, B 95,171. Before the narrowing
  every company is still kept, so their contacts are too.
- **People deleted equals contacts removed by chance.** It is the contacts' own people that are left empty, plus the
  empty person each same-address join left behind, minus the people that stay.
- **Checks after each pass:** no link and no identity link points at a deleted row, the foreign-key check on
  identity links is clean, the owner's person stays, and no person linked to a remaining contact keeps `null` in the
  name.

Where the 20 s of scope A go:

| Step | Time |
|---|---|
| Choose the contacts (one `INSERT … SELECT`) | 0.4 s |
| Delete about 57k CRM links to them | 17.8 s |
| Delete identity rows and identities | 1.0 s |
| Delete people, clean names, the rest | 0.6 s |

The link step is one statement. Its time is the `link_revisions_ad` trigger: each deleted unconfirmed link looks for
the owner's rejection among every rejected relationship proposal, decoding each one's JSON. On 8,386 links that is
3.4 s with the trigger and 0.14 s without it.

## The trigger that made it slow (store version 63)

The first run of the pass did not finish in 8 minutes. Store version 63's `person_kind_deal_link_ad` looks up a deal's
other people with `d.from_type = … AND d.from_id = … AND d.to_type = 'person'`. SQLite chose `links_by_to_type_to_id`
for it, because that index also holds `to_id` (it covers the query). So each deleted deal link read every link to a
person, 118k on this store.

| 635 deal links deleted | Time |
|---|---|
| version 63 triggers | 15.4 s |
| version 64 (`+d.to_type`, so the `(from_type, from_id)` index is used) | 0.39 s |

At about 24 ms a link, the pass would have taken about 20 minutes. Every CRM sync paid the same price for each deal
link it wrote. Version 64 recreates the three deal-link triggers and the two deal-owner ones. cli-core's
`version-64.test.ts` checks their plans.

The measurement, inside a transaction that was rolled back, on a copy of the store:

```sh
sqlite3 <copy> "BEGIN; CREATE TEMP TABLE p AS SELECT DISTINCT to_id id FROM links WHERE source = 'crm' AND
  from_type = 'deal' AND role = 'contact' LIMIT 500; DELETE FROM links WHERE source = 'crm' AND to_type = 'person'
  AND to_id IN (SELECT id FROM temp.p) AND from_type IN ('deal', 'lead') AND role IS NOT 'owner'; ROLLBACK;"
```

## What it showed

- One pass removes a whole portal's contacts in 10 to 20 s, so it runs inside `sync --rescan` under scope mine with
  no extra step.
- **Cost:** it holds the store's write lock for that long, so another WireCat tool that writes meanwhile waits.
- A further 17 s could go by indexing the owner's rejected relationship proposals for `link_revisions_ad`. That
  trigger came with store version 56. Not done here.

## What was not measured

- A real narrowed sync against the portal. The companies the portal keeps were approximated, so the real removal may
  keep a few more contacts.
- The owner's real scope. He had not chosen his users yet, so A and B bound it from both sides.
- Time on a store another process writes to at the same moment.
