# CRM search quality: does `b24 search all` find the right deal?

## Why it was run

The owner asked that CRM search "work properly" before b24's public launch. A launch-readiness review of b24 found
no measurement of whether search finds the right deal or lead. Tests checked that a search runs, not what it finds.

The question: does `b24 search all` find a deal by the words of its title, by other forms of those words, by its
company, by its contact, with a typo, by its amount and by its stage? And does it stay quiet when nothing matches?

The answer fed [cli-core#2866](https://github.com/WireCatLabs/cli-core/pull/2866). It matches word stems and word
beginnings, searches a deal's company and contacts, retries a query with no hits as a typo, skips `stage:` with a
reason, and needs four letters before a word beginning counts.

## Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0, Node 24.19.0. About 3 GB free and 12 GB
  available during the runs, so the timings are noisy.
- Code: bitrix24-cli `main` at `5f8834c` (0.13.0). Its own `run()`, the function its binary calls, runs each
  `sync` and `search all` in process. Only the portal is fake: b24's `fakeCrm` from `src/testing/fake-crm.ts`
  answers its requests. No network, no account, no real data, a memory keyring, a throwaway `HOME` and
  `DBUS_SESSION_BUS_ADDRESS=disabled:`.
- Three cli-core builds, put under b24 in place of the cli-core it installs:
  - **before**: `main` at `cbe080a8f` (0.640.0), the pull request's base.
  - **3 letters**: the pull request's first commit, `31bb28f29`. A word beginning counts from three letters.
  - **4 letters**: its second commit, `b19b28628`. A word beginning counts from four letters.

  b24's installed cli-core 0.635.0 gave the same quality as 0.640.0 in every class.
- Data, all synthetic, built by [`data.ts`](data.ts) from a fixed seed: 1,316 deals, 702 leads, 150 companies and
  600 contacts, in Russian and English. 18 of the deals and leads are planted. Each has words found nowhere else
  in the data, so each query has a known right answer. The rest is background: "Поставка кабеля в Казань", "Office fit-out",
  "Заявка с сайта" and the like, often with the company's name in the title.
- Queries: [`queries.json`](queries.json), 88 queries in 13 classes. 79 have a right answer, 9 have none. A query
  for a company or a contact expects every deal of that company or contact. Five of the no-answer queries are traps,
  short words inside longer ones ("кот" inside "котельная", "ром" inside "Ромашка"). Q50 was a phone number and is
  left out: this repository keeps phone numbers out of its data.
- Each query runs three times as `b24 work search all <query> --json --limit 10`. The second and third runs count
  for latency. Only deal and lead hits count for quality.

From a bitrix24-cli checkout with its dependencies installed:

```sh
B24_REPO=$PWD BENCH_RUN=/tmp/crm-search/before CLI_CORE=<cli-core checkout, built> \
  pnpm exec vitest run --config <cli-testing>/performance/crm/search-quality/vitest.config.mjs
python3 -I <cli-testing>/performance/crm/search-quality/summary.py /tmp/crm-search/before/results.json
```

[`search.bench.ts`](search.bench.ts) fills the fake portal, runs `b24 work sync`, then every query, and writes
`results.json` into `BENCH_RUN`. Without `CLI_CORE`, b24 runs on the cli-core it installed. `BENCH_REPEAT` changes
the number of runs per query (3 by default). [`summary.py`](summary.py) prints the table of one run. The three runs
behind this page are in [`results/`](results/).

## Results

Recall@10 per class: the share of the right deals and leads in the first ten hits. For no-answer queries, how many
of them returned any deal or lead.

| Class | Queries | before | 3 letters | 4 letters |
| --- | --- | --- | --- | --- |
| Exact title | 8 | 1.00 | 1.00 | 1.00 |
| One title word | 10 | 1.00 | 1.00 | 1.00 |
| Russian word forms | 14 | 0.14 | 0.93 | 0.93 |
| English word forms | 4 | 0.25 | 1.00 | 1.00 |
| Company | 8 | 0.39 | 0.88 | 0.88 |
| Contact | 5 | 0.00 | 0.80 | 0.80 |
| Typo | 7 | 0.00 | 0.86 | 0.86 |
| Amount | 4 | 0.00 | 0.00 | 0.00 |
| Stage | 6 | 0.05 | 0.02 | 0.00 |
| Mixed languages | 6 | 0.50 | 0.50 | 0.50 |
| Question | 3 | 1.00 | 1.00 | 1.00 |
| Field syntax | 4 | 0.50 | 0.50 | 0.50 |
| **All with an answer** | 79 | **0.41** | **0.76** | **0.76** |
| No answer: queries with false hits | 9 | 4 (22 hits) | 3 (12 hits) | **0** |

| | before | 3 letters | 4 letters |
| --- | --- | --- | --- |
| Queries with an answer and no right hit in the first ten | 45 of 79 | 18 of 79 | 19 of 79 |
| MRR@10, all with an answer | 0.42 | 0.77 | 0.76 |
| Warm search in process, p50 / p95 | 22 / 40 ms | 45 / 106 ms | 45 / 106 ms |
| First sync of the portal | 2.0 s | 1.9 s | 2.1 s |

## What it showed

- **Before, search matched only text written as it is in the title.** "цемент" found "Поставка цемента М500",
  but "поставки цемента", "котельной" and "breweries" found nothing. It matched inside words, so "cement" found
  "Windows replacement". A company was found only where its name was
  in a deal's title, and a contact never.
- **The pull request nearly doubles recall, 0.41 to 0.76.** Word forms, companies, contacts and typos now find
  their deals. The exact title and single words still find them at the top.
- **Three-letter beginnings made false hits.** "ром" returned ten deals of "Ромашка", "кот" the "Котельная" deal,
  "лес" the "Лестница" deal. A four-letter minimum removes all of them: 22 false hits before, 12 with three
  letters, none with four. The cost: a three-letter word beginning no longer finds a longer word.
- **The stage score before was an accident.** "Won" found deals of the company "Wonka" whose title has that name,
  and some of them happened to be won. No query found deals by their stage name, before or after. `stage:won` now
  says that deals are not searched by stage and points to `deals list stage:`.
- **Search is about twice as slow, and still fast.** About 45 ms instead of 22 ms in process, on a store of 2,000
  deals and leads. When a search finds nothing, the typo retry corrects the words and looks again, which shows in the p95. The
  machine had little free memory, so the numbers move between runs: a second run of the 4-letter build gave
  57 / 130 ms.

Still failing with the four-letter build:

- Amount: "487500", "487 500", "3 100 000 RUB".
- Stage name as a word: "Won", "Lost", "Junk", a pipeline's name.
- Keyboard layout: "ghblhjbpjkzwbz" for "гидроизоляция".
- Transliteration: "Akvabarer" for "АкваБарьер".
- Another language: "cement" for "цемента", "boiler room Khimki" for "Котельная в Химках".
- "окна ПВХ" for "монтаж окон": probably the stemmer gives "окна" and "окон" different stems.
- A lead's own person and company name ("Тимофей Гордеев", "Севертех-Монтаж"): b24 does not sync those fields yet.

## What was not measured

- A real portal: its titles, its stage names, its rate limit and the time a request takes.
- Stores larger than about 2,000 deals and leads. Latency on a portal of tens of thousands was not measured.
- Search by meaning (embeddings): `b24 search all` matches words only.
- The built binary: each query ran through `run()` in one process, so process start is not in the latency.
