#!/usr/bin/env python3
"""Answer the benchmark questions with Hermes Agent in four configurations and score the normalized answers."""

import argparse
import json
import os
import re
import sqlite3
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path

from memo_baseline import Memo, configure_mail, isolated_env, name_of, write_sources
from provider_retrieval import keyring_secret
from run import score

# WIRECAT_BENCH moves the configurations (as in hermes-anthropic-key.sh); the provider SDKs stay shared.
SHARED = Path.home() / ".cache/wirecat-bench"
BENCH = Path(os.environ.get("WIRECAT_BENCH", SHARED))
HERMES_PYTHON = Path.home() / ".hermes/hermes-agent/venv/bin/python"
HERMES_SCRIPT = Path.home() / ".hermes/hermes-agent/hermes"
OWNER_HERMES = Path.home() / ".hermes"
OWNER_FILES = ["config.yaml", "auth.json", "SOUL.md", "state.db", "memories", ".hermes_history"]
# The owner's running gateway refreshes its own token in auth.json; a change there alone is not this run's doing.
OWNER_REFRESHED = {"auth.json"}

CONFIGS = {
    "alone": {"toolsets": "file,terminal,memory", "provider": "",
              "where": "The records are text files in ./corpus, one record per file. A record's name is its file "
                       "name without .md; the file's modification time is the record's date."},
    "wirecat": {"toolsets": "terminal,skills,memory", "provider": "",
                "where": "The records are in memo: use the `memo` command as the cli-memo skill describes. A record's "
                         "name is the title of a note or the subject of an email."},
    "supermemory": {"toolsets": "memory", "provider": "supermemory",
                    "where": "The records are in your Supermemory long-term memory; search it. A record's name is "
                             "the rid in a result's metadata, when the result shows it."},
    "mem0": {"toolsets": "memory", "provider": "mem0",
             "where": "The records are in your Mem0 long-term memory; search it. A record's name is the rid in a "
                      "result's metadata, when the result shows it."},
}

PROMPT = """You are answering one question about the owner's records. {where}

Question (answer as of {as_of}): {question}

Reply with one JSON object and nothing else: {{"answer": "...", "citations": ["..."]}}
- answer: the shortest exact value: a date as YYYY-MM-DD, a person's full name, or a short phrase.
  If the records do not hold it, answer "unknown" with no citations.
- citations: the names of the records (like r0042) that support the answer."""


def paths(config):
    base = BENCH / "hermes" / config
    return {"base": base, "hermes_home": base / "hermes-home", "home": base / "home", "workspace": base / "workspace",
            "memo": base / "memo", "bin": base / "bin", "codex_home": SHARED / "codex-empty"}


def hermes_env(config):
    place = paths(config)
    env = {
        "PATH": f"{place['bin']}:{os.environ['PATH']}",
        "HOME": str(place["home"]),
        "HERMES_HOME": str(place["hermes_home"]),
        # Hermes's terminal and file tools start in TERMINAL_CWD, else HOME, not in the process's working folder.
        "TERMINAL_CWD": str(place["workspace"]),
        # An empty CODEX_HOME stops Hermes importing or self-healing from the owner's ~/.codex/auth.json.
        "CODEX_HOME": str(place["codex_home"]),
        "PYTHONPATH": f"{Path(__file__).resolve().parent / 'hermes_site'}:{SHARED / 'pydeps'}",
        "PYTHONDONTWRITEBYTECODE": "1",
        "MEM0_TELEMETRY": "False",
        # Without this Hermes runs `gh auth token`, which reaches the keyring over D-Bus even with a throwaway HOME,
        # and stores the owner's GitHub token in the benchmark's auth.json as a Copilot credential.
        "DBUS_SESSION_BUS_ADDRESS": "disabled:",
        "TERM": os.environ.get("TERM", "xterm-256color"),
        "LANG": "C.UTF-8",
        "TZ": "UTC",
    }
    if CONFIGS[config]["provider"] == "supermemory":
        env["SUPERMEMORY_API_KEY"] = keyring_secret("supermemory")
    if CONFIGS[config]["provider"] == "mem0":
        env["MEM0_API_KEY"] = keyring_secret("mem0")
    return env


def hermes(config, *args, timeout=600, cwd=None):
    # The ~/.local/bin/hermes wrapper unsets PYTHONPATH, which would hide the provider SDKs kept outside ~/.hermes.
    return subprocess.run([str(HERMES_PYTHON), str(HERMES_SCRIPT), *args], env=hermes_env(config), cwd=cwd,
                          capture_output=True, text=True, timeout=timeout, check=False)


def owner_snapshot():
    found = {}
    for name in OWNER_FILES:
        path = OWNER_HERMES / name
        if path.is_dir():
            for child in sorted([path, *path.iterdir()]):
                found[str(child)] = child.stat().st_mtime_ns
        elif path.exists():
            found[str(path)] = path.stat().st_mtime_ns
    return found


def write_config(config, model, provider, tag):
    place = paths(config)
    lines = ["model:", f"  default: {model}", f"  provider: {provider}", "memory:", "  memory_enabled: true",
             "  user_profile_enabled: true", f"  provider: '{CONFIGS[config]['provider']}'"]
    (place["hermes_home"] / "config.yaml").write_text("\n".join(lines) + "\n")
    if config == "supermemory":
        (place["hermes_home"] / "supermemory.json").write_text(json.dumps({"container_tag": tag}, indent=2) + "\n")
    if config == "mem0":
        (place["hermes_home"] / "mem0.json").write_text(json.dumps({"user_id": tag}, indent=2) + "\n")


def seed_memo(place, records, model):
    memo = Memo("memo", place["memo"])
    write_sources(records, place["memo"] / "data")
    folder, _ = memo.json("folders", "add", str(place["memo"] / "data/notes"), "--format", "markdown")
    configure_mail(memo, place["memo"] / "data")
    memo.json("sync", "--only", "notes", "--no-embed")
    memo.json("sync", "--source", "email:synthetic", "--since-time", "2000-01-01", "--limit", "50000", "--no-embed")
    memo.json("models", "download", model)
    memo.json("sync", "--since-time", "2000-01-01", "--limit", "50000", "--source", "email:synthetic",
              "--folder", folder["item"]["id"])
    real = subprocess.run(["which", "memo"], capture_output=True, text=True, check=True).stdout.strip()
    # memo gets its own throwaway folders; the wrapper keeps them out of Hermes's environment.
    exports = "".join(f"export {key}='{value}'\n" for key, value in isolated_env(place["memo"]).items()
                      if key != "PATH")
    wrapper = place["bin"] / "memo"
    wrapper.write_text(f"#!/bin/sh\n{exports}exec '{real}' \"$@\"\n")
    wrapper.chmod(0o755)
    skill = subprocess.run([str(wrapper), "skill", "show"], capture_output=True, text=True, check=True).stdout
    target = place["hermes_home"] / "skills/cli-memo"
    target.mkdir(parents=True, exist_ok=True)
    (target / "SKILL.md").write_text(skill)


def prepare(args):
    place = paths(args.config)
    for key in ("hermes_home", "home", "workspace", "bin", "codex_home"):
        place[key].mkdir(parents=True, exist_ok=True)
    if CONFIGS[args.config]["provider"] and not args.tag:
        raise SystemExit("--tag is required: the container tag / user id of a full provider_retrieval.py ingest")
    if args.config == "supermemory" and not re.fullmatch(r"\w+", args.tag):
        raise SystemExit("Hermes's Supermemory provider rewrites any character outside [A-Za-z0-9_] in a tag; "
                         "ingest with a tag made of those")
    write_config(args.config, args.model, args.provider, args.tag)
    records = [json.loads(line) for line in (args.fixture / "corpus.jsonl").read_text().splitlines()]
    if args.config == "alone":
        corpus = place["workspace"] / "corpus"
        corpus.mkdir(exist_ok=True)
        for index, record in enumerate(records):
            path = corpus / f"{name_of(index)}.md"
            path.write_text(record["text"] + "\n")
            stamp = datetime.fromisoformat(record["timestamp"]).timestamp()
            os.utime(path, (stamp, stamp))
    if args.config == "wirecat" and not (place["memo"] / "data").exists():
        seed_memo(place, records, args.embedding_model)
    print(f"prepared {args.config}: HERMES_HOME={place['hermes_home']}")


def signed_in(config, provider):
    done = hermes(config, "auth", "list", timeout=60)
    # Only a yes/no leaves this function: the listing can hold the account's e-mail as a label.
    return done.returncode == 0 and any(line.startswith(f"{provider} (") for line in done.stdout.splitlines())


def oracle_seen(place, session_ids):
    # The auto-approved terminal tool can read the answer key; these keys exist only in oracle.json.
    # state.db keeps every earlier run's sessions, so only this run's sessions are read.
    markers = ("oracle.json", "required_citations", "stale_answers")
    database = place["hermes_home"] / "state.db"
    if not session_ids or not database.exists():
        return None
    with sqlite3.connect(f"file:{database}?mode=ro", uri=True) as db:
        marks = ",".join("?" * len(session_ids))
        rows = db.execute(f"SELECT coalesce(content, '') || coalesce(tool_calls, '') FROM messages "
                          f"WHERE session_id IN ({marks})", list(session_ids)).fetchall()
    return any(marker in text for (text,) in rows for marker in markers)


def parse(stdout):
    for candidate in reversed(re.findall(r"\{.*?\}", stdout, flags=re.S)):
        try:
            value = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and "answer" in value:
            return value
    return None


def normalize(reply, names):
    if reply is None:
        return {"answer": "", "citations": []}, "no JSON object in the reply"
    answer = str(reply.get("answer", ""))
    cited = reply.get("citations") or []
    cited = [str(item) for item in cited] if isinstance(cited, list) else [str(cited)]
    mapped = []
    for item in cited:
        match = re.fullmatch(r"(?:.*/)?(r\d{4,})(?:\.md)?", item.strip())
        source = names.get(match.group(1)) if match else None
        mapped.append(source or item)
    return {"answer": answer, "citations": sorted(set(mapped))}, None


def answer(args):
    if not signed_in(args.config, args.provider):
        script = "hermes-anthropic-key.sh" if args.provider == "anthropic" else "hermes-signin.sh"
        raise SystemExit(f"{args.config}: no {args.provider} credential in its HERMES_HOME; run {script} first")
    place = paths(args.config)
    args.output.mkdir(parents=True, exist_ok=False)
    raw = args.output / "raw"
    raw.mkdir()
    records = [json.loads(line) for line in (args.fixture / "corpus.jsonl").read_text().splitlines()]
    names = {name_of(index): record["id"] for index, record in enumerate(records)}
    queries = json.loads((args.fixture / "queries.json").read_text())
    if args.questions:
        queries = [query for query in queries if query["id"] in args.questions.split(",")]
    before = owner_snapshot()
    predictions, rows = [], []
    for query in queries:
        prompt = PROMPT.format(where=CONFIGS[args.config]["where"], as_of=query["as_of"], question=query["question"])
        usage = raw / f"{query['id']}.usage.json"
        started = time.perf_counter()
        try:
            done = hermes(args.config, "-z", prompt, "--usage-file", str(usage), "-m", args.model,
                          "--provider", args.provider, "--reasoning", args.reasoning,
                          "-t", CONFIGS[args.config]["toolsets"], timeout=args.timeout, cwd=place["workspace"])
            stdout, stderr, code = done.stdout, done.stderr, done.returncode
        except subprocess.TimeoutExpired as error:
            stdout, stderr, code = error.stdout or "", f"timeout after {args.timeout}s", None
            stdout = stdout.decode() if isinstance(stdout, bytes) else stdout
        seconds = time.perf_counter() - started
        (raw / f"{query['id']}.stdout.txt").write_text(stdout)
        (raw / f"{query['id']}.stderr.txt").write_text(stderr if isinstance(stderr, str) else stderr.decode())
        prediction, problem = normalize(parse(stdout), names)
        predictions.append({"id": query["id"], **prediction})
        spent = json.loads(usage.read_text()) if usage.exists() else {}
        rows.append({"id": query["id"], "seconds": seconds, "exit": code, "problem": problem, "usage": spent})
        print(f"{query['id']} {seconds:.0f}s exit={code} answer={prediction['answer']!r}", flush=True)
    after = owner_snapshot()
    changed = sorted(path for path in set(before) | set(after) if before.get(path) != after.get(path))
    (args.output / "predictions.json").write_text(json.dumps(predictions, ensure_ascii=False, indent=2) + "\n")
    (args.output / "per-query.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    summary = {"config": args.config, "model": args.model, "model_provider": args.provider,
               "reasoning": args.reasoning,
               "toolsets": CONFIGS[args.config]["toolsets"], "provider": CONFIGS[args.config]["provider"],
               "date": datetime.now(UTC).isoformat(timespec="seconds"), "questions": len(queries),
               "owner_hermes_changed": changed, "oracle_seen_in_sessions": oracle_seen(place, [row["usage"].get("session_id") for row in rows
                                                                       if row["usage"].get("session_id")])}
    if len(queries) == 50:
        oracle = json.loads((args.fixture / "oracle.json").read_text())
        summary["scores"] = score(records, oracle, predictions)
    (args.output / "results.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    if [path for path in changed if Path(path).name not in OWNER_REFRESHED]:
        raise SystemExit("files under ~/.hermes changed during the run; do not trust it until explained")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("prepare", "answer"):
        command = commands.add_parser(name)
        command.add_argument("--config", choices=list(CONFIGS), required=True)
        command.add_argument("--fixture", type=Path, required=True, help="a run.py output directory")
        command.add_argument("--model", default="claude-sonnet-5-5", help="the answering model, same for every run")
        command.add_argument("--provider", default="anthropic", choices=["anthropic", "openai-codex"],
                             help="anthropic: the owner's API key; openai-codex: the ChatGPT sign-in (fallback)")
    commands.choices["prepare"].add_argument("--tag", help="container tag / user id of the provider ingest")
    commands.choices["prepare"].add_argument("--embedding-model", default="e5-small")
    commands.choices["answer"].add_argument("--output", type=Path, required=True, help="a new directory")
    commands.choices["answer"].add_argument("--reasoning", default="medium")
    commands.choices["answer"].add_argument("--timeout", type=int, default=600, help="seconds per question")
    commands.choices["answer"].add_argument("--questions", help="comma list of ids, for a pilot (not scored)")
    args = parser.parse_args()
    prepare(args) if args.command == "prepare" else answer(args)


if __name__ == "__main__":
    main()
