#!/usr/bin/env python3
"""Run the knowledge-graph-memory questions through OpenClaw, alone and with WireCat Memo, in a throwaway home."""

import argparse
import hashlib
import json
import os
import re
import shlex
import shutil
import signal
import statistics
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

from memo_baseline import Memo, embed, isolated_env, load_mail, name_of, or_query, percentile, write_sources

OPENCLAW_VERSION = "2026.10.9"
NODE_VERSION = "v24.22.2"
NODE_SHA256 = "48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75"
LLAMA_PLUGIN = "@openclaw/llama-cpp-provider"
AGENTS = {"files": "ws-files", "memo": "ws-memo"}
# The memory slot is exclusive per OpenClaw home, so each plugin gets a home of its own. Its agent is `main`:
# openclaw-mem0 searches `<userId>:agent:<id>` for any other agent id, an empty store here.
PLUGINS = {
    "supermemory": {"spec": "npm:@supermemory/openclaw-supermemory@2.1.19", "id": "openclaw-supermemory",
                    "key_env": "SUPERMEMORY_OPENCLAW_API_KEY", "store_key": "containerTag",
                    "config": {"autoRecall": False, "autoCapture": False, "showMemoryUsage": False,
                               "enableCustomContainerTags": False},
                    "writes": ["supermemory-save", "supermemory_store", "supermemory-forget", "supermemory_forget"]},
    "mem0": {"spec": "npm:@mem0/openclaw-mem0@1.2.1", "id": "openclaw-mem0", "key_env": "MEM0_API_KEY",
             "store_key": "userId", "config": {"mode": "platform", "autoRecall": False, "autoCapture": False},
             "writes": ["memory_add", "memory_update", "memory_delete"]},
    # Servers on this machine (honcho-server.sh, hindsight-server.sh), built by wcatbench; they take no key.
    "honcho": {"spec": "npm:@honcho-ai/openclaw-honcho@1.7.0", "id": "openclaw-honcho", "key_env": None,
               "store_key": "workspaceId", "config": {"baseUrl": "http://127.0.0.1:18000"}, "writes": []},
    "hindsight": {"spec": "npm:@vectorize-io/hindsight-openclaw@1.2.0", "id": "hindsight-openclaw", "key_env": None,
                  "store_key": "bankId",
                  "config": {"hindsightApiUrl": "http://127.0.0.1:18888", "dynamicBankId": False,
                             "autoRecall": False, "autoRetain": False},
                  "writes": ["hindsight_retain", "hindsight_create_knowledge_folder", "hindsight_create_knowledge_page",
                             "hindsight_update_knowledge_node", "hindsight_delete_knowledge_node"]},
}
# Like Hermes + Supermemory and + Mem0, which had only the memory toolset: no shell or files to reach ws-files.
DENIED_GROUPS = {"group:fs": ["read", "write", "edit", "apply_patch"],
                 "group:runtime": ["exec", "process", "code_execution", "bash"],
                 "group:web": ["web_search", "x_search", "web_fetch"],
                 "group:ui": ["browser", "screen", "terminal", "canvas"],
                 "group:sessions": ["sessions_spawn", "sessions_send", "subagents"],
                 "group:automation": ["cron", "gateway"], "group:nodes": ["nodes", "computer"],
                 "ls": ["ls"], "view_image": ["view_image"]}
SETUPS = [*AGENTS, *PLUGINS]
WHERE = {
    "files": "The records are Markdown files in your memory folder (memory/{first}.md ... memory/{last}.md); "
             "use your memory search, and read the files when you need to.",
    "memo": "The records are stored in WireCat Memo (notes and mail). Search them with the `memo` command; "
            "the cli-memo skill describes it.",
    "supermemory": "The records are stored in your Supermemory memory. Search it with your Supermemory search tool.",
    "mem0": "The records are stored in your Mem0 memory. Search it with your memory_search tool.",
    "honcho": "The records are stored in your Honcho memory of the owner. Search it with your Honcho tools.",
    "hindsight": "The records are stored in your Hindsight memory. Recall from it with your Hindsight tools.",
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


def plugin_paths(root, plugin):
    base = root / "plugins" / plugin
    return {"base": base, "home": base / "home", "tmp": base / "tmp", "logs": base / "logs", "ws": base / "ws"}


def openclaw_env(root, with_memo=False, plugin=None):
    p = paths(root) if plugin is None else plugin_paths(root, plugin)
    path = [str(paths(root)["node"] / "bin"), "/usr/bin", "/bin"]
    if with_memo:
        path.insert(0, str(p["bin"]))
    # OPENCLAW_HOME moves ~/.openclaw; HOME moves ~/.agents/skills and anything else read from the home folder.
    # Both plugins call os.homedir() directly, so only HOME keeps their writes out of the owner's ~/.openclaw.
    env = {"HOME": str(p["home"]), "OPENCLAW_HOME": str(p["home"]), "TMPDIR": str(p["tmp"]),
           "PATH": ":".join(path), "TERM": "dumb", "NO_COLOR": "1", "TZ": "UTC",
           "OPENCLAW_NO_AUTO_UPDATE": "1", "DBUS_SESSION_BUS_ADDRESS": "disabled:"}
    if plugin == "mem0":
        env["MEM0_TELEMETRY"] = "false"
    return env


def openclaw(root, *args, with_memo=False, plugin=None, check=True, cwd=None, timeout=None):
    done = subprocess.run([str(paths(root)["openclaw"]), *args], env=openclaw_env(root, with_memo, plugin),
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


def config_path(root, plugin=None):
    return (paths(root) if plugin is None else plugin_paths(root, plugin))["home"] / ".openclaw/openclaw.json"


def key_file(root, plugin):
    """Written by openclaw-memory-keys.sh; OpenClaw loads it and fills ${KEY} in the plugin config from it."""
    return plugin_paths(root, plugin)["home"] / ".openclaw/.env"


def configure_plugin(root, plugin, store, model=None):
    spec = PLUGINS[plugin]
    path = config_path(root, plugin)
    config = json.loads(path.read_text())
    plugins = config.setdefault("plugins", {})
    plugins.setdefault("slots", {})["memory"] = spec["id"]
    entry = plugins.setdefault("entries", {}).setdefault(spec["id"], {})
    entry["enabled"] = True
    # Listed as disabled, memory-core still registers its memory_search and memory_get, which take the names first;
    # the plugin's own tools are then dropped as a "plugin tool name conflict" (10K pilot, 6 November 2026).
    plugins["entries"]["memory-core"] = {"enabled": False}
    # Without allowConversationAccess OpenClaw never runs a plugin's recall or capture hooks, whatever its flags say.
    entry.pop("hooks", None)
    key = {"apiKey": f"${{{spec['key_env']}}}"} if spec["key_env"] else {}
    entry["config"] = {**entry.get("config", {}), **spec["config"], **key, spec["store_key"]: store}
    agents = config.setdefault("agents", {})
    defaults = agents.setdefault("defaults", {})
    # A pre-compaction flush turn could let the plugin write memory.
    defaults.setdefault("compaction", {})["memoryFlush"] = {"enabled": False}
    agents["entries"] = {"main": {"workspace": str(plugin_paths(root, plugin)["ws"]),
                                  "tools": {"deny": [*DENIED_GROUPS, *spec["writes"]]}}}
    # Unset, Code Mode turns itself on for Claude Sonnet 5.5 and wraps the memory tools in a JavaScript tool named
    # `exec`, which the trust check cannot tell from a shell (10K pilot, 6 November 2026). Off: the tools are direct.
    # Unset, Tool Search also hides the schemas behind `tool_search` and `tool_call`, and the 10K OpenClaw + Mem0 run
    # asked for `memory_search` where the plugin's tool is `openclaw:openclaw-mem0:memory_search`: "Tool memory_search
    # not found" on every question. Direct schemas, as Hermes gives its memory tools.
    config["tools"] = {**config.get("tools", {}), "codeMode": False, "toolSearch": False}
    if model:
        defaults["model"] = {"primary": model}
        defaults.setdefault("models", {})[model] = {"agentRuntime": {"id": "openclaw"}}
    path.write_text(json.dumps(config, indent=2) + "\n")


def install_plugin(root, plugin, store, corpus_sha256, subset=None):
    """A home of its own for one memory plugin, pointed at a store that was already ingested; nothing is written."""
    spec, place = PLUGINS[plugin], plugin_paths(root, plugin)
    for key in ("home", "tmp", "logs"):
        place[key].mkdir(parents=True, exist_ok=True)
    # An existing workspace skips the BOOTSTRAP.md ritual, as for the other agents.
    (place["ws"] / "memory").mkdir(parents=True, exist_ok=True)
    if not config_path(root, plugin).exists():
        config_path(root, plugin).parent.mkdir(parents=True, exist_ok=True)
        config_path(root, plugin).write_text(json.dumps({"logging": {"file": str(place["logs"] / "openclaw.log")}})
                                             + "\n")
    # Consent reviewed in both manifests (5 Nov 2026): the memory slot, the listed tools, one skill, one CLI command.
    done = openclaw(root, "plugins", "install", spec["spec"], "--pin", "--force", "--accept-capabilities",
                    plugin=plugin, check=False, timeout=900)
    (place["logs"] / "plugins-install.txt").write_text(done.stdout + done.stderr)
    if done.returncode != 0:
        raise RuntimeError(f"plugins install {spec['spec']} exited {done.returncode}: {done.stderr.strip()[-800:]}")
    configure_plugin(root, plugin, store)
    (place["base"] / "store.json").write_text(json.dumps({"plugin": plugin, spec["store_key"]: store,
                                                          "corpus_sha256": corpus_sha256, "subset": subset}) + "\n")
    inspect = openclaw(root, "plugins", "inspect", spec["id"], "--runtime", "--json", plugin=plugin, check=False,
                       timeout=600)
    (place["logs"] / "plugins-inspect.json").write_text(inspect.stdout + inspect.stderr)
    keyed = "no key needed" if not spec["key_env"] else (
        "key file present" if key_file(root, plugin).exists() else "key file missing: run openclaw-memory-keys.sh")
    print(f"{plugin}: installed {spec['spec']} into {place['home']}; store {store}; {keyed}")


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
    memory.mkdir(parents=True, exist_ok=True)
    for index, record in enumerate(records):
        path = memory / f"{name_of(index)}.md"
        path.write_text(record_file(record))
        stamp = datetime.fromisoformat(record["timestamp"]).timestamp()
        os.utime(path, (stamp, stamp))
    # An existing workspace skips OpenClaw's first-run BOOTSTRAP.md ritual, so both agents start the same way.
    (root / AGENTS["memo"] / "memory").mkdir(parents=True, exist_ok=True)


def write_memo_wrapper(root, memo_binary):
    """`memo` on the agent's PATH runs the real CLI in the throwaway store, with D-Bus off for memo alone."""
    env = isolated_env(paths(root)["memo"])
    # memo's launcher is `#!/usr/bin/env node`; a memo installed outside node's own bin folder needs node beside it.
    node_bin = Path(shutil.which("node") or "/usr/bin/node").parent
    env["PATH"] = f"{Path(memo_binary).parent}:{node_bin}:/usr/bin:/bin"
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
        folder, _ = memo.json("folders", "add", str(memo_root / "data/notes"), "--format", "markdown")
        timings["memo_sync_notes_s"] = memo.json("sync", "--only", "notes", "--no-embed")[1]
        timings["memo_sync_mail_s"] = load_mail(memo, memo_root / "data")[1]
        # The same local model as the Hermes + WireCat store, so both WireCat setups search by meaning.
        memo.json("models", "download", "e5-small")
        timings["memo_embed_s"] = embed(memo, folder["item"]["id"])[1]
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
    match = re.search(r"(r\d{4,})\.md", json.dumps(hit))
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
        match = re.search(r"r\d{4,}", str(cite))
        refs.append(names.get(match.group(0), f"unmapped:{cite}") if match else f"unmapped:{cite}")
    if answer.casefold() == "unknown":
        refs = []
    return answer, sorted(set(refs)), None


def final_text(envelope):
    """`agent --json` returns `{payloads, meta}`; this mirrors how `agent exec` builds its `final` field."""
    payloads = [p for p in envelope.get("payloads") or [] if isinstance(p, dict)]
    text = "\n".join(p.get("text") or "" for p in payloads if not p.get("isError") and not p.get("isReasoning"))
    return text.strip() or (envelope.get("meta", {}).get("finalAssistantVisibleText") or "").strip()


def stop_leftover_servers(root):
    """A killed OpenClaw can orphan the llama-server it started; stop only ours, by PID."""
    stopped = []
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():
            continue
        try:
            command = (proc / "cmdline").read_bytes().split(b"\0")[0].decode()
        except OSError:
            continue
        if command.startswith(str(paths(root)["home"])) and command.endswith("/llama-server"):
            os.kill(int(proc.name), signal.SIGTERM)
            stopped.append(int(proc.name))
    return stopped


def workspace(root, agent):
    return plugin_paths(root, agent)["ws"] if agent in PLUGINS else root / AGENTS[agent]


def audit(root, agent):
    """Did the agent reach for the answer key, and did OpenClaw write memory of its own during the run?"""
    if agent in PLUGINS:
        store = plugin_paths(root, agent)["home"] / ".openclaw/agents/main/agent"
    else:
        store = paths(root)["home"] / f".openclaw/agents/{agent}/agent"
    blob = b"".join(path.read_bytes() for path in store.glob("openclaw-agent.sqlite*") if path.is_file())
    memory = workspace(root, agent) / "memory"
    # The files agent reads its own workspace, so only the others are asked whether they reached ws-files.
    words = ("oracle", "run.py", "fixture", "knowledge-graph-memory", *(("ws-files",) if agent != "files" else ()))
    return {"transcript_mentions": {word: blob.count(word.encode()) for word in words},
            "memory_files": len(list(memory.glob("*.md"))),
            "memory_md_exists": (workspace(root, agent) / "MEMORY.md").exists()}


def key_outside_env_file(root, plugin):
    """True if the plugin key was copied anywhere in the throwaway home besides the .env file. Never prints it."""
    if not key_file(root, plugin).exists():
        return []
    keys = [line.split("=", 1)[1].strip().encode() for line in key_file(root, plugin).read_text().splitlines()
            if "=" in line and line.split("=", 1)[1].strip()]
    found = []
    for path in plugin_paths(root, plugin)["home"].rglob("*"):
        if path.is_file() and path != key_file(root, plugin) and not path.is_symlink():
            data = path.read_bytes()
            if any(key in data for key in keys):
                found.append(str(path.relative_to(plugin_paths(root, plugin)["home"])))
    return found


def denied_tools_used(rows):
    denied = {tool for tools in DENIED_GROUPS.values() for tool in tools}
    denied |= {tool for spec in PLUGINS.values() for tool in spec["writes"]}
    return sorted({tool for row in rows for tool in (row["tools"] or []) if tool in denied})


def where(agent, records):
    return WHERE[agent].format(first=name_of(0), last=name_of(records - 1))


def ask(root, agent, query, run_id, model, thinking, timeout, raw, records):
    prompt = PROMPT.format(where=where(agent, records), as_of=query["as_of"], question=query["question"])
    agent_id = "main" if agent in PLUGINS else agent
    args = ["agent", "--local", "--agent", agent_id, "--session-id", f"kg-{agent}-{run_id}-{query['id']}",
            "--message", prompt, "--model", model, "--json", "--timeout", str(timeout)]
    if thinking:
        args += ["--thinking", thinking]
    started = time.perf_counter()
    # Its own process group: the openclaw launcher re-execs a child, which a plain kill would leave running.
    plugin = agent if agent in PLUGINS else None
    process = subprocess.Popen([str(paths(root)["openclaw"]), *args],
                               env=openclaw_env(root, agent == "memo", plugin),
                               cwd=workspace(root, agent), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                               start_new_session=True)
    try:
        stdout, stderr = process.communicate(timeout=timeout + 120)
        exit_code = process.returncode
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGTERM)
        stdout, stderr = process.communicate()
        exit_code = "timeout"
    seconds = time.perf_counter() - started
    (raw / f"{query['id']}.stdout.json").write_text(stdout)
    (raw / f"{query['id']}.stderr.txt").write_text(stderr)
    # A shadowed memory tool still answers, with an empty search: two paid 50-question runs came back "unknown".
    if "plugin tool name conflict" in stderr:
        raise RuntimeError(f"{query['id']}: a core tool hides a plugin tool, see {raw / query['id']}.stderr.txt")
    try:
        envelope = json.loads(stdout)
    except json.JSONDecodeError:
        envelope = {}
    return exit_code, seconds, envelope


def answer(root, fixture, output, agent, model, thinking, only, timeout):
    output.mkdir(parents=True, exist_ok=False)
    raw = output / "raw"
    raw.mkdir()
    records = sum(1 for _ in (fixture / "corpus.jsonl").open())
    names = {name_of(index): json.loads(line)["id"] for index, line in enumerate((fixture / "corpus.jsonl").open())}
    store = None
    if agent in PLUGINS:
        store = json.loads((plugin_paths(root, agent)["base"] / "store.json").read_text())
        corpus = hashlib.sha256((fixture / "corpus.jsonl").read_bytes()).hexdigest()
        if corpus != store["corpus_sha256"]:
            raise SystemExit(f"{agent}: the store holds corpus {store['corpus_sha256'][:12]}, the fixture is "
                             f"{corpus[:12]}; ingest this fixture and install-plugin with its --store first")
        if PLUGINS[agent]["key_env"] and not key_file(root, agent).exists():
            raise SystemExit(f"{agent}: no key file; the owner runs openclaw-memory-keys.sh {agent} once")
        configure_plugin(root, agent, store[PLUGINS[agent]["store_key"]], model)
    else:
        configure_agents(root, model)
        # The workspace was written from the prepared corpus, so its names stay the reference.
        names = json.loads((root / "names.json").read_text())
    queries = json.loads((fixture / "queries.json").read_text())
    selected = [q for q in queries if not only or q["id"] in only]
    run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%S")
    rows = []
    for query in selected:
        exit_code, seconds, envelope = ask(root, agent, query, run_id, model, thinking, timeout, raw, records)
        text = final_text(envelope)
        value, refs, problem = normalize(parse_reply(text), names)
        meta = envelope.get("meta") or {}
        agent_meta = meta.get("agentMeta") or {}
        tool_summary = meta.get("toolSummary") or {}
        rows.append({"id": query["id"], "exit": exit_code, "seconds": round(seconds, 2), "answer": value,
                     "citations": refs, "problem": problem, "final_text": text, "usage": agent_meta.get("usage"),
                     "list_price_usd_estimate": agent_meta.get("costUsd"), "tools": tool_summary.get("tools"),
                     "tool_calls": tool_summary.get("calls"), "model": agent_meta.get("model"),
                     "provider": agent_meta.get("provider"), "error": envelope.get("error")})
        # Written after every question, so a crash or a hung run keeps what was answered.
        answered = {row["id"]: {"id": row["id"], "answer": row["answer"], "citations": row["citations"]}
                    for row in rows}
        padded = [answered.get(q["id"], {"id": q["id"], "answer": "unknown", "citations": []}) for q in queries]
        (output / "predictions.json").write_text(json.dumps(padded, ensure_ascii=False, indent=2) + "\n")
        (output / "per-question.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
        print(f"{query['id']} exit={exit_code} {seconds:.1f}s answer={value!r} citations={len(refs)}",
              file=sys.stderr)
    meta = {"openclaw": openclaw(root, "--version").stdout.strip(), "agent": agent, "model": model,
            "thinking": thinking, "runtime_requested": "openclaw", "questions_run": len(selected),
            "questions_padded_unknown": len(queries) - len(selected), "prompt": PROMPT,
            "where": where(agent, records), "store": store, "after_run": audit(root, agent),
            "leftover_llama_servers_stopped": stop_leftover_servers(root)}
    if agent in PLUGINS:
        meta["plugin"] = PLUGINS[agent]["spec"]
        meta["denied_tools_used"] = denied_tools_used(rows)
        meta["key_copied_to"] = key_outside_env_file(root, agent)
    (output / "run.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(meta | {"prompt": "(in run.json)"}, indent=2))
    if meta.get("denied_tools_used") or meta.get("key_copied_to"):
        raise SystemExit("run not trusted: a denied tool ran or the key was copied; see run.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.home() / ".cache/wirecat-bench/openclaw",
                        help="throwaway folder holding Node, OpenClaw, its home and both workspaces")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("install", help="Node, OpenClaw and the llama.cpp plugin under --root")
    plug = sub.add_parser("install-plugin", help="a home of its own with one memory plugin, on an ingested store")
    plug.add_argument("--plugin", choices=sorted(PLUGINS), required=True)
    plug.add_argument("--store", required=True, help="Supermemory container tag or Mem0 user id of the ingest")
    plug.add_argument("--fixture", type=Path, required=True, help="the fixture that store was ingested from")
    plug.add_argument("--subset", type=Path, help="the subset-mem0.json the store holds, if only a subset")
    prep = sub.add_parser("prepare", help="write the workspace, seed the memo store, index OpenClaw's memory")
    prep.add_argument("--fixture", type=Path, required=True)
    prep.add_argument("--memo", default=shutil.which("memo"), help="the memo binary the memo agent runs")
    ret = sub.add_parser("retrieval", help="OpenClaw memory search recall, no model")
    ret.add_argument("--fixture", type=Path, required=True)
    ret.add_argument("--output", type=Path, required=True)
    ans = sub.add_parser("answer", help="ask the questions through one OpenClaw agent")
    ans.add_argument("--fixture", type=Path, required=True)
    ans.add_argument("--output", type=Path, required=True)
    ans.add_argument("--agent", choices=SETUPS, required=True)
    ans.add_argument("--model", required=True, help="the same model as the other configurations, e.g. openai/<id>")
    ans.add_argument("--thinking", help="thinking level, recorded")
    ans.add_argument("--only", help="comma-separated question ids; the rest are written as unknown")
    ans.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    root = args.root.resolve()
    if args.command == "install":
        install(root)
    elif args.command == "install-plugin":
        subset = json.loads(args.subset.read_text()) if args.subset else None
        install_plugin(root, args.plugin, args.store,
                       hashlib.sha256((args.fixture / "corpus.jsonl").read_bytes()).hexdigest(),
                       {key: subset[key] for key in ("records", "sha256")} if subset else None)
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
