#!/usr/bin/env python3
"""Run the knowledge-graph-memory questions through OpenClaw, alone and with WireCat Memo, in a throwaway home."""

import argparse
import json
import os
import re
import shlex
import shutil
import statistics
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from memo_baseline import Memo, configure_mail, isolated_env, name_of, or_query, percentile, write_sources

OPENCLAW_VERSION = "2026.10.9"
NODE_VERSION = "v24.22.2"
NODE_SHA256 = "48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75"
LLAMA_PLUGIN = "@openclaw/llama-cpp-provider"
AGENTS = {"files": "ws-files", "memo": "ws-memo"}
WHERE = {
    "files": "The records are Markdown files in your memory folder (memory/r0001.md ... memory/r2000.md); "
             "use your memory search, and read the files when you need to.",
    "memo": "The records are stored in WireCat Memo (notes and mail). Search them with the `memo` command; "
            "the cli-memo skill describes it.",
}
PROMPT = """You are answering one question from a set of synthetic records: chat messages, emails, notes and
meeting passages. Every record has a name like r0042. {where}

Answer as of {as_of}. If a date was changed later, the current answer is the latest confirmed one.

Question: {question}

Reply with exactly one JSON object and nothing else:
{{"answer": "<short value>", "citations": ["r0042"]}}

- answer: only the value, for example 2026-01-31, Jane Doe or code review. Dates as YYYY-MM-DD.
- If the records do not state the answer, reply {{"answer": "unknown", "citations": []}}.
- citations: the names of the records that state the answer, and no others.
"""


def paths(root):
    return {"node": root / "node", "pkg": root / "pkg", "home": root / "home", "tmp": root / "tmp",
            "bin": root / "bin", "memo": root / "memo", "logs": root / "logs",
            "openclaw": root / "pkg/node_modules/.bin/openclaw"}


def openclaw_env(root, with_memo=False):
    p = paths(root)
    path = [str(p["node"] / "bin"), "/usr/bin", "/bin"]
    if with_memo:
        path.insert(0, str(p["bin"]))
    # OPENCLAW_HOME moves ~/.openclaw; HOME moves ~/.agents/skills and anything else read from the home folder.
    return {"HOME": str(p["home"]), "OPENCLAW_HOME": str(p["home"]), "TMPDIR": str(p["tmp"]),
            "PATH": ":".join(path), "TERM": "dumb", "NO_COLOR": "1", "TZ": "UTC",
            "OPENCLAW_NO_AUTO_UPDATE": "1", "DBUS_SESSION_BUS_ADDRESS": "disabled:"}


def openclaw(root, *args, with_memo=False, check=True, cwd=None, timeout=None):
    done = subprocess.run([str(paths(root)["openclaw"]), *args], env=openclaw_env(root, with_memo),
                          capture_output=True, text=True, check=False, cwd=cwd or root, timeout=timeout)
    if check and done.returncode != 0:
        raise RuntimeError(f"openclaw {' '.join(args)} exited {done.returncode}: {done.stderr.strip()[-800:]}")
    return done


def install(root):
    """Node from nodejs.org (checked), OpenClaw from npm and its llama.cpp plugin, all under root."""
    p = paths(root)
    for key in ("home", "tmp", "logs", "bin"):
        p[key].mkdir(parents=True, exist_ok=True)
    if not (p["node"] / "bin/node").exists():
        archive = root / f"node-{NODE_VERSION}-linux-x64.tar.xz"
        subprocess.run(["curl", "-fsSL", "-o", str(archive),
                        f"https://nodejs.org/dist/{NODE_VERSION}/node-{NODE_VERSION}-linux-x64.tar.xz"], check=True)
        subprocess.run(["sha256sum", "-c", "-"], input=f"{NODE_SHA256}  {archive}\n", text=True, check=True)
        p["node"].mkdir()
        subprocess.run(["tar", "-xJf", str(archive), "-C", str(p["node"]), "--strip-components=1"], check=True)
    if not p["openclaw"].exists():
        env = {**openclaw_env(root), "npm_config_cache": str(root / "npm-cache")}
        subprocess.run([str(p["node"] / "bin/npm"), "install", "--no-audit", "--no-fund", "--prefix", str(p["pkg"]),
                        f"openclaw@{OPENCLAW_VERSION}"], env=env, check=True)
    print(openclaw(root, "--version").stdout.strip())
    # Written before OpenClaw's first run: its default log folder is /tmp/openclaw, outside the throwaway root.
    if not config_path(root).exists():
        config_path(root).parent.mkdir(parents=True, exist_ok=True)
        config_path(root).write_text(json.dumps({"logging": {"file": str(p["logs"] / "openclaw.log")}}) + "\n")
    openclaw(root, "plugins", "install", LLAMA_PLUGIN)
    for key, value in [("memory.search.provider", "local"), ("memory.search.fallback", "none")]:
        openclaw(root, "config", "set", key, value)
    print("Next, once: the embedding-only llama.cpp setup asks two questions. Answer No to the chat model, "
          "Yes to the embedding model:")
    print(f"  {shlex.join(env_prefix(root))} {p['openclaw']} models auth login --provider llama-cpp --method local")


def env_prefix(root):
    return ["env", "-i", *[f"{key}={value}" for key, value in openclaw_env(root).items()]]


def config_path(root):
    return paths(root)["home"] / ".openclaw/openclaw.json"


def configure_agents(root, model=None):
    """Two agents, one per configuration, so each keeps its own workspace and memory index."""
    config = json.loads(config_path(root).read_text())
    agents = config.setdefault("agents", {})
    agents["ownership"] = "explicit"
    agents.setdefault("defaults", {}).pop("workspace", None)
    # The owner signs in once, as the files agent; the memo agent reads that sign-in through.
    for owner in ("authInheritance", "systemAgent", "heartbeat"):
        agents["defaults"][owner] = {"agentId": "files"}
    agents["entries"] = {agent: {"workspace": str(root / folder)} for agent, folder in AGENTS.items()}
    # Each question runs in a new session; transcripts of earlier questions must not become searchable memory.
    search = config.setdefault("memory", {}).setdefault("search", {})
    search["sources"] = ["memory"]
    search["rememberAcrossConversations"] = False
    if model:
        agents["defaults"]["model"] = {"primary": model}
        # OpenClaw's own agent loop, so memory_search and the skills are OpenClaw's, not the Codex app-server's.
        agents["defaults"].setdefault("models", {})[model] = {"agentRuntime": {"id": "openclaw"}}
    config_path(root).write_text(json.dumps(config, indent=2) + "\n")


def record_file(record):
    when = record["timestamp"]
    return f"date: {when}\n\n{record['text']}\n"


def write_workspace(root, records):
    memory = root / AGENTS["files"] / "memory"
    memory.mkdir(parents=True)
    for index, record in enumerate(records):
        path = memory / f"{name_of(index)}.md"
        path.write_text(record_file(record))
        stamp = datetime.fromisoformat(record["timestamp"]).timestamp()
        os.utime(path, (stamp, stamp))
    # An existing workspace skips OpenClaw's first-run BOOTSTRAP.md ritual, so both agents start the same way.
    (root / AGENTS["memo"] / "memory").mkdir(parents=True)


def write_memo_wrapper(root, memo_binary):
    """`memo` on the agent's PATH runs the real CLI in the throwaway store, with D-Bus off for memo alone."""
    env = isolated_env(paths(root)["memo"])
    env["PATH"] = f"{Path(memo_binary).parent}:/usr/bin:/bin"
    script = "#!/bin/sh\nexec env -i " + " ".join(shlex.quote(f"{k}={v}") for k, v in env.items())
    script += f" {shlex.quote(memo_binary)} \"$@\"\n"
    wrapper = paths(root)["bin"] / "memo"
    wrapper.parent.mkdir(exist_ok=True)
    wrapper.write_text(script)
    wrapper.chmod(0o755)
    return wrapper


def prepare(root, fixture, memo_binary):
    records = [json.loads(line) for line in (fixture / "corpus.jsonl").read_text().splitlines()]
    prepare_json = root / "prepare.json"
    timings = json.loads(prepare_json.read_text())["timings"] if prepare_json.exists() else {}
    configure_agents(root)
    memo_root = paths(root)["memo"]
    memo = Memo(memo_binary, memo_root)
    if not (root / "names.json").exists():
        write_workspace(root, records)
        names = write_sources(records, memo_root / "data")
        memo.json("folders", "add", str(memo_root / "data/notes"), "--format", "markdown")
        configure_mail(memo, memo_root / "data")
        timings["memo_sync_notes_s"] = memo.json("sync", "--only", "notes", "--no-embed")[1]
        timings["memo_sync_mail_s"] = memo.json("sync", "--source", "email:synthetic", "--since-time", "2000-01-01",
                                                "--limit", "5000", "--no-embed")[1]
        wrapper = write_memo_wrapper(root, memo_binary)
        # The skill goes to OpenClaw's throwaway ~/.agents/skills; requires.bins hides it from the files agent.
        subprocess.run([str(wrapper), "skill", "install", "--for", "agents"], check=True, capture_output=True)
        shutil.move(str(memo_root / "home/.agents"), str(paths(root)["home"] / ".agents"))
        (root / "names.json").write_text(json.dumps(names, indent=2) + "\n")

    started = time.perf_counter()
    index = openclaw(root, "memory", "index", "--force", "--agent", "files", "--verbose", timeout=3600)
    timings["openclaw_memory_index_s"] = time.perf_counter() - started
    (paths(root)["logs"] / "memory-index.txt").write_text(index.stdout + index.stderr)
    status = openclaw(root, "memory", "status", "--deep", "--agent", "files", "--json", timeout=600)
    (paths(root)["logs"] / "memory-status-deep.json").write_text(status.stdout)
    skills = {}
    for label, with_memo in (("files", False), ("memo", True)):
        listing = json.loads(openclaw(root, "skills", "list", "--agent", label, "--json", with_memo=with_memo).stdout)
        skills[label] = [{"name": s["name"], "source": s.get("source"), "eligible": s.get("eligible")}
                         for s in listing["skills"] if s["name"] == "cli-memo"]
    result = {"openclaw": openclaw(root, "--version").stdout.strip(), "memo": memo.run("--version")[0].strip(),
              "timings": timings, "cli_memo_skill": skills}
    (root / "prepare.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


def memory_search(root, agent, query):
    done = openclaw(root, "memory", "search", query, "--agent", agent, "--json", "--max-results", "10", check=False,
                    timeout=600)
    try:
        reply = json.loads(done.stdout)
    except json.JSONDecodeError:
        reply = {"error": done.stderr.strip()[-800:]}
    return reply


def hit_name(hit):
    match = re.search(r"(r\d{4})\.md", json.dumps(hit))
    return match.group(1) if match else None


def retrieval(root, fixture, output):
    """OpenClaw's own memory search for each question, no answer model: recall of the expected record."""
    output.mkdir(parents=True, exist_ok=False)
    names = json.loads((root / "names.json").read_text())
    queries = json.loads((fixture / "queries.json").read_text())
    oracle = {row["id"]: set(row["required_citations"]) for row in json.loads((fixture / "oracle.json").read_text())}
    memory_search(root, "files", "warm up")
    scores = []
    for label, rewrite in (("question verbatim", lambda text: text), ("content words joined by OR", or_query)):
        folder = output / re.sub(r"\W+", "-", label)
        folder.mkdir()
        rows = []
        for query in queries:
            text = rewrite(query["question"])
            started = time.perf_counter()
            reply = memory_search(root, "files", text)
            seconds = time.perf_counter() - started
            (folder / f"{query['id']}.json").write_text(json.dumps(reply, ensure_ascii=False, indent=2) + "\n")
            hits = [names.get(hit_name(hit), f"unmapped:{hit_name(hit)}") for hit in reply.get("results", [])]
            rows.append({"id": query["id"], "query": text, "hits": hits, "seconds": seconds})
        cited = [row for row in rows if oracle[row["id"]]]
        recall = {k: sum(bool(oracle[row["id"]] & set(row["hits"][:k])) for row in cited) / len(cited)
                  for k in (1, 5, 10)}
        times = [row["seconds"] for row in rows]
        scores.append({"run": label, "questions_scored": len(cited), **{f"recall@{k}": v for k, v in recall.items()},
                       "p50_s": statistics.median(times), "p95_s": percentile(times, 0.95),
                       "empty_replies": sum(not row["hits"] for row in rows), "rows": rows})
    (output / "results.json").write_text(json.dumps(scores, ensure_ascii=False, indent=2) + "\n")
    print("| Query | Questions scored | Recall@1 | Recall@5 | Recall@10 | p50 s | p95 s | Empty replies |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|")
    for row in scores:
        print(f"| {row['run']} | {row['questions_scored']} | {row['recall@1']:.2f} | {row['recall@5']:.2f} | "
              f"{row['recall@10']:.2f} | {row['p50_s']:.2f} | {row['p95_s']:.2f} | {row['empty_replies']} |")


def parse_reply(text):
    """The last JSON object in the final text; the normalizer was fixed before any answering run."""
    for match in reversed(list(re.finditer(r"\{[^{}]*\}", text or "", re.S))):
        try:
            value = json.loads(match.group(0))
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and "answer" in value:
            return value
    return None


def normalize(reply, names):
    if not reply:
        return "unknown", [], "no JSON answer in the reply"
    answer = str(reply.get("answer", "")).strip().strip("\"'").rstrip(".").strip() or "unknown"
    citations = reply.get("citations") or []
    if not isinstance(citations, list):
        citations = [citations]
    refs = []
    for cite in citations:
        match = re.search(r"r\d{4}", str(cite))
        refs.append(names.get(match.group(0), f"unmapped:{cite}") if match else f"unmapped:{cite}")
    if answer.casefold() == "unknown":
        refs = []
    return answer, sorted(set(refs)), None


def final_text(envelope):
    for key in ("final", "text", "reply"):
        if isinstance(envelope.get(key), str):
            return envelope[key]
    payloads = envelope.get("payloads") or envelope.get("result", {}).get("payloads") or []
    return "\n".join(p.get("text", "") for p in payloads if isinstance(p, dict))


def audit(root, agent):
    """Did the agent reach for the answer key, and did OpenClaw write memory of its own during the run?"""
    store = paths(root)["home"] / f".openclaw/agents/{agent}/agent"
    blob = b"".join(path.read_bytes() for path in store.glob("openclaw-agent.sqlite*") if path.is_file())
    memory = root / AGENTS[agent] / "memory"
    return {"transcript_mentions": {word: blob.count(word.encode())
                                    for word in ("oracle", "run.py", "fixture", "knowledge-graph-memory")},
            "memory_files": len(list(memory.glob("*.md"))),
            "memory_md_exists": (root / AGENTS[agent] / "MEMORY.md").exists()}


def answer(root, fixture, output, agent, model, thinking, only, timeout):
    output.mkdir(parents=True, exist_ok=False)
    raw = output / "raw"
    raw.mkdir()
    configure_agents(root, model)
    names = json.loads((root / "names.json").read_text())
    queries = json.loads((fixture / "queries.json").read_text())
    selected = [q for q in queries if not only or q["id"] in only]
    run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
    predictions, rows = [], []
    for query in selected:
        prompt = PROMPT.format(where=WHERE[agent], as_of=query["as_of"], question=query["question"])
        args = ["agent", "--local", "--agent", agent, "--session-id", f"kg-{agent}-{run_id}-{query['id']}",
                "--message", prompt, "--model", model, "--json", "--timeout", str(timeout)]
        if thinking:
            args += ["--thinking", thinking]
        started = time.perf_counter()
        done = openclaw(root, *args, with_memo=agent == "memo", check=False, cwd=root / AGENTS[agent],
                        timeout=timeout + 120)
        seconds = time.perf_counter() - started
        (raw / f"{query['id']}.stdout.json").write_text(done.stdout)
        (raw / f"{query['id']}.stderr.txt").write_text(done.stderr)
        try:
            envelope = json.loads(done.stdout)
        except json.JSONDecodeError:
            envelope = {}
        text = final_text(envelope)
        value, refs, problem = normalize(parse_reply(text), names)
        meta = envelope.get("meta", {})
        agent_meta = meta.get("agentMeta", {})
        rows.append({"id": query["id"], "exit": done.returncode, "seconds": round(seconds, 2), "answer": value,
                     "citations": refs, "problem": problem, "final_text": text,
                     "usage": agent_meta.get("usage") or envelope.get("usage"),
                     "list_price_usd_estimate": agent_meta.get("costUsd", envelope.get("costUsd")),
                     "tools": (meta.get("toolSummary") or envelope.get("toolSummary") or {}).get("tools"),
                     "tool_calls": (meta.get("toolSummary") or envelope.get("toolSummary") or {}).get("calls"),
                     "model": agent_meta.get("model", envelope.get("model")),
                     "provider": agent_meta.get("provider", envelope.get("provider"))})
        predictions.append({"id": query["id"], "answer": value, "citations": refs})
        print(f"{query['id']} exit={done.returncode} {seconds:.1f}s answer={value!r} citations={len(refs)}",
              file=sys.stderr)
    answered = {row["id"] for row in predictions}
    padded = predictions + [{"id": q["id"], "answer": "unknown", "citations": []}
                            for q in queries if q["id"] not in answered]
    (output / "predictions.json").write_text(json.dumps(padded, ensure_ascii=False, indent=2) + "\n")
    (output / "per-question.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    meta = {"openclaw": openclaw(root, "--version").stdout.strip(), "agent": agent, "model": model,
            "thinking": thinking, "runtime": "openclaw", "questions_run": len(selected),
            "questions_padded_unknown": len(padded) - len(predictions), "prompt": PROMPT, "where": WHERE[agent],
            "after_run": audit(root, agent)}
    (output / "run.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(meta | {"prompt": "(in run.json)"}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.home() / ".cache/wirecat-bench/openclaw",
                        help="throwaway folder holding Node, OpenClaw, its home and both workspaces")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("install", help="Node, OpenClaw and the llama.cpp plugin under --root")
    prep = sub.add_parser("prepare", help="write the workspace, seed the memo store, index OpenClaw's memory")
    prep.add_argument("--fixture", type=Path, required=True)
    prep.add_argument("--memo", default=shutil.which("memo"), help="the memo binary the memo agent runs")
    ret = sub.add_parser("retrieval", help="OpenClaw memory search recall, no model")
    ret.add_argument("--fixture", type=Path, required=True)
    ret.add_argument("--output", type=Path, required=True)
    ans = sub.add_parser("answer", help="ask the questions through one OpenClaw agent")
    ans.add_argument("--fixture", type=Path, required=True)
    ans.add_argument("--output", type=Path, required=True)
    ans.add_argument("--agent", choices=sorted(AGENTS), required=True)
    ans.add_argument("--model", required=True, help="the same model as the other configurations, e.g. openai/<id>")
    ans.add_argument("--thinking", help="thinking level, recorded")
    ans.add_argument("--only", help="comma-separated question ids; the rest are written as unknown")
    ans.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    root = args.root.resolve()
    if args.command == "install":
        install(root)
    elif args.command == "prepare":
        prepare(root, args.fixture.resolve(), args.memo)
    elif args.command == "retrieval":
        retrieval(root, args.fixture.resolve(), args.output.resolve())
    else:
        only = set(args.only.split(",")) if args.only else None
        answer(root, args.fixture.resolve(), args.output.resolve(), args.agent, args.model, args.thinking, only,
               args.timeout)


if __name__ == "__main__":
    main()
