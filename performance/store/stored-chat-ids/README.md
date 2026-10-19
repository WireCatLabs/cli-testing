# Reading every stored chat id of an account

## Why it was run

whatsapp-cli stored some chats under a phone-number id before it moved to LID ids (wa #73). Such a chat moves to
its LID only when a request names it, so a chat nothing touches never moves (wa #142). wa's engine cannot read
cli-core's store, so cli-core now hands the adapter every stored chat id of the account once, as `feed` starts in
`serve` and `watch` (`PushedHistory.storedChats`, WireCatLabs/cli-core#1615).

The question: is one read of the account's whole chat list cheap enough to pass in a single call, or does it need
pages, or a new store query that selects ids only? It decided that #1615 reuses the existing chat list read
(`forAccount(account).chats.chats({})`), with no paging and no new store method.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM, NVMe disk, Linux 7.0, Node 24.19.0.
- Code: cli-core `feat/stored-chats-hook` at `24a881df` (WireCatLabs/cli-core#1615), built with `pnpm build`.
- Data: synthetic only. [`bench.mjs`](bench.mjs) opens an empty store through the build's `openStore`, writes N
  dialogs for one account (phone-form ids, a title, a last-message time, about 100 bytes of `providerMetadata`)
  and 100 for a second account, then reads the first account's chat ids 5 times. The median and the fastest are
  reported.

```sh
node bench.mjs <cli-core checkout with dist> 5000,20000,50000
```

## Results

| chats | ids read | median | fastest |
|---|---|---|---|
| 5,000 | 5,000 | 17.9 ms | 13.7 ms |
| 20,000 | 20,000 | 53.9 ms | 45.3 ms |
| 50,000 | 50,000 | 125.1 ms | 110.4 ms |

An earlier run of the same read under vitest gave 16, 64 and 151 ms.

## What it showed

- The read grows in step with the number of chats, about 2.5 ms per 1,000.
- Even 50,000 chats, far more than one WhatsApp account holds, take well under a quarter of a second, once per
  `serve` or `watch` start, and `feed` does not wait for it. One call with every id is enough.
- Only this account's ids come back: the second account's 100 chats are not in the count.

## Not measured

- A store that also holds messages. The read selects from `chats` alone, so message rows should not change it.
- A cold open of the store file, and the page cache after a reboot.
- The memory the read itself takes.
- Bun.
