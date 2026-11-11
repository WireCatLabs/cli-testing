# What waits in the memory review, and what the owner decided

## Why it was run

On 2026-11-11 the owner opened WireCat Desktop's Memory review and found document owners and last editors listed as
items to approve. His words: "the owner of file is creater from api response. the last editor - we likely dont care
and anyway not a memory to review. memory should capture smth important, deduce some facts from data."

The question: on his real store, what is waiting by kind and role, what did he decide, and are metadata rows still
waiting after the fix in [drive-cli #352](https://github.com/WireCatLabs/drive-cli/pull/352)? The answer decides
whether stored rows need a one-time data fix, and which generator to look at next.

## Setup

- Date: 2026-11-11. One read-only run of [`measure.sql`](measure.sql) on the owner's store:
  `sqlite3 -readonly -bail ~/.local/share/WireCat/wirecat.db < measure.sql`.
- Versions: `drive --version` 0.65.0, `memo --version` 0.131.81. cli-core `origin/main` at `267202ad5` (0.636.0).
- Only totals are published. No title, name, address or message text was read into this page.

## Results

**Owner and last-editor proposals.** All were decided in one day, by the owner, and none is waiting.

| Role | Proposed by | Rejected | Approved | Waiting | Decided on |
| --- | --- | ---: | ---: | ---: | --- |
| owner | agent, from a Drive file | 1,143 | 0 | 0 | 2026-11-10 |
| last-editor | agent, from a Drive file | 28 | 0 | 0 | 2026-11-10 |

**Links from documents today.**

| Role | Written by | Standing | Links |
| --- | --- | --- | ---: |
| owner | Drive sync | `reported` | 1,119 |
| key | owner | `confirmed` | 1 |
| owner or last-editor, waiting | any | `proposed` | 0 |
| last-editor, any standing | any | any | 0 |

The store holds 1,494 documents, 24 of them deleted.

**Relationships a rule worked out from activity.**

| Rule | Approved | Rejected |
| --- | ---: | ---: |
| chat-senders (wrote often in a project's chat) | 7 | 1 |
| member-dialog (a dialog with a project member) | 4 | 0 |

**What waits, by kind.**

| Kind | Waiting |
| --- | ---: |
| `identity_link` (two accounts may be one person) | 262 |
| `mail_findings` (batches) | 79 |
| `evidence_findings` (batches) | 2 |
| `key_document` | 2 |
| `meeting_findings` (batches) | 1 |
| `relationship` (from an agent) | 1 |
| facts | 3 |
| memories | 2 |
| task closes | 0 |

**Parts of the waiting findings batches.**

| Finding | Mail | Documents and messages | Meetings |
| --- | ---: | ---: | ---: |
| task | 148 | 3 | 2 |
| fact | 18 | 12 | 0 |
| payment | 17 | 0 | 0 |
| new contact | 8 | 0 | 0 |
| order | 3 | 0 | 0 |
| invoice | 1 | 0 | 0 |

No findings batch has been decided yet.

**Links a source reports, kept out of the review.** Deal to person 51,384, lead to person 9,225, document to person
1,119, person to organization 30.

## What it showed

- Metadata proposals are gone from the queue. No owner or last-editor link is waiting and no last-editor link exists,
  so no one-time data fix is needed.
- The owner rejected 1,171 of 1,171 proposals that restated a file's metadata, and approved 11 of 12 that a rule
  worked out from activity. The two groups differ in whether a person could read the answer off one field.
- The largest group waiting is now `identity_link`, 262 rows, more than every other kind together.

## What was not measured

- How good the waiting findings are: none has been decided, so there is no acceptance rate for mail, documents or
  meetings.
- Invoices, payments, orders, contracts, subscriptions, prices and transactions that keep their review state in
  their own tables. The query counted `proposed_actions`, memories, facts and task closes.
- How well the agent deduces. Integration tests cover the path from a staged finding to a saved record
  ([cli-core #2852](https://github.com/WireCatLabs/cli-core/pull/2852),
  [drive-cli #354](https://github.com/WireCatLabs/drive-cli/pull/354)); they do not judge an agent's reading.
- What Desktop drew on the screen. The numbers come from the store, not from the page.
