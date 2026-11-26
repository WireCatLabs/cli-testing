#!/usr/bin/env python3
"""LoCoMo through Claude Code (`claude -p`, the owner's subscription) with each memory attached as its MCP server,
or files / memo through Bash. Clean session: safe mode, no slash commands, only the MCP config given here."""

import argparse
import json
import os
import shutil
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path

from hermes_locomo import FIXTURES, ORACLE_MARKERS, PROMPT, ROOT, sessions_cited
from hermes_runner import parse
from provider_retrieval import keyring_secret

BENCH = ROOT / "bench/claude"
WHERE = {
    "files": "The chat is in text files in ./corpus, one session per file (r0001.md is session 1, r0002.md "
             "session 2 and so on); each file starts with the session's date.",
    "wirecat": "The chat is in memo: use the `memo` command in Bash (`memo skill show` prints its guide). Each note "
               "is one session; its first line names the session number and date.",
    "supermemory": "The chat is in your Supermemory memory, space `{store}`; search it with the Supermemory tools.",
    "mem0": "The chat is in your Mem0 memory, user id `{store}`; search it with the Mem0 tools.",
    "hindsight": "The chat is in your Hindsight memory; recall from it with the Hindsight tools.",
    "honcho": "The chat is in your Honcho memory; search it with the Honcho tools.",
    # Control arm: no memory and no tools, to see what the model already knows about LoCoMo.
    "none": "You have no access to the chat; answer only if you already know, else \"unknown\".",
}
# --safe-mode also turns MCP servers off (claude 2.1.330 help), so isolation is --setting-sources "" plus
# --strict-mcp-config; the init event of every question is recorded to show what was loaded.
WRITES = {
    # Names from Mem0's MCP docs, not yet checked against a live init event (quota); unknown names deny nothing.
    "mem0": ["add_memory", "update_memory", "delete_memory", "delete_all_memories", "delete_entities"],
    "hindsight": ["cancel_operation", "clear_memories", "clear_mental_model", "create_directive",
                        "create_mental_model", "create_page", "create_page_folder", "delete_bank", "delete_directive",
                        "delete_document", "delete_mental_model", "delete_page_node", "invalidate_memory",
                        "refresh_mental_model", "retain", "sync_retain", "update_bank", "update_memory",
                        "update_mental_model", "update_page_node"],
          # The live tool list (init event, 2026-11-23) has no add_memory / forget_memory; these are its writes.
          "supermemory": ["guided-save", "upload-file", "select-space", "add_memory", "forget_memory"],
          "honcho": ["add_messages_to_session", "add_peers_to_session", "add_sessions_to_scope", "create_conclusions",
                     "create_peer", "create_scope", "create_session", "create_workspace", "delete_conclusion",
                     "delete_session", "remove_peers_from_session", "remove_session_from_scope", "schedule_dream",
                     "set_metadata", "set_peer_card", "clone_session"]}
TOOLS = {"mem0": "", "none": "", "files": "Bash,Read", "wirecat": "Bash,Read", "supermemory": "", "hindsight": "", "honcho": ""}


def mcp_config(setup, store):
    if setup == "hindsight":
        return {"mcpServers": {"hindsight": {"type": "http", "url": f"http://127.0.0.1:18888/mcp/{store}/"}}}
    if setup == "supermemory":
        return {"mcpServers": {"supermemory": {"type": "http", "url": "https://mcp.supermemory.ai/mcp",
                                               "headers": {"Authorization": "Bearer ${SUPERMEMORY_API_KEY}"}}}}
    if setup == "mem0":
        # docs/platform/mem0-mcp.mdx: hosted MCP, API key as bearer for headless clients. Not run yet (quota).
        return {"mcpServers": {"mem0": {"type": "http", "url": "https://mcp.mem0.ai/mcp",
                                        "headers": {"Authorization": "Bearer ${MEM0_API_KEY}"}}}}
    if setup == "honcho":
        # Honcho's own MCP package, stdio, against the local server; it needs any non-empty key when auth is off.
        return {"mcpServers": {"honcho": {"command": str(Path.home() / ".bun/bin/bun"),
                                          "args": ["--cwd", str(ROOT / "honcho-src/mcp"), "src/stdio.ts"],
                                          "env": {"HONCHO_API_KEY": "local", "HONCHO_API_URL": "http://127.0.0.1:18000",
                                                  "HONCHO_WORKSPACE_ID": store}}}}
    return {"mcpServers": {}}


def workspace(setup, conv):
    place = BENCH / setup / conv
    place.mkdir(parents=True, exist_ok=True)
    if setup == "files" and not (place / "corpus").exists():
        shutil.copytree(ROOT / "bench/hermes/alone" / conv / "workspace/corpus", place / "corpus")
    return place


def ask(args, q, stores, raw):
    conv = q["conversation"]
    manifest = json.loads((FIXTURES / conv / "manifest.json").read_text())
    store = stores.get(conv)
    place = workspace(args.setup, conv)
    config = raw / f"{q['id']}.mcp.json"
    config.write_text(json.dumps(mcp_config(args.setup, store)) + "\n")
    system = raw / "system.txt"
    system.write_text("You answer questions about a chat from the records you are given. Use only your tools.\n")
    prompt = PROMPT.format(a=manifest["speakers"]["a"], b=manifest["speakers"]["b"],
                           where=WHERE[args.setup].format(store=store), question=q["question"])
    # An allowlist: Bash runs with bypassPermissions, so no API key of the parent may reach the agent.
    env = {k: os.environ[k] for k in ("HOME", "PATH", "LANG", "TERM", "USER", "XDG_RUNTIME_DIR",
                                      "CLAUDE_CONFIG_DIR") if k in os.environ}
    env["DBUS_SESSION_BUS_ADDRESS"] = "disabled:"
    if args.setup == "wirecat":
        env["PATH"] = f"{ROOT / 'bench/hermes/wirecat' / conv / 'bin'}:{env['PATH']}"
    if args.setup == "supermemory":
        env["SUPERMEMORY_API_KEY"] = keyring_secret("supermemory")
    if args.setup == "mem0":
        env["MEM0_API_KEY"] = keyring_secret("mem0")
    denied = [f"mcp__{args.setup}__{name}" for name in WRITES.get(args.setup, [])]
    command = ["claude", "-p", prompt, "--model", args.model, "--tools", TOOLS[args.setup],
               "--disable-slash-commands", "--strict-mcp-config", "--mcp-config", str(config),
               "--system-prompt-file", str(system), "--output-format", "stream-json", "--verbose",
               "--no-session-persistence", "--permission-mode", "bypassPermissions", "--setting-sources", "", *(["--disallowedTools", *denied] if denied else [])]
    started = time.perf_counter()
    done = subprocess.run(command, env=env, cwd=place, capture_output=True, text=True, timeout=args.timeout)
    seconds = time.perf_counter() - started
    (raw / f"{q['id']}.stream.jsonl").write_text(done.stdout)
    (raw / f"{q['id']}.stderr.txt").write_text(done.stderr)
    events = [json.loads(line) for line in done.stdout.splitlines() if line.startswith("{")]
    init = next((e for e in events if e.get("type") == "system" and e.get("subtype") == "init"), {})
    result = next((e for e in reversed(events) if e.get("type") == "result"), {})
    calls = [{"name": block.get("name"), "input": json.dumps(block.get("input"))[:300]}
             for e in events if e.get("type") == "assistant"
             for block in e.get("message", {}).get("content", []) if block.get("type") == "tool_use"]
    reply = parse(result.get("result", ""))
    return {"id": q["id"], "conversation": conv, "category": q["category_name"], "question": q["question"],
            "gold": q["answer"], "answer": (reply or {}).get("answer", ""), "sessions_cited": sessions_cited(reply),
            "seconds": round(seconds, 1), "exit": done.returncode,
            "init": {"tools": init.get("tools"), "mcp_servers": init.get("mcp_servers"), "model": init.get("model"),
                     "skills": init.get("skills"), "plugins": init.get("plugins")},
            "usage": result.get("usage"), "cost_usd_list_price": result.get("total_cost_usd"),
            "tool_calls": calls, "oracle_seen": any(m in done.stdout for m in ORACLE_MARKERS)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--setup", choices=list(WHERE), required=True)
    parser.add_argument("--questions", required=True)
    parser.add_argument("--stores", help='JSON {"conv-26": "<tag or bank>"}')
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", default="sonnet")
    parser.add_argument("--timeout", type=int, default=600)
    args = parser.parse_args()
    questions = {q["id"]: q for q in json.loads((ROOT / "questions.json").read_text())["questions"]}
    stores = json.loads(args.stores) if args.stores else {}
    args.output.mkdir(parents=True, exist_ok=False)
    raw = args.output / "raw"
    raw.mkdir()
    rows = []
    for qid in args.questions.split(","):
        rows.append(ask(args, questions[qid], stores, raw))
        row = rows[-1]
        print(f"{qid} {row['seconds']}s exit={row['exit']} answer={row['answer']!r} "
              f"tools={[c['name'] for c in row['tool_calls']]}", flush=True)
        (args.output / "answers.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n")
    meta = {"agent": "claude-code", "version": subprocess.run(["claude", "--version"], capture_output=True,
                                                              text=True).stdout.strip(),
            "setup": args.setup, "model": args.model, "stores": stores,
            "date": datetime.now(UTC).isoformat(timespec="seconds")}
    (args.output / "run.json").write_text(json.dumps(meta, indent=2) + "\n")


if __name__ == "__main__":
    main()
