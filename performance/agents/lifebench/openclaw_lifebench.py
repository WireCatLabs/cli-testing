#!/usr/bin/env python3
"""OpenClaw, alone (records as files) and with WireCat Memo, on a LifeBench pilot fixture.

    python3 -I -B openclaw_lifebench.py --runner <kg>/openclaw_runner.py --root <root> setup-root --from <old root>
    python3 -I -B openclaw_lifebench.py --runner <kg>/openclaw_runner.py --root <root> prepare --fixture <pilot> \
        --memo <memo binary>
    python3 -I -B openclaw_lifebench.py --runner <kg>/openclaw_runner.py --root <root> answer --fixture <pilot> \
        --agent memo --model anthropic/claude-sonnet-5-5 --output <new dir> [--only id,id] [--max-usd 0.5]

<kg> is performance/agents/knowledge-graph-memory of branch perf/kg-memory-10k-prep (676e46a). Its runner is used
as is, with four things replaced: the prompt (the v3 one asks for a short value from records named r0042), where the
records are, the memo store's sources (memo_clean.py's real titles and senders), and a spending cap.
"""

import argparse
import hashlib
import importlib.util
import json
import re
import shutil
import sys
from pathlib import Path

# python3 -I leaves this folder off sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import memo_clean

PROMPT = """You are the phone assistant of {owner}. Today is {{as_of}}. {owner} asks you about their own life, using
"I" for themselves. Their phone's records of 2025 (text messages, calls, calendar events, notes, notifications,
photos, daily health data, earlier chats with you, contacts) are your memory. {{where}}

Records dated after today did not exist yet when the question is asked: answer as of today.

Question: {{question}}

Answer from the records. If they do not hold the answer, say that you cannot find it instead of guessing.

Reply with exactly one JSON object and nothing else:
{{{{"answer": "<your answer in plain English, as long as the question needs>"}}}}
"""
WHERE = {
    "files": "The records are Markdown files in your memory folder (memory/{first}.md ... memory/{last}.md), one "
             "record per file; use your memory search, and read the files when you need to.",
    "memo": "The records are stored in WireCat Memo: text messages as mail (one thread per contact), everything "
            "else as notes. Search them with the `memo` command; the cli-memo skill describes it.",
}
# Words that only appear if the agent opened the answer key or the benchmark's own files.
ANSWER_KEY_WORDS = ("QA_all", "QA.json", "oracle.json", "score_points", "required_citations", "life_bench_data",
                    "lifebench/fixtures", "lifebench/pilots", "wirecat-bench/lifebench")
LLAMA_PORT = 35958


def load(path):
    sys.path.insert(0, str(path.parent))
    spec = importlib.util.spec_from_file_location("openclaw_runner", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def setup_root(runner, root, old):
    """A root of its own from an installed one: Node, OpenClaw, its llama.cpp plugin and embedding model, no sign-in.

    The old root's agents folder (its Anthropic sign-in, transcripts and memory index), plugins and stores stay out.
    """
    if root.exists():
        raise SystemExit(f"{root} exists")
    for part in ("node", "pkg"):
        shutil.copytree(old / part, root / part, symlinks=True)
    for part in ("extensions", "models", "tools"):
        shutil.copytree(old / "home/.openclaw" / part, root / "home/.openclaw" / part, symlinks=True)
    for part in ("tmp", "logs", "bin"):
        (root / part).mkdir()
    config = json.loads((old / "home/.openclaw/openclaw.json").read_text())
    config = {key: config[key] for key in ("plugins", "memory", "models", "meta") if key in config}
    text = json.dumps(config, indent=2).replace(str(old), str(root))
    text = re.sub(r"\b35957\b", str(LLAMA_PORT), text)
    config = json.loads(text)
    config["logging"] = {"file": str(root / "logs/openclaw.log")}
    (root / "home/.openclaw/openclaw.json").write_text(json.dumps(config, indent=2) + "\n")
    for preset in (root / "home/.openclaw/tools/llama.cpp").glob("models-*.ini"):
        preset.write_text(preset.read_text().replace(str(old), str(root)))
    leftover = [str(p) for p in (root / "home").rglob("*") if p.is_file() and p.suffix in (".json", ".ini")
                and str(old) in p.read_text(errors="ignore")]
    if leftover:
        raise SystemExit(f"still pointing at {old}: {leftover}")
    # The key script signs in the files and memo agents, so they must exist first.
    runner.configure_agents(root)
    print(runner.openclaw(root, "--version").stdout.strip())
    print(f"Next: openclaw-anthropic-key.sh {root}")


def install(runner, baseline):
    """memo_clean's sources, plus rNNNN for the files agent's workspace, whose files the runner names that way."""
    memo_clean.install(baseline)

    def write_sources(records, data):
        names = baseline.write_sources(records, data)
        return {**names, **{baseline.name_of(index): record["id"] for index, record in enumerate(records)}}

    runner.write_sources = write_sources


def prepare(runner, root, fixture, memo_binary):
    done = root / "prepare.json"
    version = runner.Memo(memo_binary, runner.paths(root)["memo"]).run("--version")[0].strip()
    if done.exists() and json.loads(done.read_text())["memo"] != version:
        raise SystemExit(f"{root} holds a store of memo {json.loads(done.read_text())['memo']}, not {version}; "
                         "use a new root")
    corpus = (fixture / "corpus.jsonl").read_bytes()
    stamp = root / "corpus.sha256"
    sha = hashlib.sha256(corpus).hexdigest()
    if stamp.exists() and stamp.read_text().strip() != sha:
        raise SystemExit(f"{root} was prepared from another corpus")
    stamp.write_text(sha + "\n")
    runner.prepare(root, fixture, memo_binary)


def capped(runner, limit, spent):
    ask = runner.ask

    def ask_with_cap(*args, **kwargs):
        if spent[0] >= limit:
            raise SystemExit(f"stopped: ${spent[0]:.4f} spent, cap ${limit}; answered questions are in the output")
        result = ask(*args, **kwargs)
        cost = ((result[2].get("meta") or {}).get("agentMeta") or {}).get("costUsd") or 0
        spent[0] += cost
        print(f"  spent so far ${spent[0]:.4f}", file=sys.stderr)
        return result

    runner.ask = ask_with_cap


def answer_key_mentions(runner, root, agent, output):
    store = runner.paths(root)["home"] / f".openclaw/agents/{agent}/agent"
    blobs = [p.read_bytes() for p in store.glob("openclaw-agent.sqlite*") if p.is_file()]
    blobs += [p.read_bytes() for p in (output / "raw").iterdir()]
    blob = b"".join(blobs)
    return {word: blob.count(word.encode()) for word in ANSWER_KEY_WORDS if blob.count(word.encode())}


def answer(runner, root, args):
    owner = json.loads((args.fixture / "manifest.json").read_text())["owner"]
    runner.PROMPT = PROMPT.format(owner=owner)
    runner.WHERE.update(WHERE)
    spent = [0.0]
    capped(runner, args.max_usd, spent)
    only = set(args.only.split(",")) if args.only else None
    runner.answer(root, args.fixture, args.output, args.agent, args.model, args.thinking, only, args.timeout)
    found = answer_key_mentions(runner, root, args.agent, args.output)
    (args.output / "answer-key-check.json").write_text(json.dumps({"mentions": found, "words": ANSWER_KEY_WORDS,
                                                                   "spent_usd": spent[0]}, indent=2) + "\n")
    print(f"spent ${spent[0]:.4f} (OpenClaw's list-price estimate)")
    if found:
        raise SystemExit(f"run not trusted: the transcript mentions {found}; see answer-key-check.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--runner", type=Path, required=True, help="knowledge-graph-memory/openclaw_runner.py")
    parser.add_argument("--root", type=Path, required=True)
    sub = parser.add_subparsers(dest="command", required=True)
    setup = sub.add_parser("setup-root")
    setup.add_argument("--from", dest="old", type=Path, required=True, help="an installed runner root")
    prep = sub.add_parser("prepare")
    prep.add_argument("--fixture", type=Path, required=True)
    prep.add_argument("--memo", required=True)
    ret = sub.add_parser("retrieval", help="the files agent's own memory search, no model")
    ret.add_argument("--fixture", type=Path, required=True)
    ret.add_argument("--output", type=Path, required=True)
    ans = sub.add_parser("answer")
    ans.add_argument("--fixture", type=Path, required=True)
    ans.add_argument("--output", type=Path, required=True)
    ans.add_argument("--agent", choices=sorted(WHERE), required=True)
    ans.add_argument("--model", required=True)
    ans.add_argument("--thinking")
    ans.add_argument("--only")
    ans.add_argument("--timeout", type=int, default=600)
    ans.add_argument("--max-usd", type=float, required=True, help="stop before the next question once this is spent")
    args = parser.parse_args()
    runner = load(args.runner.resolve())
    root = args.root.expanduser().resolve()
    if args.command == "setup-root":
        setup_root(runner, root, args.old.expanduser().resolve())
        return
    install(runner, sys.modules["memo_baseline"])
    if args.command == "prepare":
        prepare(runner, root, args.fixture.resolve(), args.memo)
    elif args.command == "retrieval":
        runner.retrieval(root, args.fixture.resolve(), args.output.resolve())
    else:
        args.fixture, args.output = args.fixture.resolve(), args.output.resolve()
        answer(runner, root, args)


if __name__ == "__main__":
    main()
