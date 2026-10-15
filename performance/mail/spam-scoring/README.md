# Checking memo's sender score against Gmail's Spam

## Why

Most of a large Gmail account is newsletters, notifications and robots, and some of what gets past Gmail's filter
is scams: a brand name on someone else's address, replies sent to another domain, domains registered last month.
memo's `memo mail probe` gives each sender group a score from such signals (memo PR #159). The weights are a first
guess. This check answers two questions before anyone builds rules on the score:

- **What it misses:** how much of Gmail's own Spam folder the score catches.
- **What it wrongly flags:** how many senders the owner wrote to would score as spam.

The answer decides whether the weights stay, and which signal to weaken or drop. A signal that fires on more than
about 2% of replied-to senders is too noisy.

## Setup

- A memo mail account over Gmail IMAP, with himalaya set up and memo 0.31.0 or newer (the release with the
  score).
- Gmail keeps spam for 30 days, so the Spam folder is the last month only. That is the only spam sample there is:
  All Mail leaves Spam out.
- The command: [calibrate.sh](calibrate.sh) `<account> [threshold] [since]`. With `DOMAIN_AGE=1`, it also asks
  domain registries for ages (RDAP), which tells each registry the domain name.

```sh
performance/mail/spam-scoring/calibrate.sh personal 3 2025-10-01
```

## What it does

1. **Spam:** it runs `memo mail probe` on the account's `[Gmail]/Spam` only. It uses a throwaway config and
   state, so the real config, its rules and the domain-age cache are never touched.
2. **Senders the owner wrote to:** it runs the same probe on All Mail. Use the `since` window to keep this
   shorter: a whole 305k-email account takes 15–25 minutes and about 1 KB of Gmail's daily allowance per email.
3. **Totals:** each group's score is counted without the two signals that already know the answer: being in
   Spam (+4), and the owner's reply (−5).

It prints totals only. It never prints a sender, a domain or a subject.

| Field | Meaning |
|---|---|
| `spam.recall` | Share of Spam emails whose score reaches the threshold |
| `spam.signals` | How many Spam groups each signal fired on |
| `replied_senders.false_alarm_rate` | Share of replied-to sender groups that reach the threshold |
| `replied_senders.signals` | Which signals fire on people the owner wrote to: the ones to weaken |
| `other_groups_at_or_above` | Never-replied groups at or above the threshold: what a rule would touch |

## Results

Totals only; nothing per sender leaves the owner's machine.

**Run 1 — 2026-10-15**, memo 0.36.0, one personal Gmail account. Command:
`DOMAIN_AGE=1 calibrate.sh personal 3 2025-01-01`, so Spam holds the last 30 days and the replied-to senders
come from mail since 2025-01-01.

| | Value |
|---|---:|
| Spam emails / sender groups | 331 / 202 |
| Spam emails reaching score 3 (recall) | 79 (23.9%) |
| Replied-to sender groups | 63 |
| …reaching score 3 (false alarms) | 1 (1.6%) |
| Never-replied groups reaching score 3 | 377 of 3,091 (12.2%) |

Signals on the 202 Spam groups: never replied plus bulk 145, Reply-To on another domain 26, young domain 3,
DMARC fail 2. On the replied-to senders, only DMARC fail fired, once.

What it showed:

- **The score is safe but weak.** It almost never flags people the owner writes to (1.6%), and catches only a
  quarter of real spam at threshold 3.
- **Spam passes Gmail's sender checks.** DMARC failed on 2 of 202 spam groups, so a DMARC fail (+3) is rare.
  Spammers authenticate their own domains.
- **Domain age barely fires** (3 groups): many spam domains have no RDAP service (country domains), or aren't
  young.
- **The common spam signal is "never replied plus bulk"** (145 of 202 groups), but its weight (+1) alone never
  reaches 3. It also fires on all ordinary mass mail, so raising it would flag newsletters as spam.

Next: try threshold 2, and a "never replied, no List-Unsubscribe, no bulk headers, Reply-To elsewhere" combination,
which separates scams from newsletters better than bulk alone.

## Not measured

- Spam older than 30 days, because Gmail deletes it.
- Other thresholds: each run lists the mailbox again, so run 1 used only threshold 3.
- Scams that pass every check, such as a plain Gmail address with no brand name and no Reply-To.
- Whether a high score on a never-replied group is junk or a real sender: the owner checks a sample by hand.
