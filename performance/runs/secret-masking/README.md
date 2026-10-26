# Secrets hidden by their content in run records

## Why it was run

A run record is the history of what a CLI was asked to do. The owner asked for it to keep what the user typed,
so a failed run can be read back later. Typed text can hold a secret that has no secret-shaped name around it, so
the owner also asked for secrets to be found by their content.

cli-core 0.442.0 ([#2039](https://github.com/WireCatLabs/cli-core/pull/2039),
[#2041](https://github.com/WireCatLabs/cli-core/pull/2041)) added `withoutSecrets` in
[`src/runs/secrets.ts`](https://github.com/WireCatLabs/cli-core/blob/141e11371a2470490adbfc716890b904710c2d43/src/runs/secrets.ts).
It hides three things:

- tokens of a known vendor format, private keys and `Bearer`/`Basic` credentials;
- the value of a secret-named pair (`password=…`, `token: …`);
- a random-looking run of 20 or more characters from `[A-Za-z0-9_+/-]`. The run must mix at least 3 of lower
  case, upper case, digits and symbols, switch case at 15 % or more of its positions, split into pieces shorter
  than 2.75 characters on average, and have a Shannon entropy of 3.5 bits per character or more. A word that is
  a URL or a path is never checked this way.

The thresholds were tuned on synthetic strings during that change. This page repeats the measurement against the
published package. The question: how many random secrets does the rule hide, and which real ids does it hide by
mistake? It decides whether the thresholds stay as released.

## Setup

- Machine: AMD Ryzen AI 9 HX 470, 30 GB RAM, Linux 7.0, Node 24.19.0.
- Code: `@wirecat/cli-core@0.442.0` from npm, integrity
  `sha512-GPJQ676AX19lIsISU1BTg/acWI6YaPRX29byV7UapssQLdHzQJPAkuVu00lIlj+n3VeJzIbUYvJ/g3cF3x7n6g==`, release
  commit `141e1137`. The detector is not a public export, so [`measure.mjs`](measure.mjs) loads the published
  `dist/runs/secrets.js` by path. That file imports nothing.
- Data: synthetic only. Strings come from a seeded generator (mulberry32, seed 442). Token-shaped samples are
  built when the script runs, from a vendor prefix and random characters; no key is written in the script.
- Each sample is checked inside a sentence (`the value <sample> was typed`) and counts as hidden if
  `withoutSecrets` changed the text. 5,000 samples per cell.

```sh
npm pack @wirecat/cli-core@0.442.0 && tar xzf wirecat-cli-core-0.442.0.tgz
node measure.mjs package 442 5000
```

## Results

### Random strings

Share hidden by `withoutSecrets`; `looksRandom` alone in brackets.

| alphabet | 20 | 24 | 32 | 39 | 40 | 64 |
|---|---|---|---|---|---|---|
| base62 | 92.0 % (92.0 %) | 94.4 % (94.4 %) | 97.9 % (97.9 %) | 98.7 % (98.7 %) | 98.8 % (98.8 %) | 99.8 % (99.8 %) |
| base64url (`_-`) | 92.5 % (92.5 %) | 93.8 % (93.8 %) | 97.4 % (97.4 %) | 98.6 % (98.6 %) | 98.9 % (98.9 %) | 99.8 % (99.8 %) |
| base64 (`+/`) | 91.0 % (92.5 %) | 92.8 % (94.4 %) | 95.8 % (97.4 %) | 97.4 % (98.6 %) | 97.0 % (98.6 %) | 98.5 % (99.8 %) |
| hex, lower case | 0.0 % | 0.0 % | 0.0 % | 0.0 % | 0.0 % | 0.0 % |
| hex, upper case | 0.0 % | 0.0 % | 0.0 % | 0.0 % | 0.0 % | 0.0 % |
| base36, lower case | 0.0 % | 0.0 % | 0.0 % | 0.0 % | 0.0 % | 0.0 % |

### Ids and secrets of a known shape

| case | hidden |
|---|---|
| Drive file id, bare (33 chars) | 97.2 % |
| Drive file id in a `drive.google.com` URL | 0.0 % |
| Drive file id in a path | 0.0 % |
| YouTube id, bare (11 chars) | 0.0 % |
| UUID v4 | 0.0 % |
| WhatsApp message id (`3EB0` + 18 upper-case hex) | 0.0 % |
| Run id (`<UTC time>-<command>-<6 hex>`) | 0.0 % |
| GitHub token (`ghp_` + 36 base62) | 100.0 % |
| OpenAI-style key (`sk-` + 48 base62) | 100.0 % |
| AWS access key id (`AKIA` + 16) | 100.0 % |
| Telegram bot token (10 digits `:` 35) | 100.0 % |
| Random key after `password=` | 100.0 % |
| Random key after `--api-key` in free text | 0.0 % |
| Random 12-character password, no name | 0.0 % |
| Random 32-character key in a URL query, unnamed (`?code=`) | 0.0 % |
| Random 32-character key in a URL query, named (`?token=`) | 100.0 % |
| Random 40-character hex key, no name | 0.0 % |
| Random 40-character base64 key starting with `/` | 0.0 % |

### Ids, names, URLs and text that must stay

All 29 were kept: `MESSAGING_LIMIT_TIER_0`, `InlineQueryResultMpeg4Gif`, `InlineQueryResultCachedMpeg4Gif`,
`SyntheticDocument_000123`, a run id, `onnx-community/embeddinggemma-300m-ONNX`, `mmarco-mMiniLMv2-L12-H384-v1`,
a WhatsApp id, `X-Hub-Signature-256`, two systemd settings, an ISO time, a UUID, `getUpdatesWithTimeout2025`,
`PropertyList-1.0`, two branch and release names, `useEffectHook_v2Final`, `AbCdEf_document_2026_v3`,
`Q3-2026-Revenue-Forecast-v2`, `iPhone15ProMax-256GB-Blue`, `WireCatLabs-cli-core-pr-2036`, a YouTube URL, a
Google Docs URL with a 44-character id, a Linux path, a macOS path with a space, two Russian texts and a line with
emoji. The full list is in [`measure.mjs`](measure.mjs).

## What it showed

- **Random mixed-case keys:** about 92 % are hidden at 20 characters, 96–98 % at 32 and 97–99 % at 39. The
  rest are strings that happen to have too few case switches or too little entropy. These numbers match the
  tuning run to within half a point.
- **Base64 with `/` is 1–1.5 points lower** than `looksRandom` alone. A string that starts with `/` is read as a
  path and kept. That is about 1 in 64 samples.
- **Single-case alphabets are never hidden by content, at any length.** Lower- or upper-case hex and lower-case
  base36 have only two kinds of character, and the rule needs three. A 40- or 64-character hex key is kept too.
  Such a key is hidden only when it has a vendor prefix or a secret name before it.
- **No id, name, URL or text in the list was hidden.** The one id that is hidden is a bare Drive file id
  (97 %): it is random base64url and cannot be told apart from a key. In a Drive URL or a path it is kept.
- **A secret inside a URL or a path is hidden only by name or by format:** `?token=` yes, `?code=` no.
- **Short passwords without a name are kept.** Below 20 characters the content rule does not look.
  `--api-key <value>` written as free text is kept as well: the pair rule needs `=` or `:`. Flags that the CLI
  parses are hidden by their name before this text step; that path was not measured here.

## Rerun on 0.444.0: hex keys and names written with a space

### Why

The first run showed two gaps: a hex key was never hidden, at any length, and `--api-key <value>` written as text
was kept, because the pair rule needed `=` or `:`. cli-core 0.444.0
([#2046](https://github.com/WireCatLabs/cli-core/pull/2046)) borrowed two rules from Yelp's
[detect-secrets](https://github.com/Yelp/detect-secrets/blob/master/README.md):

- a run of 20 or more **lower-case** hex characters with a Shannon entropy of 3.0 bits per character or more is
  hidden. Upper case is left out because WhatsApp message ids are 20–32 upper-case hex characters;
- the value after a secret name is hidden after `=`, `:`, `=>` or a space. The name list adds the
  [detect-secrets keyword list](https://github.com/Yelp/detect-secrets/blob/master/detect_secrets/plugins/keyword.py)
  and `pass`, `passcode`, `pin`, `otp`, `2fa`, `clave`, `пароль`, `пин`, `код`. After a space, a value made only of
  letters is kept, so `pin this message` stays.

The question: does the hex rule hide hex keys without hiding any id on the must-keep list?

### Setup

Same machine, script, seed and sample count as above. Code: `@wirecat/cli-core@0.444.0` from npm, integrity
`sha512-+b+ebSGpCaD1eBdlITBJTxfeUOBoi5RirPjHtt4qfJBW/4Iw9Ascry9aBNqa4ojlzOg0ncWG30XODI6UgtS/zg==`, release commit
`6aed128b`.

```sh
npm pack @wirecat/cli-core@0.444.0 && tar xzf wirecat-cli-core-0.444.0.tgz
node measure.mjs package 442 5000
```

### Results

Only these rows changed; every other cell is the same as for 0.442.0, to the tenth of a point.

| case | 0.442.0 | 0.444.0 |
|---|---|---|
| hex, lower case, 20 chars | 0.0 % | 97.1 % |
| hex, lower case, 24 chars | 0.0 % | 99.5 % |
| hex, lower case, 32 / 39 / 40 / 64 chars | 0.0 % | 100.0 % |
| hex, upper case, any length | 0.0 % | 0.0 % |
| base36, lower case, any length | 0.0 % | 0.0 % |
| Random 40-character hex key, no name | 0.0 % | 100.0 % |
| Random key after `--api-key` in free text | 0.0 % | 88.8 % |

All 29 ids, names, URLs and texts that must stay were kept, among them the upper-case WhatsApp id, the UUID, the run
id and `OnUnitInactiveSec=15min`.

### What it showed

- **Lower-case hex keys are now hidden:** 97 % at 20 characters, all of them from 32. The 3 % kept at 20 have
  repeated characters that bring the entropy under 3.0. A full commit hash (40 hex) is hidden too; a short hash
  (7–12) is below the length and stays.
- **Upper-case hex and lower-case base36 are still never hidden.** Upper-case hex is kept on purpose, for WhatsApp
  ids. Base36 had no rule asked for it.
- **`--api-key <value>` in free text: 89 %.** The rest are values made only of letters (12 random base62 characters
  have no digit about 12 % of the time), which the space rule keeps as a plain word.
- **The mixed-alphabet rule stays.** A single base64 limit of 4.5 bits per character, as detect-secrets uses, cannot
  be reached by a 20-character string (the most it can have is log2(20) ≈ 4.32 bits), so it would hide less.

## Not measured

- A corpus of real secrets and real run records. Real keys are not random in the same way (some carry a
  checksum or a fixed layout), and real text has a different mix of ids.
- Keys in non-Latin scripts and secrets split across lines or by spaces.
- How the CLI masks flags it parses (`--token`, `--api-key`) before `withoutSecrets` sees the text.
- Speed of `withoutSecrets` on long run records.
