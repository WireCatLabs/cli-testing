#!/usr/bin/env python3
"""Memo search with write-time enrichment off and on, over one disposable store of the synthetic corpus.

Copied from ../knowledge-graph-memory/memo_baseline.py (loading and scoring unchanged). The store is loaded and
embedded once; both question sets (the record's words and other words) are asked with enrichment off, then a sample
of records is enriched through cli-core's enrichRecords (enrich_sample.mjs), the store is embedded again and the
same questions are asked with enrichment on. The OpenAI key is read from the keyring entry openai/default inside
this process and handed only to the enrichment process's environment; it is never printed. Synthetic records only.

    python3 enrich_bench.py --fixture ~/.cache/wirecat-bench/kg-fixture-v3 \
      --paraphrased ~/.cache/wirecat-bench/kg-fixture-v3-paraphrased --output <new dir> \
      --memo <memo.js built against the branch> --core <cli-core checkout with dist> --sample 0.1
"""

import argparse
import random
import sqlite3
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
            # Progress lines fill stderr before the error; the error is what is worth keeping.
            error = "\n".join(line for line in done.stderr.splitlines() if '"progress"' not in line)
            raise RuntimeError(f"memo {' '.join(args)} exited {done.returncode}: {error.strip()[:2000]}")
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

    One sync embeds a bounded number of chunks of notes and of mail and says what is left, so it runs until nothing
    is. The bound is 600 for e5-small; memo with cli-memo #676 scales it by the model's catalogued speed, 39 for
    EmbeddingGemma, so 10K records take about 160 runs.
    """
    if reads_mbox(memo):
        command = ("sync", "--since-time", "2000-01-01", "--limit", "50000", "--source", "email:synthetic", "--folder",
                   folder_id)
    else:
        command = ("sync",)
    seconds = 0.0
    for runs in range(1, 1001):
        reply, elapsed = memo.json(*command)
        seconds += elapsed
        parts = [value for value in reply["item"].values() if isinstance(value, dict) and "left" in value]
        if not any(part["left"] for part in parts):
            return {**reply["item"], "sync_runs": runs}, seconds
    raise RuntimeError("memo sync still had chunks to embed after 1000 runs")


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


HERE = Path(__file__).resolve().parent


def api_key():
    return subprocess.run(["secret-tool", "lookup", "service", "openai", "account", "default"],
                          capture_output=True, text=True, check=True).stdout.strip()


def store_ids(memo, names):
    """Each record name (r0001) to the store row search cites: a document by its title, an email by its Gmail id."""
    path = memo.json("store", "info")[0]["item"]["path"]
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as db:
        documents = {str(title): row for row, title in db.execute("SELECT id, title FROM documents")}
        emails = {name_of(int(external) - 1_000_000_000_000_000): row
                  for row, external in db.execute("SELECT id, external_id FROM emails")}
    found = {}
    for name in names:
        if name in emails:
            found[name] = {"type": "email", "id": emails[name]}
        elif name in documents:
            found[name] = {"type": "document", "id": documents[name]}
    return found


def sample_names(names, records, oracle, share, seed):
    """Every record a question cites, and `share` of the rest by a fixed seed."""
    ids = {record["id"] for record in records}
    cited = {cite for row in oracle for cite in row["required_citations"] if cite in ids}
    by_id = {record_id: name for name, record_id in names.items()}
    rest = sorted(set(by_id) - cited)
    picked = cited | set(random.Random(seed).sample(rest, round(share * len(rest))))
    return sorted(by_id[record_id] for record_id in picked), len(cited)


def set_enrichment_section(memo, value):
    """Writes or drops the shared setting by hand, so later syncs embed without enriching the rest of the store."""
    config = Path(memo.env["WIRECAT_CONFIG_DIR"]) / "config.json"
    current = json.loads(config.read_text()) if config.exists() else {}
    if value is None:
        current.pop("enrichment", None)
    else:
        current["enrichment"] = value
    config.write_text(json.dumps(current, indent=2) + "\n")


def enrich(memo, core, only, key):
    env = {**memo.env, "OPENAI_API_KEY": key}
    done = subprocess.run(["node", str(HERE / "enrich_sample.mjs"), core], input=json.dumps(only), env=env,
                          capture_output=True, text=True, check=False)
    if done.returncode != 0:
        # The key is in the environment, never in argv or stdout, so stderr cannot carry it.
        raise RuntimeError(f"enrich_sample.mjs exited {done.returncode}: {done.stderr.strip()[:500]}")
    return json.loads(done.stdout.strip().splitlines()[-1])


def reworded_ids(plain, other, oracle):
    """As eval_embeddings.py:57: the questions the paraphrased set rewrote that have a source."""
    cites = {row["id"]: row["required_citations"] for row in oracle}
    text = {row["id"]: row["question"] for row in other}
    return sorted(row["id"] for row in plain if row["question"] != text[row["id"]] and cites[row["id"]])


def rows_from_raw(folder, names, queries, rewrite):
    """A finished run's rows read back from its saved replies, for a resumed run; times are not kept."""
    rows = []
    for query in queries:
        reply = json.loads((folder / f"{query['id']}.json").read_text())
        hits = [names.get(item.get("title", "")) or names.get(mail_name(item.get("ref", "")), f"unmapped:{item.get('ref')}")
                for item in reply["items"]]
        rows.append({"id": query["id"], "query": rewrite(query["question"]), "hits": hits, "seconds": 0.0,
                     "complete": reply["meta"].get("complete", True)})
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--paraphrased", type=Path, required=True, help="the same records, questions in other words")
    parser.add_argument("--output", type=Path, required=True, help="new directory; existing paths are refused")
    parser.add_argument("--memo", required=True)
    parser.add_argument("--mail", default="mail")
    parser.add_argument("--core", required=True, help="the cli-core checkout whose dist enrich_sample.mjs imports")
    parser.add_argument("--model", default="e5-small")
    parser.add_argument("--sample", type=float, default=0.1, help="share of uncited records to enrich; 1 for all")
    parser.add_argument("--seed", type=int, default=20261108)
    parser.add_argument("--resume", action="store_true",
                        help="the off runs and the enrichment are done in --output; embed again and ask with it on")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=args.resume)
    root = args.output.resolve()
    records = [json.loads(line) for line in (args.fixture / "corpus.jsonl").read_text().splitlines()]
    other_records = (args.paraphrased / "corpus.jsonl").read_text()
    if other_records != (args.fixture / "corpus.jsonl").read_text():
        raise SystemExit("the two fixtures must hold the same records")
    plain = json.loads((args.fixture / "queries.json").read_text())
    other = json.loads((args.paraphrased / "queries.json").read_text())
    oracle = json.loads((args.fixture / "oracle.json").read_text())
    memo = Memo(args.memo, root / "memo")
    raw = root / "raw"
    if args.resume:
        return resume(args, root, memo, raw, records, plain, other, oracle)
    raw.mkdir()

    version, _ = memo.run("--version")
    names = write_sources(records, root / "data")
    folder, _ = memo.json("folders", "add", str(root / "data/notes"), "--format", "markdown")
    memo.json("sync", "--only", "notes", "--no-embed")
    load_mail(memo, root / "data", args.mail)
    memo.json("models", "download", args.model)
    memo.env["MEMO_EMBEDDING_MODEL"] = args.model
    timings = {}
    embedded, timings["embed_off_s"] = embed(memo, folder["item"]["id"])

    def ask(label):
        runs = {}
        for set_name, questions in (("record's words", plain), ("other words", other)):
            slug = set_name.split("'")[0].replace(" ", "-")
            runs[f"{label}, {set_name}, as typed"] = query_all(memo, names, questions, f"{label}-{slug}-typed", [],
                                                               lambda text: text, raw)
            runs[f"{label}, {set_name}, OR"] = query_all(memo, names, questions, f"{label}-{slug}-or", [], or_query, raw)
        return runs

    runs = ask("off")

    consent = memo.json("models", "consents", "set", "openai", "--model", "gpt-4o-mini", "--yes")[0]["item"]
    picked, cited = sample_names(names, records, oracle, args.sample, args.seed)
    # memo keeps one document per distinct text: 560 notes repeat another's text and have no row of their own.
    ids = store_ids(memo, picked)
    key = api_key()
    started = time.perf_counter()
    enriched = enrich(memo, args.core, list(ids.values()), key)
    del key
    timings["enrich_s"] = time.perf_counter() - started
    saved = memo.json("models", "consents", "show")[0]["item"]
    setting = json.loads((Path(memo.env["WIRECAT_CONFIG_DIR"]) / "config.json").read_text())["enrichment"]
    set_enrichment_section(memo, None)
    again, timings["embed_on_s"] = embed(memo, folder["item"]["id"])
    runs |= ask("on")
    set_enrichment_section(memo, setting)

    rewritten = set(reworded_ids(plain, other, oracle))
    scores = []
    for label, rows in runs.items():
        scores.append({**score_run(label, rows, oracle), "subset": "all"})
        scores.append({**score_run(label, [row for row in rows if row["id"] in rewritten], oracle),
                       "subset": "reworded"})
    results = {
        "memo_version": version.strip(), "records": len(records), "questions": len(plain),
        "reworded": sorted(rewritten), "sample_share": args.sample, "seed": args.seed,
        "sampled_records": len(picked), "sampled_store_rows": len(ids), "cited_records": cited, "consent": consent,
        "enrichment": enriched, "after_enrichment": saved, "embedded_off": embedded, "embedded_on": again,
        "timings": timings, "scores": scores,
    }
    (root / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    (root / "per-query.json").write_text(json.dumps(runs, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: results[key] for key in ("sampled_records", "cited_records", "enrichment", "timings")}))
    print("| Run | Questions | Recall@1 | Recall@5 | Recall@10 |")
    print("|---|---:|---:|---:|---:|")
    for row in scores:
        print(f"| {row['run']} ({row['subset']}) | {row['questions_scored']} | {row['recall@1']:.2f} | "
              f"{row['recall@5']:.2f} | {row['recall@10']:.2f} |")


def resume(args, root, memo, raw, records, plain, other, oracle):
    """After a sync failed between the enrichment and the on runs: the store holds both, the off replies are saved."""
    names = {name_of(index): record["id"] for index, record in enumerate(records)}
    memo.env["MEMO_EMBEDDING_MODEL"] = args.model
    folder = memo.json("folders", "list")[0]["items"][0]
    version, _ = memo.run("--version")
    timings = {}
    again, timings["embed_on_s"] = embed(memo, folder["id"])
    runs = {}
    for set_name, questions in (("record's words", plain), ("other words", other)):
        slug = set_name.split("'")[0].replace(" ", "-")
        runs[f"off, {set_name}, as typed"] = rows_from_raw(raw / f"off-{slug}-typed", names, questions, lambda t: t)
        runs[f"off, {set_name}, OR"] = rows_from_raw(raw / f"off-{slug}-or", names, questions, or_query)
    for set_name, questions in (("record's words", plain), ("other words", other)):
        slug = set_name.split("'")[0].replace(" ", "-")
        runs[f"on, {set_name}, as typed"] = query_all(memo, names, questions, f"on-{slug}-typed", [], lambda t: t, raw)
        runs[f"on, {set_name}, OR"] = query_all(memo, names, questions, f"on-{slug}-or", [], or_query, raw)
    path = memo.json("store", "info")[0]["item"]["path"]
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as db:
        count, empty, tokens = db.execute("SELECT count(*), sum(text = ''), sum(tokens) FROM enrichments").fetchone()
    state = memo.json("models", "consents", "show")[0]["item"]
    rewritten = set(reworded_ids(plain, other, oracle))
    scores = []
    for label, rows in runs.items():
        scores.append({**score_run(label, rows, oracle), "subset": "all"})
        scores.append({**score_run(label, [row for row in rows if row["id"] in rewritten], oracle),
                       "subset": "reworded"})
    results = {
        "memo_version": version.strip(), "records": len(records), "questions": len(plain), "resumed": True,
        "reworded": sorted(rewritten), "sample_share": args.sample,
        "enrichments": {"rows": count, "without_facts": empty, "tokens": tokens}, "after_enrichment": state,
        "embedded_on": again, "timings": timings, "scores": scores,
    }
    (root / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    (root / "per-query.json").write_text(json.dumps(runs, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({key: results[key] for key in ("enrichments", "timings")}))
    for row in scores:
        print(f"| {row['run']} ({row['subset']}) | {row['questions_scored']} | {row['recall@1']:.2f} | "
              f"{row['recall@5']:.2f} | {row['recall@10']:.2f} |")


if __name__ == "__main__":
    main()
