#!/usr/bin/env python3
"""LoCoMo through OpenClaw: openclaw_runner.py's install, isolation and reply parsing, with two agents per
conversation (files in the agent's memory folder, and WireCat memo) and the LoCoMo prompt."""

import argparse
import json
import os
import signal
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path

import openclaw_runner as oc
from hermes_locomo import FIXTURES, ORACLE_MARKERS, PROMPT, ROOT, sessions_cited

# The runs used OpenClaw 2026.11.7; knowledge-graph-memory's runner pins an older one.
oc.OPENCLAW_VERSION = "2026.11.7"

OC_ROOT = ROOT / "openclaw"
WHERE = {
    "files": "The chat is in Markdown files in your memory folder, one session per file (memory/r0001.md is "
             "session 1, and so on); each file starts with the session's date. Use your memory search, and read "
             "the files when you need to.",
    "memo": "The chat is in WireCat Memo notes. Search them with the `memo` command; the cli-memo skill describes "
            "it. Each note is one session; its first line names the session number and date.",
}


def agent_id(kind, conv):
    return f"{kind}-{conv.replace('conv-', 'c')}"


def memo_bin(conv):
    return ROOT / "bench/hermes/wirecat" / conv / "bin"


def env_for(kind, conv):
    env = oc.openclaw_env(OC_ROOT)
    if kind == "memo":
        env["PATH"] = f"{memo_bin(conv)}:{env['PATH']}"
    return env


def configure(convs, model):
    path = oc.config_path(OC_ROOT)
    config = json.loads(path.read_text())
    agents = config.setdefault("agents", {})
    agents["ownership"] = "explicit"
    defaults = agents.setdefault("defaults", {})
    defaults.pop("workspace", None)
    first = agent_id("files", convs[0])
    for owner in ("authInheritance", "systemAgent"):
        defaults[owner] = {"agentId": first}
    agents["entries"] = {agent_id(kind, conv): {"workspace": str(OC_ROOT / "ws" / agent_id(kind, conv))}
                         for conv in convs for kind in ("files", "memo")}
    search = config.setdefault("memory", {}).setdefault("search", {})
    search["sources"] = ["memory"]
    search["rememberAcrossConversations"] = False
    defaults.setdefault("compaction", {})["memoryFlush"] = {"enabled": False}
    if model:
        defaults["model"] = {"primary": model}
        defaults.setdefault("models", {})[model] = {"agentRuntime": {"id": "openclaw"}}
    path.write_text(json.dumps(config, indent=2) + "\n")


def prepare(args):
    convs = args.conversations.split(",")
    configure(convs, args.model)
    timings = {}
    for conv in convs:
        records = [json.loads(line) for line in (FIXTURES / conv / "corpus.jsonl").read_text().splitlines()]
        memory = OC_ROOT / "ws" / agent_id("files", conv) / "memory"
        memory.mkdir(parents=True, exist_ok=True)
        for index, record in enumerate(records):
            path = memory / f"{oc.name_of(index)}.md"
            path.write_text(record["text"] + "\n")
            stamp = datetime.fromisoformat(record["timestamp"]).timestamp()
            os.utime(path, (stamp, stamp))
        (OC_ROOT / "ws" / agent_id("memo", conv) / "memory").mkdir(parents=True, exist_ok=True)
        started = time.perf_counter()
        index = oc.openclaw(OC_ROOT, "memory", "index", "--force", "--agent", agent_id("files", conv), "--verbose",
                            timeout=3600, check=False)
        (OC_ROOT / "logs" / f"memory-index-{conv}.txt").write_text(index.stdout + index.stderr)
        timings[conv] = {"memory_index_s": round(time.perf_counter() - started, 1), "exit": index.returncode}
    skills = OC_ROOT / "home/.agents/skills/cli-memo"
    if not skills.exists():
        wrapper = memo_bin(convs[0]) / "memo"
        text = subprocess.run([str(wrapper), "skill", "show"], capture_output=True, text=True, check=True).stdout
        skills.mkdir(parents=True)
        (skills / "SKILL.md").write_text(text)
    print(json.dumps(timings, indent=2))


# The isolated rerun (2026-11-25): each question runs in bubblewrap over a clean OpenClaw base with
# no past sessions, its writes kept per question, and every file that holds gold answers hidden from the agent.
ISO_BASE = os.environ.get("OC_ISO_BASE")
ISO_UPPER = Path(os.environ.get("OC_ISO_UPPER", ROOT / "oc-iso"))
HIDDEN = [ROOT / name for name in ("runs", "locomo-src", "fixtures", "ref", "probe", "mem0-eval", "oc-iso", "oc-iso2", "oc-base",
                                   "cache")] + [Path("/var/tmp/locomo-bench-p3"), Path("/var/tmp/claude"), Path("/tmp")]
# The owner's home is hidden whole, so no agent can read files outside the benchmark; the memo wrapper only needs
# the node install back.
OWNER_HOME = Path.home()
OWNER_READ_ONLY = [OWNER_HOME / ".nvm"]
HIDDEN_FILES = [ROOT / "questions.json", ROOT / "RESULT.md", ROOT / "all-ids.txt", ROOT / "stage2-ids.txt",
                ROOT / "strong-subset-ids.txt"]


def isolated(command, session, cwd):
    # Only the state folders get an overlay: plugins refuse to load when their files appear on another mount.
    wrap = ["bwrap", "--dev-bind", "/", "/", "--tmpfs", str(OWNER_HOME)]
    for path in OWNER_READ_ONLY:
        wrap += ["--ro-bind", str(path), str(path)]
    for part in ("home/.openclaw/agents", "home/.openclaw/state", "ws"):
        up, work = ISO_UPPER / session / "up" / part, ISO_UPPER / session / "work" / part
        up.mkdir(parents=True, exist_ok=True)
        work.mkdir(parents=True, exist_ok=True)
        wrap += ["--overlay-src", str(Path(ISO_BASE) / part), "--overlay", str(up), str(work), str(OC_ROOT / part)]
    up = ISO_UPPER / session / "up"
    for path in HIDDEN:
        if path.exists():
            wrap += ["--tmpfs", str(path)]
    for path in HIDDEN_FILES:
        if path.exists():
            wrap += ["--ro-bind", "/dev/null", str(path)]
    # The overlay gives the credential database a new inode, which OpenClaw reads as a stale migration and then
    # refuses every exec call; doctor rewrites the receipt inside the sandbox.
    repair = f"{command[0]} doctor --repair --non-interactive --client-credentials >/dev/null 2>&1; exec \"$@\""
    return wrap + ["--die-with-parent", "--chdir", str(cwd), "--", "/bin/sh", "-c", repair, "sh"] + command, up


def ask(args, q, raw):
    conv = q["conversation"]
    kind = args.agent
    manifest = json.loads((FIXTURES / conv / "manifest.json").read_text())
    prompt = PROMPT.format(a=manifest["speakers"]["a"], b=manifest["speakers"]["b"], where=WHERE[kind],
                           question=q["question"])
    session = f"locomo-{kind}-{args.run}-{q['id']}"
    command = [str(oc.paths(OC_ROOT)["openclaw"]), "agent", "--local", "--agent", agent_id(kind, conv),
               "--session-id", session, "--message", prompt, "--model", args.model, "--json",
               "--timeout", str(args.timeout)]
    if args.thinking:
        command += ["--thinking", args.thinking]
    state = OC_ROOT
    if ISO_BASE:
        command, state = isolated(command, session, OC_ROOT / "ws" / agent_id(kind, conv))
    started = time.perf_counter()
    process = subprocess.Popen(command, env=env_for(kind, conv), cwd=OC_ROOT / "ws" / agent_id(kind, conv),
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=args.timeout + 120)
        code = process.returncode
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGTERM)
        stdout, stderr = process.communicate()
        code = "timeout"
    seconds = time.perf_counter() - started
    (raw / f"{q['id']}.stdout.json").write_text(stdout)
    (raw / f"{q['id']}.stderr.txt").write_text(stderr)
    try:
        envelope = json.loads(stdout)
    except json.JSONDecodeError:
        envelope = {}
    text = oc.final_text(envelope)
    reply = oc.parse_reply(text)
    meta = envelope.get("meta") or {}
    agent_meta = meta.get("agentMeta") or {}
    tools = meta.get("toolSummary") or {}
    transcript = b"".join(p.read_bytes() for p in (state / "home/.openclaw/agents" / agent_id(kind, conv)).rglob(
        "*.sqlite*") if p.is_file())
    return {"id": q["id"], "conversation": conv, "category": q["category_name"], "question": q["question"],
            "gold": q["answer"], "answer": (reply or {}).get("answer", ""), "sessions_cited": sessions_cited(reply),
            "seconds": round(seconds, 1), "exit": code, "final_text": text, "usage": agent_meta.get("usage"),
            "cost_usd": agent_meta.get("costUsd"), "model": agent_meta.get("model"),
            "provider": agent_meta.get("provider"), "tools": tools.get("tools"), "tool_calls": tools.get("calls"),
            "oracle_seen": any(m.encode() in transcript for m in ORACLE_MARKERS), "error": envelope.get("error")}


def answer(args):
    questions = {q["id"]: q for q in json.loads((ROOT / "questions.json").read_text())["questions"]}
    args.output.mkdir(parents=True, exist_ok=False)
    raw = args.output / "raw"
    raw.mkdir()
    # Always the same config (every conversation's agents, Flash as default; --model picks per call), so the files
    # and memo lanes can run at the same time without one rewriting the other's agents.
    configure(sorted({q["conversation"] for q in questions.values()}), "deepseek/deepseek-flash")
    rows = []
    for qid in args.questions.split(","):
        rows.append(ask(args, questions[qid], raw))
        row = rows[-1]
        print(f"{qid} {row['seconds']}s exit={row['exit']} answer={row['answer']!r} tools={row['tools']}",
              flush=True)
        (args.output / "answers.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    meta = {"agent": "openclaw", "version": oc.openclaw(OC_ROOT, "--version").stdout.strip(), "kind": args.agent,
            "model": args.model, "thinking": args.thinking, "date": datetime.now(UTC).isoformat(timespec="seconds"),
            "leftover_llama_servers_stopped": oc.stop_leftover_servers(OC_ROOT)}
    (args.output / "run.json").write_text(json.dumps(meta, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("--conversations", required=True)
    prep.add_argument("--model", default="deepseek/deepseek-flash")
    ans = sub.add_parser("answer")
    ans.add_argument("--agent", choices=list(WHERE), required=True)
    ans.add_argument("--questions", required=True)
    ans.add_argument("--run", required=True)
    ans.add_argument("--output", type=Path, required=True)
    ans.add_argument("--model", default="deepseek/deepseek-flash")
    ans.add_argument("--thinking")
    ans.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    prepare(args) if args.command == "prepare" else answer(args)


if __name__ == "__main__":
    main()
