#!/usr/bin/env python3
"""LoCoMo through Hermes Agent: hermes_runner.py's process, isolation and parsing, with a LoCoMo prompt, one store
per conversation and a fresh copy of the prepared HERMES_HOME for every run."""

import argparse
import json
import os
import re
import shutil
import sqlite3
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path

import hermes_runner as base
from memo_baseline import Memo, embed, isolated_env, write_sources

ROOT = Path("/var/tmp/locomo-bench-p3")
base.SHARED = base.BENCH = ROOT / "bench"
# Post 1's Hermes checkout, run in place and never written: bytecode is off (PYTHONDONTWRITEBYTECODE).
HERMES_AGENT = Path("/var/tmp/locomo-bench/hermes-agent")
base.HERMES_PYTHON = HERMES_AGENT / "venv/bin/python"
base.HERMES_SCRIPT = HERMES_AGENT / "hermes"
base.PROVIDER_DEPS = {}
FIXTURES = ROOT / "fixtures"
# The answer key lives in these files; a transcript naming them means the agent went looking.
ORACLE_MARKERS = ("questions.json", "locomo10.json", "oracle.json", "required_citations")

WHERE = {
    "alone": "The chat is in text files in ./corpus, one session per file (r0001.md is session 1, r0002.md "
             "session 2 and so on); each file starts with the session's date.",
    "wirecat": "The chat is in memo: use the `memo` command as the cli-memo skill describes. Each note is one "
               "session; its first line names the session number and date.",
    "supermemory": "The chat is in your Supermemory long-term memory; search it.",
    "mem0": "The chat is in your Mem0 long-term memory; search it.",
    "hindsight": "The chat is in your Hindsight long-term memory; recall from it.",
    "honcho": "The chat is in your Honcho memory; search it.",
}
PROMPT = """You are answering one question about a long chat between {a} and {b}, held over many sessions on
different dates. {where}

Question: {question}

Reply with one JSON object and nothing else: {{"answer": "...", "citations": ["session 3"]}}
- answer: short, a few words. For a question about when, give the date or period as precisely as the chat allows
  (for example "7 May 2023" or "the week before 9 June 2023"). If the chat does not hold it, answer "unknown".
- citations: the sessions that support the answer, like "session 3"."""


def home(config, run):
    return base.BENCH / "hermes" / config / "runs" / run


def paths_for(config, conv, run):
    place = base.paths(config)
    place["workspace"] = place["base"] / conv / "workspace"
    place["memo"] = place["base"] / conv / "memo"
    place["bin"] = place["base"] / conv / "bin"
    return place


def model_config(place, model, provider, config, store, speakers=None):
    lines = ["model:", f"  default: {model}", f"  provider: {provider}", "memory:", "  memory_enabled: true",
             "  user_profile_enabled: true", f"  provider: '{base.CONFIGS[config]['provider']}'"]
    if provider == "openrouter":
        lines += ["provider_routing:", "  data_collection: deny"]
    hh = place["hermes_home"]
    (hh / "config.yaml").write_text("\n".join(lines) + "\n")
    # Capture off everywhere: a run's questions and answers must not become memories that a later run reads.
    if config == "supermemory":
        (hh / "supermemory.json").write_text(json.dumps({"container_tag": store, "auto_capture": False}) + "\n")
    if config == "mem0":
        (hh / "mem0.json").write_text(json.dumps({"user_id": store}) + "\n")
    if config == "hindsight":
        (hh / "hindsight").mkdir(exist_ok=True)
        (hh / "hindsight/config.json").write_text(json.dumps(
            {"mode": "local_external", "api_url": "http://127.0.0.1:18888", "bank_id": store, "auto_retain": False,
             "recall_types": "observation,world,experience"}) + "\n")
    if config == "honcho":
        # The two speakers are the two peers: tools with peer "user" read the first, peer "ai" the second.
        host = {"enabled": True, "workspace": store, "peerName": speakers["a"].lower(), "pinPeerName": True,
                "aiPeer": speakers["b"].lower(), "saveMessages": False}
        (hh / "honcho.json").write_text(json.dumps({"baseUrl": "http://127.0.0.1:18000",
                                                    "hosts": {"hermes": host}}, indent=2) + "\n")


def seed_memo(place, records):
    memo = Memo("memo", place["memo"])
    write_sources(records, place["memo"] / "data")
    folder, _ = memo.json("folders", "add", str(place["memo"] / "data/notes"), "--format", "markdown")
    memo.json("sync", "--only", "notes", "--no-embed")
    memo.json("models", "download", "embeddinggemma")
    started = time.perf_counter()
    _, seconds = embed(memo, folder["item"]["id"])
    real = shutil.which("memo")
    exports = "".join(f"export {k}='{v}'\n" for k, v in isolated_env(place["memo"]).items() if k != "PATH")
    place["bin"].mkdir(parents=True, exist_ok=True)
    wrapper = place["bin"] / "memo"
    wrapper.write_text(f"#!/bin/sh\n{exports}exec '{real}' \"$@\"\n")
    wrapper.chmod(0o755)
    return {"embed_s": round(time.perf_counter() - started, 1), "memo": memo.run("--version")[0].strip()}


def prepare(args):
    """The template HERMES_HOME (plugins installed before), plus each conversation's files or memo store."""
    place = base.paths(args.config)
    for key in ("hermes_home", "home", "codex_home"):
        place[key].mkdir(parents=True, exist_ok=True)
    timings = {}
    for conv in args.conversations.split(","):
        conv_place = paths_for(args.config, conv, None)
        conv_place["workspace"].mkdir(parents=True, exist_ok=True)
        records = [json.loads(line) for line in (FIXTURES / conv / "corpus.jsonl").read_text().splitlines()]
        started = time.perf_counter()
        if args.config == "alone":
            corpus = conv_place["workspace"] / "corpus"
            corpus.mkdir(exist_ok=True)
            for index, record in enumerate(records):
                path = corpus / f"{base.name_of(index)}.md"
                path.write_text(record["text"] + "\n")
                stamp = datetime.fromisoformat(record["timestamp"]).timestamp()
                os.utime(path, (stamp, stamp))
        if args.config == "wirecat" and not (conv_place["memo"] / "data").exists():
            timings[conv] = seed_memo(conv_place, records)
            skill = subprocess.run([str(conv_place["bin"] / "memo"), "skill", "show"], capture_output=True,
                                   text=True, check=True).stdout
            target = place["hermes_home"] / "skills/cli-memo"
            target.mkdir(parents=True, exist_ok=True)
            (target / "SKILL.md").write_text(skill)
        timings.setdefault(conv, {})["prepare_s"] = round(time.perf_counter() - started, 1)
    print(json.dumps({"config": args.config, "timings": timings}, indent=2))


def oracle_seen(hermes_home, session_ids):
    database = hermes_home / "state.db"
    if not session_ids or not database.exists():
        return None
    with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as db:
        marks = ",".join("?" * len(session_ids))
        rows = db.execute(f"SELECT coalesce(content, '') || coalesce(tool_calls, '') FROM messages "
                          f"WHERE session_id IN ({marks})", list(session_ids)).fetchall()
    return any(marker in text for (text,) in rows for marker in ORACLE_MARKERS)


def tool_calls(hermes_home, session_id):
    database = hermes_home / "state.db"
    if not session_id or not database.exists():
        return []
    with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as db:
        rows = db.execute("SELECT tool_calls FROM messages WHERE session_id = ? AND tool_calls IS NOT NULL",
                          (session_id,)).fetchall()
    calls = []
    for (raw,) in rows:
        try:
            for call in json.loads(raw):
                function = call.get("function", call)
                calls.append({"name": function.get("name"), "arguments": str(function.get("arguments"))[:300]})
        except (json.JSONDecodeError, TypeError, AttributeError):
            calls.append({"raw": str(raw)[:300]})
    return calls


def tool_results(hermes_home, session_id):
    database = hermes_home / "state.db"
    if not session_id or not database.exists():
        return []
    with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as db:
        rows = db.execute("SELECT tool_name, content FROM messages WHERE session_id = ? AND role = 'tool'",
                          (session_id,)).fetchall()
    results = []
    for name, content in rows:
        text = content or ""
        try:
            body = json.loads(text)
        except json.JSONDecodeError:
            body = None
        exit_code = body.get("exit_code") if isinstance(body, dict) else None
        error = body.get("error") if isinstance(body, dict) else None
        results.append({"tool": name, "exit_code": exit_code, "error": str(error)[:300] if error else None,
                        "head": text[:200]})
    return results


def sessions_cited(reply):
    cited = (reply or {}).get("citations") or []
    found = set()
    for item in cited if isinstance(cited, list) else [cited]:
        for number in re.findall(r"(?:session\s*|\br0*)(\d+)", str(item), flags=re.I):
            found.add(int(number))
    return sorted(found)


def answer(args):
    questions = {q["id"]: q for q in json.loads((ROOT / "questions.json").read_text())["questions"]}
    chosen = [questions[q] for q in args.questions.split(",")]
    # A copied HERMES_HOME breaks: plugin environments are recorded by absolute path. So every run uses the
    # setup's own home, and its built-in memory is moved aside first, so a run never reads an earlier run's notes.
    hermes_home = base.paths(args.config)["hermes_home"]
    args.output.mkdir(parents=True, exist_ok=False)
    memories = hermes_home / "memories"
    if memories.exists() and any(memories.iterdir()):
        shutil.move(str(memories), str(args.output / "memories-before-run"))
    memories.mkdir(exist_ok=True)
    stores = json.loads(args.stores) if args.stores else {}
    raw = args.output / "raw"
    raw.mkdir()
    env_extra = {"DEEPSEEK_API_KEY": os.environ.get("DEEPSEEK_API_KEY", "")} if args.provider == "deepseek" else {}
    if args.provider == "openrouter":
        import orkey
        env_extra = {"OPENROUTER_API_KEY": orkey.key()}
    rows = []
    for q in chosen:
        conv = q["conversation"]
        place = paths_for(args.config, conv, args.run)
        manifest = json.loads((FIXTURES / conv / "manifest.json").read_text())
        model_config(place, args.model, args.provider, args.config, stores.get(conv), manifest["speakers"])
        prompt = PROMPT.format(a=manifest["speakers"]["a"], b=manifest["speakers"]["b"],
                               where=WHERE[args.config], question=q["question"])
        env = base.hermes_env(args.config) | env_extra
        env["HERMES_HOME"] = str(place["hermes_home"])
        env["TERMINAL_CWD"] = str(place["workspace"])
        env["PATH"] = f"{place['bin']}:{os.environ['PATH']}"
        env["PYTHONPATH"] = ""
        usage = raw / f"{q['id']}.usage.json"
        started = time.perf_counter()
        try:
            done = subprocess.run([str(base.HERMES_PYTHON), str(base.HERMES_SCRIPT), "-z", prompt, "--usage-file",
                                   str(usage), "-m", args.model, "--provider", args.provider, "--reasoning",
                                   args.reasoning, "-t", base.CONFIGS[args.config]["toolsets"]],
                                  env=env, cwd=place["workspace"], capture_output=True, text=True,
                                  timeout=args.timeout, check=False)
            stdout, stderr, code = done.stdout, done.stderr, done.returncode
        except subprocess.TimeoutExpired as error:
            stdout = error.stdout.decode() if isinstance(error.stdout, bytes) else (error.stdout or "")
            stderr, code = f"timeout after {args.timeout}s", None
        seconds = time.perf_counter() - started
        (raw / f"{q['id']}.stdout.txt").write_text(stdout)
        (raw / f"{q['id']}.stderr.txt").write_text(stderr)
        reply = base.parse(stdout)
        spent = json.loads(usage.read_text()) if usage.exists() else {}
        session = spent.get("session_id")
        rows.append({"id": q["id"], "conversation": conv, "category": q["category_name"], "question": q["question"],
                     "gold": q["answer"], "answer": (reply or {}).get("answer", ""),
                     "sessions_cited": sessions_cited(reply), "seconds": round(seconds, 1), "exit": code,
                     "usage": spent, "tool_calls": tool_calls(place["hermes_home"], session),
                     "tool_results": tool_results(place["hermes_home"], session),
                     "oracle_seen": oracle_seen(place["hermes_home"], [session] if session else [])})
        print(f"{q['id']} {seconds:.0f}s exit={code} answer={rows[-1]['answer']!r} "
              f"tools={[c.get('name') for c in rows[-1]['tool_calls']]}", flush=True)
        (args.output / "answers.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    meta = {"agent": "hermes", "config": args.config, "model": args.model, "provider": args.provider,
            "reasoning": args.reasoning, "stores": stores, "date": datetime.now(UTC).isoformat(timespec="seconds"),
            "hermes": subprocess.run([str(base.HERMES_PYTHON), str(base.HERMES_SCRIPT), "--version"],
                                     capture_output=True, text=True).stdout.splitlines()[0]}
    (args.output / "run.json").write_text(json.dumps(meta, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("--config", choices=list(base.CONFIGS), required=True)
    prep.add_argument("--conversations", required=True)
    ans = sub.add_parser("answer")
    ans.add_argument("--config", choices=list(base.CONFIGS), required=True)
    ans.add_argument("--questions", required=True, help="comma list of question ids from questions.json")
    ans.add_argument("--run", required=True, help="run name; its HERMES_HOME is a fresh copy of the template")
    ans.add_argument("--stores", help='JSON {"conv-26": "<tag or bank>"} for provider setups')
    ans.add_argument("--output", type=Path, required=True)
    ans.add_argument("--model", default="deepseek-flash")
    ans.add_argument("--provider", default="deepseek")
    ans.add_argument("--reasoning", default="medium")
    ans.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    prepare(args) if args.command == "prepare" else answer(args)


if __name__ == "__main__":
    main()
