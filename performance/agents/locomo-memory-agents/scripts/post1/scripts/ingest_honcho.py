"""LoCoMo into a local Honcho: one workspace per conversation, the two speakers as peers, one Honcho session per
LoCoMo session, one message per turn dated to its session. Waits until the deriver queue is empty."""
import json
import re
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

BASE = "http://127.0.0.1:18000"
SOURCE = Path("/var/tmp/locomo-bench/locomo-src/locomo10.json")
OUT = Path("/var/tmp/locomo-bench/runs/ingest")
SERVER = "/var/tmp/locomo-bench/scripts/honcho-server.sh"


def call(method, path, body=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as reply:
        return json.load(reply)


def peer_id(name):
    return name.lower()


def main(conv_id):
    sample = next(s for s in json.loads(SOURCE.read_text()) if s["sample_id"] == conv_id)
    conv = sample["conversation"]
    workspace = f"wcat-p1-{conv_id}"
    w = f"/v3/workspaces/{workspace}"
    call("POST", "/v3/workspaces", {"id": workspace})
    peers = [peer_id(conv["speaker_a"]), peer_id(conv["speaker_b"])]
    for peer in peers:
        call("POST", w + "/peers", {"id": peer})
    started = time.time()
    numbers = sorted(int(m.group(1)) for k in conv if (m := re.fullmatch(r"session_(\d+)", k)))
    sent = 0
    for number in numbers:
        when = datetime.strptime(conv[f"session_{number}_date_time"].strip(), "%I:%M %p on %d %B, %Y")
        session = f"s{number:02}"
        call("POST", w + "/sessions", {"id": session, "peers": {peer: {} for peer in peers}})
        messages = []
        for index, turn in enumerate(conv[f"session_{number}"]):
            text = turn["text"] + (f" [shares a photo: {turn['blip_caption']}]" if turn.get("blip_caption") else "")
            messages.append({"peer_id": peer_id(turn["speaker"]), "content": text,
                             "created_at": (when + timedelta(seconds=index)).isoformat() + "Z",
                             "metadata": {"rid": f"r{number:04}", "session": number}})
        for start in range(0, len(messages), 100):
            call("POST", w + f"/sessions/{session}/messages", {"messages": messages[start:start + 100]})
        sent += len(messages)
    submitted = time.time() - started
    # Honcho dates a peer's session membership to the import; search "from a peer's perspective" then hides the
    # history (seen in the previous round). Both speakers took part in every session.
    subprocess.run([SERVER, "backdate", workspace], check=True, capture_output=True)
    while True:
        queue = call("GET", w + "/queue/status")
        pending = queue.get("pending_work_units", 0) + queue.get("in_progress_work_units", 0)
        if not pending:
            break
        print(f"{conv_id} {time.time() - started:.0f}s queue {json.dumps(queue)[:200]}", flush=True)
        time.sleep(20)
    result = {"conversation": conv_id, "workspace": workspace, "peers": peers, "messages": sent,
              "submit_s": round(submitted, 1), "until_derived_s": round(time.time() - started, 1), "queue": queue}
    (OUT / f"honcho-{conv_id}.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    for conversation in sys.argv[1:]:
        main(conversation)
