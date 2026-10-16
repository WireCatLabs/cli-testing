# The sender score on stored mail: what ranking by it would push down

## Why

The owner asked memo to rank likely spam lower in search, using the sender score from `memo mail inspect`.
The [first check](../README.md) measured the score against Gmail's Spam folder. It counted false alarms only among
senders the owner replied to, so bills, bookings and newsletters he never answers were not checked. The question
here: on the mail memo actually searches, how much would each threshold push down, and is it spam? The answer
decided whether to rank by the score now or first fix its false alarms (the owner chose to fix first).

## Setup

- One personal Gmail account in the shared store: 256,578 emails, 89,140 with full text (2018–2026), 9,585 sender
  groups. Gmail's Spam folder is not imported, so this is mail Gmail delivered.
- memo 0.55.0 (before) and the fix in cli-memo#253 (after), each scored by its own `probeMail`.
- No domain ages: no RDAP lookups had been stored, so `young_domain` never fires here.
- The command, read-only on the store; it prints totals and signal names only:

```sh
performance/mail/spam-scoring/stored-mail/score-store.sh <account address> [memo dist folder]
```

"Strong" signals are the ones that suggest forgery or fraud: `dmarc_fail`, `brand_spoof`, `young_domain`,
`reply_to_elsewhere`, `disposable_domain` (minus 5 for a sender the owner replied to). The others (`never_opened`,
`bulk_never_replied`, `dkim_not_passed`) describe engagement, which bills and newsletters share with spam.

## Results

Full-text emails, and their sender groups, that each threshold would rank lower:

| Scorer | All signals ≥ 3 | Strong signals ≥ 3 | Strong signals ≥ 2 |
|---|---:|---:|---:|
| memo 0.55.0 | 17,459 (4,079 groups) | 697 (71 groups) | 1,183 (197 groups) |
| cli-memo#253 | 17,157 (4,060 groups) | 200 (20 groups) | 718 (149 groups) |
| cli-memo#257 | 17,041 (4,050 groups) | **2 (2 groups)** | 520 (131 groups) |

What it showed:

- **All signals at 3 would push down a fifth of the searchable mail.** 16,171 of those emails score only on
  "never opened" plus "bulk, never replied": newsletters and many bills. Ranking by the full score is ruled out.
- **The strong signals had two false alarms that #253 fixes.**
  - `brand_spoof` fired on relays and platforms: "Google via LinkedIn" from LinkedIn's own domain, Coursera
    courses and Quora spaces named after companies, Dropbox Sign from hellosign.com. One such email marked the
    whole group, so one platform newsletter group of 893 emails was flagged.
  - `dmarc_fail` fired on senders whose DKIM signature was valid but for another domain, a setup mistake common at
    newsletter services before 2021. All 414 DMARC failures in the store are from 2018–2021, none later.
- **After #253, what was left at strong ≥ 3 was still mostly real mail:** old unsigned mail from a university's
  alumni office and a payment provider, plus two real look-alike senders (a crypto exchange's name on another
  domain, a "Microsoft Exchange" sender on a random domain).
- **#257 counts a DMARC failure only on mail from 2022 on** (the owner's choice). Every failure in this store was
  from 2018 to March 2021. What is left at strong ≥ 3 is the two look-alike senders, one email each.
- **Few emails carry an authentication result at all:** about one in eight, and almost none from 2022 on, so the
  DMARC and DKIM signals see little of the mail.

## Not measured

- Domain ages (`young_domain`): no lookups were stored for this account.
- Whether the ranking change hurts real searches: to be checked with the owner's benchmark questions before any
  demotion ships.
- Mail Gmail put in Spam: not imported, and covered by the [first check](../README.md).
- Accounts other than this one.
