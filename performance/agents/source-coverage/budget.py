"""Runs `claude` with the arguments given and stops it at a wall-time or tool-call budget.

Usage: budget.py <claude arguments…>   (ASK_RUNNER for ask.sh). BUDGET_SECONDS (60) and BUDGET_CALLS (10).
The stream-json lines pass through to stdout. A session stopped by the budget ends with one
{"type":"result","subtype":"budget","result":"out of budget: …"} line, so ask.sh reads it like any answer.
"""
import json
import os
import subprocess
import sys
import threading
import time

seconds = float(os.environ.get("BUDGET_SECONDS", "60"))
calls_allowed = int(os.environ.get("BUDGET_CALLS", "10"))
child = subprocess.Popen(["claude", *sys.argv[1:]], stdout=subprocess.PIPE, text=True)
started = time.monotonic()
stopped = None


def stop(why):
    global stopped
    if stopped is None and child.poll() is None:
        stopped = why
        child.terminate()


timer = threading.Timer(seconds, stop, args=[f"{seconds:g} seconds"])
timer.start()
calls = 0
for line in child.stdout:
    if stopped:
        break
    try:
        event = json.loads(line)
    except ValueError:
        event = {}
    if event.get("type") == "assistant":
        calls += sum(1 for part in event["message"].get("content", []) if part.get("type") == "tool_use")
        if calls > calls_allowed:
            stop(f"{calls_allowed} tool calls")
            break
    sys.stdout.write(line)
    sys.stdout.flush()
timer.cancel()
child.wait()
if stopped:
    print(json.dumps({"type": "result", "subtype": "budget", "result": f"out of budget: {stopped}",
                      "duration_ms": int((time.monotonic() - started) * 1000), "tool_calls": calls}), flush=True)
