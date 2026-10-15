# Re-indexing mail after a large rules change

## Why

The owner's memo cut 44,011 stored emails down to envelopes with `memo mail rules apply` (their text removed,
sender, date and labels kept). The next scheduled `memo sync` then held memo's import lock for about an hour and
was on course for six more, working through the mail search index; the Gmail import waited behind it
(PERF-42 in the owner's journal). The question: where does the time go, the index drain or embedding with
e5-small, and what makes a scheduled run short again? The answer fed cli-core#1259.

## Setup

- Linux laptop, Node 24.19.0, other work running (load average 20–50).
- A copy of the owner's store, taken with SQLite's backup: 1.6 GB, 375,611 chunks, 28,342 vectors of one model
  (`local:e5-small:384`), 13,157 email threads queued for re-indexing (13,693 emails, 1 with text).
- cli-core `main` at 66d33597 (before) and with #1259 (after), built from source.
- [run.sh](run.sh) copies the store, points `HOME`, `WIRECAT_STATE_DIR` and `MESSAGING_STORE` at a temp folder,
  and runs [profile.mjs](profile.mjs) (drain a slice of the queue, list a batch, embed N chunks) and
  [profile-words.mjs](profile-words.mjs) (queue the newest N emails with text and drain their word index).

```sh
# from a built cli-core checkout; reads ~/.local/share/WireCat/wirecat.db once, writes only under ~/.cache
performance/mail/indexing/run.sh ~/Projects/AI/cli-messaging 300 300 64
# the whole queue and a full scheduled run's embedding:
performance/mail/indexing/run.sh ~/Projects/AI/cli-messaging 100000 300 600
```

The first step measures whatever the store has queued; on a store with an empty queue it drains nothing and prints
`null` per thread, while the word-index step always queues its own emails. Repeat it before releasing a cli-core
change to indexing or vector cleanup, and after any memo command that rewrites many stored emails.

## Results

| What | Before | After #1259 |
|---|---:|---:|
| Draining the whole queue, 13,157 envelope-only threads | 896 s (68 ms a thread) | 3.4 s (0.3 ms a thread) |
| A 300-thread slice of it | 14.0 s (46.7 ms a thread) | 0.06 s (0.2 ms a thread) |
| Word index for 300 emails with text (811,227 chars) | 10.8 s (35.9 ms an email) | 0.45 s (1.5 ms an email) |
| Embedding 600 chunks with e5-small (memo's cap per run) | 82 s (136 ms a chunk) | 52 s (87 ms a chunk) |
| Listing the next batch to embed | 3.2 s | 0.03 s |

The embedding rows differ only by machine load; #1259 does not touch embedding.

## What it showed

- **The drain, not embedding, held the lock.** Every queued thread first drops its old pieces and then deletes
  their vectors when nothing else uses them. That delete named only the text hash, while the vector table's key
  is (model, hash), so each hash read all 28,000 vectors. The cut emails had pieces before, so every one of the
  13,157 threads paid that scan, with nothing new to index.
- **Naming the model fixes it without a migration**: the models are found by index seeks, then each delete is a
  key lookup. 266 times faster on the whole queue.
- **Embedding was already bounded**: memo embeds at most 600 chunks a run, about a minute here, so a time budget
  or giving the lock up while embedding is not needed once the drain is fast.
- **The live run was slower than the copy**: about one thread a second against 13 here. The timer runs memo with
  `Nice=10` on a loaded machine, and the import loop held the store open beside it. Not measured.

## Not measured

- Other places that delete vectors by hash alone (notes, documents' pictures, images, messages); they scan the
  same way, but none had a large queue. An index on `embeddings(content_hash)` would fix them all and needs a
  store migration.
- Stores with more than one embedding model; the fix seeks once per model.
- A queue of threads with text: one email with text was in this queue, so the word-index row comes from a
  separate, synthetic queue of the newest 300 emails with text.
