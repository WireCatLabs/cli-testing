# Output size: what `--json=<fields>`, `--brief` and `--jsonl` save an agent

Measured 2026-10-15 with tg 0.56.0 and memo 0.32.0, for the "Search efficiently" page of the CLI docs.

## Why we ran it

The owner wants agents to spend fewer tokens reading the CLIs' answers. The docs page "Search efficiently"
recommends trimming output (`--json=<fields>`, `--brief`, `--jsonl`) but gave no numbers, and nobody had checked
that each option does what the page says on every command. The owner decided (NEED-1099 A, NEED-1122 A) to
measure first and let the page and a blog post quote the result.

The question: how much does each option cut from the answer, compared with a full `--json`?

## Setup

- AMD Ryzen AI 9 HX 470, Linux 7.0, Node v24.19.0. tg 0.56.0 and memo 0.32.0, installed from npm into a scratch
  folder (`npm i --prefix <dir> @wirecat/tg-cli@0.56.0 @wirecat/cli-memo`).
- Synthetic store, made by [`seed.ts`](seed.ts): 5,000 invented messages in five chats (one private, four
  groups), 1,000 each, about 110 characters per message. Every 25th message has an invented phone number and
  address (`example.test`), so `mentions` has something to list. No real account, name or message is used.
  HOME, XDG_*, `MESSAGING_STORE`, `TG_STATE_DIR` and `WIRECAT_STATE_DIR` point at a throwaway folder.
- Read only, from the store, `--offline` for tg. No network.
- Each answer is measured in bytes of stdout. Tokens are bytes / 4. No tokenizer is installed here, so these are
  estimates, not counts.
- "Human" is what a terminal shows, captured through a pty with colour off and 120 columns. A pipe gives JSON from
  tg, so the human text needs the pty.
- 3 rounds per command and option. Every round gave the same bytes.
- Run: `node seed.ts <cli-core dir> <store.db> <tg state dir>`, then `bash run.sh 3`
  ([`seed.ts`](seed.ts), [`run.sh`](run.sh)). The header of `run.sh` lists the variables.

## Results

Bytes of one answer, tokens in brackets. "Trimmed" is `--json=<three useful fields>`: `ref,timestamp,excerpt` for
searches, `ref,timestamp,text` for `messages list`, `ref,title` for `chats list`, `at,locator` for
`contacts timeline`, `kind,value,locator` for `mentions list`.

| Command | `--json` | trimmed | saved | `--jsonl` | human text |
|---|---|---|---|---|---|
| `tg search messages heron --limit 20` | 6,669 (1,667) | 4,628 (1,157) | 31% | 6,529 | 17,500 |
| `tg messages list 1 --limit 50` | 21,122 (5,280) | 10,271 (2,567) | 51% | 22,024 | 8,171 |
| `tg chats list` (5 chats) | 976 (244) | 414 (103) | 58% | 1,026 | 260 |
| `tg contacts timeline Alice --limit 20` | 4,638 (1,159) | 1,778 (444) | 62% | 4,825 | 2,730 |
| `tg mentions list --limit 20` | 5,774 (1,443) | 2,065 (516) | 64% | 5,999 | 1,988 |
| `memo search all heron --limit 20` | 7,194 (1,798) | 4,313 (1,078) | 40% | not accepted | 2,934 |
| `memo search messages heron --limit 20` | 6,149 (1,537) | 4,108 (1,027) | 33% | not accepted | 3,835 |

`--brief` and `--full`:

| Command | `--json --brief` | `--json --full` | human `--brief` |
|---|---|---|---|
| every tg command above | same as `--json` | same as `--json` | same as human |
| `memo search all` | same as `--json` | same as `--json` | same as human (2,934) |
| `memo search messages` | 5,749 (7% less) | same as `--json` | 3,555 (7% less) |

## What it showed

- `--json=<fields>` is the option that works everywhere. It cut 31% to 64% on these commands. The saving is
  bigger where the full row carries many fields an agent rarely needs (`mentions`, `contacts timeline`,
  `chats list`) and smaller where the one useful field is long text (searches: the excerpt is most of the bytes).
- `messages list` is its best use: `ref,timestamp,text` drops sender ids, provider, account, chat id,
  `edited_at`, `attachments`, `reply_to`, `forwarded_from` and `reactions` from every row, and halves the answer.
- `--jsonl` does not shrink anything. It is 2% smaller on a search and 4% to 5% larger on lists, because each row
  repeats its own envelope. It is for streaming and `jq`, not for saving tokens. memo does not accept it.
- `--brief` did nothing to tg's answers, in JSON or in text. On `memo search messages` it saved 7% of the text
  and of the JSON; on `memo search all` it changed nothing, because the default text is already the brief shape.
  The tg help says `--brief` is for found messages and mail, so a docs page should not offer it as a general trim.
- Against the human text, JSON is bigger on most lists (`messages list` 2.6 times, `mentions` 2.9 times), and
  smaller on tg searches, where the terminal shows surrounding messages next to each hit (17,500 bytes for 20
  hits). An agent that reads a terminal pays for that context whether it wants it or not.
- On a 20-hit search the trimmed JSON is about 500 tokens fewer than the full JSON. The bigger lever is `--limit`,
  which was not varied here.

## Not measured

- Real tokenizer counts. Tokens are bytes / 4; JSON with many short keys and ids probably tokenizes worse than
  that, so the saving in tokens may differ from the saving in bytes.
- Long messages. Synthetic messages are about 110 characters, so a search excerpt is nearly the full text and
  `--full` could not differ from `--json`. With long mail or messages, `--brief` and the excerpt length will matter
  more than here.
- Other commands: `tg chats list` on a large account, `memo context`, mail, notes, `--limit` sweeps.
- Time. Output options change bytes, not the work of the query; speed was not timed.
- MAX (`max`) and other CLIs. They share cli-core, but their answers were not run.
- Whether an agent does the task as well with the trimmed fields. That needs an agent run, not a byte count.
