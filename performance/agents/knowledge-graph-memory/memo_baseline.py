#!/usr/bin/env python3
"""Seed a disposable Memo store with the synthetic corpus through public CLI commands and score retrieval only."""

import argparse
import json
import os
import platform
import re
import statistics
import subprocess
import time
from datetime import UTC, datetime
from pathlib import Path

# Generic English function words, fixed before any run; the OR row must not be tuned on the answer key.
STOP_WORDS = set("""a an and are as at be before by did do does for from had has have how in is it of on or
the this to was were what when where which who whom why will with""".split())


def isolated_env(root):
    home = root / "home"
    return {
        "PATH": os.environ["PATH"],
        "HOME": str(home),
        "XDG_CONFIG_HOME": str(home / ".config"),
        "XDG_STATE_HOME": str(home / ".local/state"),
        "XDG_DATA_HOME": str(home / ".local/share"),
        "XDG_CACHE_HOME": str(home / ".cache"),
        "MEMO_CONFIG_DIR": str(root / "memo-config"),
        "MEMO_STATE_DIR": str(root / "memo-state"),
        "MEMO_CACHE_DIR": str(root / "memo-cache"),
        "WIRECAT_STATE_DIR": str(root / "wirecat-state"),
        "WIRECAT_CONFIG_DIR": str(root / "wirecat-config"),
        "MEMO_NO_UPDATE_CHECK": "1",
        # memo 0.131.47 stops any command after 30 s; importing a 10K mbox takes longer (7 Nov 2026).
        "MEMO_TIMEOUT": "60m",
        # The keyring is reached over D-Bus even with a throwaway HOME; this run must not see it.
        "DBUS_SESSION_BUS_ADDRESS": "disabled:",
        "TZ": "UTC",
    }


class Memo:
    def __init__(self, binary, root):
        self.binary, self.env = binary, isolated_env(root)

    def run(self, *args):
        started = time.perf_counter()
        done = subprocess.run([self.binary, *args], env=self.env, capture_output=True, text=True, check=False)
        elapsed = time.perf_counter() - started
        if done.returncode != 0:
            raise RuntimeError(f"memo {' '.join(args)} exited {done.returncode}: {done.stderr.strip()[:500]}")
        return done.stdout, elapsed

    def json(self, *args):
        out, elapsed = self.run(*args, "--json")
        return json.loads(out), elapsed


def name_of(index):
    return f"r{index + 1:04}"


SPEAKER = re.compile(r"\b([A-Z][a-z]+ [A-Z][a-z]+):")


def mbox_entry(index, record):
    when = datetime.fromisoformat(record["timestamp"]).astimezone(UTC)
    first = int(re.search(r"/thread-(\d+)/", record["id"]).group(1)) - 1
    reply = f"In-Reply-To: <{name_of(first)}@example.test>\n" if first != index else ""
    # A record reads "Subject. Name: body"; one fixed sender and an id as subject went into every chunk's
    # vector and cost memo 0.2 of recall on reworded questions (BUG-618), which no other engine paid.
    speaker = SPEAKER.search(record["text"])
    sender = speaker.group(1) if speaker else "Team Mail"
    subject = record["text"].split(". ", 1)[0][:120]
    # Takeout's "From <gmail id>@xxx <asctime>" line is what memo's mbox reader requires.
    return (f"From {1_000_000_000_000_000 + index}@xxx {when.strftime('%a %b %d %H:%M:%S +0000 %Y')}\n"
            f"X-GM-THRID: {2_000_000_000_000_000 + first}\n"
            "X-Gmail-Labels: Inbox,Opened\n"
            f"Message-ID: <{name_of(index)}@example.test>\n{reply}"
            f"Date: {when.strftime('%a, %d %b %Y %H:%M:%S +0000')}\n"
            f"From: {sender} <{sender.lower().replace(' ', '.')}@example.test>\n"
            "To: synthetic@example.test\n"
            f"Subject: {subject}\n"
            "Content-Type: text/plain; charset=utf-8\n\n"
            f"{record['text']}\n\n")


def write_sources(records, data):
    notes = data / "notes"
    notes.mkdir(parents=True)
    names, mbox = {}, []
    for index, record in enumerate(records):
        names[name_of(index)] = record["id"]
        if record["kind"] == "mail":
            mbox.append(mbox_entry(index, record))
            continue
        path = notes / f"{name_of(index)}.md"
        path.write_text(record["text"] + "\n")
        stamp = datetime.fromisoformat(record["timestamp"]).timestamp()
        os.utime(path, (stamp, stamp))
    (data / "mail.mbox").write_text("".join(mbox))
    return names


def configure_mail(memo, data):
    config = Path(memo.env["MEMO_CONFIG_DIR"]) / "config.json"
    current = json.loads(config.read_text())
    current["mail"] = {"accounts": [{"name": "synthetic", "address": "synthetic@example.test", "mode": "mbox",
                                     "path": str(data / "mail.mbox")}]}
    config.write_text(json.dumps(current, indent=2) + "\n")


def reads_mbox(memo):
    """memo up to 0.131.24 reads an mbox account itself; from 0.131.28 the mail CLI stores mail and memo searches it."""
    return "--source" in memo.run("sync", "--help")[0]


def load_mail(memo, data, mail_binary="mail"):
    """The mbox into the store without embedding: (the reply's item, seconds)."""
    if reads_mbox(memo):
        configure_mail(memo, data)
        reply, seconds = memo.json("sync", "--source", "email:synthetic", "--since-time", "2000-01-01", "--limit",
                                   "50000", "--no-embed")
        return reply["item"]["mail"], seconds
    # The mail CLI refuses an agent that sets a profile's address, so the run writes its own throwaway config.
    # `messages import` adds a Google Takeout file to a Gmail profile; no sign-in is needed for it.
    config = Path(memo.env["XDG_CONFIG_HOME"]) / "mail-cli/config.json"
    config.parent.mkdir(parents=True, exist_ok=True)
    profile = {"address": "synthetic@example.test", "imap_host": "imap.gmail.com"}
    config.write_text(json.dumps({"profiles": {"synthetic": profile}}, indent=2) + "\n")
    mail = Memo(mail_binary, Path(memo.env["HOME"]).parent)
    # mail 0.18.0 renamed --limit to --max-messages.
    cap = "--max-messages" if "--max-messages" in mail.run("synthetic", "messages", "import", "--help")[0] else "--limit"
    reply, seconds = mail.json("synthetic", "messages", "import", str(data / "mail.mbox"), cap, "50000")
    if not reply["item"]["complete"]:
        raise RuntimeError(f"mail import left {reply['item']['remaining']} emails")
    return reply["item"], seconds


def embed(memo, folder_id):
    """Embed the notes folder and the stored mail: (the last reply's item with the number of runs, seconds).

    One sync embeds at most 600 chunks of notes and 600 of mail and says what is left, so it runs until nothing is.
    """
    if reads_mbox(memo):
        command = ("sync", "--since-time", "2000-01-01", "--limit", "50000", "--source", "email:synthetic", "--folder",
                   folder_id)
    else:
        command = ("sync",)
    seconds = 0.0
    for runs in range(1, 101):
        reply, elapsed = memo.json(*command)
        seconds += elapsed
        parts = [value for value in reply["item"].values() if isinstance(value, dict) and "left" in value]
        if not any(part["left"] for part in parts):
            return {**reply["item"], "sync_runs": runs}, seconds
    raise RuntimeError("memo sync still had chunks to embed after 100 runs")


def or_query(question):
    words = [word for word in re.findall(r"[\w-]+", question.casefold()) if word not in STOP_WORDS]
    return " OR ".join(f'"{word}"' for word in words)


def mail_name(ref):
    # A mail's subject is its own now, so its record comes from the Gmail id mbox_entry gave it.
    found = re.search(r"/(1\d{15})$", ref)
    return name_of(int(found.group(1)) - 1_000_000_000_000_000) if found else ""


def search(memo, names, query, extra, raw_path):
    reply, elapsed = memo.json("search", "all", query, "--limit", "10", *extra)
    raw_path.write_text(json.dumps(reply, ensure_ascii=False, indent=2) + "\n")
    hits = [names.get(item.get("title", "")) or names.get(mail_name(item.get("ref", "")), f"unmapped:{item.get('ref')}")
            for item in reply["items"]]
    return hits, elapsed, reply["meta"].get("complete", True)


def store_bytes(info):
    path = Path(info["path"])
    return sum(file.stat().st_size for file in path.parent.glob(path.name + "*"))


def percentile(values, share):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(share * (len(ordered) - 1)))]


def score_run(label, rows, oracle):
    expected = {row["id"]: set(row["required_citations"]) for row in oracle}
    cited = [row for row in rows if expected[row["id"]]]
    recall = {}
    for k in (1, 5, 10):
        found = [len(expected[row["id"]] & set(row["hits"][:k])) / len(expected[row["id"]]) for row in cited]
        recall[k] = sum(found) / len(found)
    times = [row["seconds"] for row in rows]
    return {"run": label, "questions_scored": len(cited), "recall@1": recall[1], "recall@5": recall[5],
            "recall@10": recall[10], "p50_s": statistics.median(times), "p95_s": percentile(times, 0.95),
            "incomplete_replies": sum(not row["complete"] for row in rows),
            "empty_replies": sum(not row["hits"] for row in rows)}


def query_all(memo, names, queries, label, extra, rewrite, raw):
    folder = raw / label
    folder.mkdir()
    memo.json("search", "all", "warm up", "--limit", "1", *extra)
    rows = []
    for query in queries:
        text = rewrite(query["question"])
        hits, seconds, complete = search(memo, names, text, extra, folder / f"{query['id']}.json")
        rows.append({"id": query["id"], "query": text, "hits": hits, "seconds": seconds, "complete": complete})
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path, required=True, help="a run.py output directory")
    parser.add_argument("--output", type=Path, required=True, help="new directory; existing paths are refused")
    parser.add_argument("--memo", default="memo", help="the memo binary to drive")
    parser.add_argument("--mail", default="mail", help="the mail CLI binary, for memo 0.131.28 and later")
    parser.add_argument("--model", default="e5-small", help="local embedding model for the hybrid run")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    root = args.output.resolve()
    records = [json.loads(line) for line in (args.fixture / "corpus.jsonl").read_text().splitlines()]
    queries = json.loads((args.fixture / "queries.json").read_text())
    memo = Memo(args.memo, root / "memo")
    raw = root / "raw"
    raw.mkdir()

    version, _ = memo.run("--version")
    startup = [memo.run("--version")[1] for _ in range(20)]
    names = write_sources(records, root / "data")
    timings = {}
    folder, timings["folders_add_s"] = memo.json("folders", "add", str(root / "data/notes"), "--format", "markdown")
    notes, timings["sync_notes_no_embed_s"] = memo.json("sync", "--only", "notes", "--no-embed")
    mail, timings["sync_mail_no_embed_s"] = load_mail(memo, root / "data", args.mail)
    size_no_embed = store_bytes(memo.json("store", "info")[0]["item"])

    runs = {}
    runs["lexical, question verbatim"] = query_all(memo, names, queries, "lexical-verbatim", ["--exact"],
                                                   lambda text: text, raw)
    runs["lexical, content words joined by OR"] = query_all(memo, names, queries, "lexical-or", ["--exact"],
                                                            or_query, raw)
    # No --exact and no model yet: the words half alone, as an owner who never ran `models download` searches.
    runs["words, question verbatim (no model)"] = query_all(memo, names, queries, "words-verbatim", [],
                                                             lambda text: text, raw)

    # EmbeddingGemma comes under the Gemma Terms of Use; the owner accepted them for this benchmark (7 Nov 2026).
    terms = ["--accept-terms"] if args.model == "embeddinggemma" else []
    timings["model_download_s"] = memo.json("models", "download", args.model, *terms)[1]
    # memo embeds with MEMO_EMBEDDING_MODEL (default e5-small), not with whichever model was downloaded last.
    memo.env["MEMO_EMBEDDING_MODEL"] = args.model
    embedded, timings["sync_embed_s"] = embed(memo, folder["item"]["id"])
    size_embedded = store_bytes(memo.json("store", "info")[0]["item"])
    runs[f"hybrid ({args.model}), question verbatim"] = query_all(memo, names, queries, "hybrid-verbatim", [],
                                                                  lambda text: text, raw)
    runs[f"hybrid ({args.model}), content words joined by OR"] = query_all(memo, names, queries, "hybrid-or", [],
                                                                         or_query, raw)

    oracle = json.loads((args.fixture / "oracle.json").read_text())
    results = {
        "memo_version": version.strip(), "python": platform.python_version(), "machine": platform.machine(),
        "records": len(records), "questions": len(queries),
        "ingested": {"notes_folder": notes["item"]["notes"], "mail": mail,
                     "embedding": embedded},
        "store_bytes_no_embed": size_no_embed, "store_bytes_embedded": size_embedded,
        "timings": timings,
        "startup_p50_s": statistics.median(startup), "startup_p95_s": percentile(startup, 0.95),
        "scores": [score_run(label, rows, oracle) for label, rows in runs.items()],
    }
    (root / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    (root / "per-query.json").write_text(json.dumps(runs, ensure_ascii=False, indent=2) + "\n")
    print("| Run | Questions scored | Recall@1 | Recall@5 | Recall@10 | p50 s | p95 s | Empty replies |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|")
    for row in results["scores"]:
        print(f"| {row['run']} | {row['questions_scored']} | {row['recall@1']:.2f} | {row['recall@5']:.2f} | "
              f"{row['recall@10']:.2f} | {row['p50_s']:.2f} | {row['p95_s']:.2f} | {row['empty_replies']} |")


if __name__ == "__main__":
    main()
