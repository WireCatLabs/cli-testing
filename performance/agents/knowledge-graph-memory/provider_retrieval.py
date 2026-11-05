#!/usr/bin/env python3
"""Ingest the synthetic corpus into a hosted memory service and score its own search, with no answer model."""

import argparse
import ast
import hashlib
import json
import platform
import subprocess
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

from memo_baseline import name_of, or_query, percentile, score_run

SUPERMEMORY = "https://api.supermemory.ai"
MEM0 = "https://api.mem0.ai"


def keyring_secret(service):
    # The key goes from the keyring into this process only: never printed, logged, or put on a command line.
    done = subprocess.run(["secret-tool", "lookup", "service", service, "account", "wirecat"],
                          capture_output=True, text=True, check=False)
    secret = done.stdout.strip()
    if done.returncode != 0 or not secret:
        raise SystemExit(f"no keyring entry for service {service} account wirecat")
    return secret


def now():
    return datetime.now(UTC).isoformat(timespec="seconds")


def tag_started(tag):
    try:
        return datetime.strptime(tag.removeprefix("wirecat_bench_"), "%Y%m%d_%H%M%S").replace(tzinfo=UTC)
    except ValueError:
        return None


class Ledger:
    """One short line per batch, appended and closed at once, so a killed run still shows what reached the service."""

    def __init__(self, path):
        self.path = path

    def write(self, **entry):
        with self.path.open("a") as out:
            out.write(json.dumps({"at": now(), **entry}, ensure_ascii=False) + "\n")

    def totals(self):
        if not self.path.exists():
            return {"batches": 0, "sent": 0, "failed": 0}
        rows = [json.loads(line) for line in self.path.read_text().splitlines() if line.strip()]
        batches = [row for row in rows if "batch" in row]
        return {"batches": len(batches), "sent": sum(row["sent"] for row in batches),
                "failed": sum(len(row["failed"]) for row in batches)}


class Api:
    def __init__(self, base, auth):
        self.base, self.auth, self.calls = base, auth, 0

    def request(self, method, path, body=None, attempts=4, timeout=60):
        data = None if body is None else json.dumps(body).encode()
        for attempt in range(attempts):
            request = urllib.request.Request(self.base + path, data=data, method=method,
                                             headers={"Authorization": self.auth, "Content-Type": "application/json"})
            self.calls += 1
            try:
                with urllib.request.urlopen(request, timeout=timeout) as reply:
                    raw = reply.read()
                    return json.loads(raw) if raw else {}
            except urllib.error.HTTPError as error:
                detail = error.read().decode(errors="replace")[:500]
                if error.code in (429, 500, 502, 503, 504) and attempt + 1 < attempts:
                    time.sleep(2 ** attempt * 2)
                    continue
                raise RuntimeError(f"{method} {path} -> HTTP {error.code}: {detail}") from None
            except (urllib.error.URLError, TimeoutError) as error:
                if attempt + 1 < attempts:
                    time.sleep(2 ** attempt * 2)
                    continue
                raise RuntimeError(f"{method} {path} -> {error}") from None
        raise AssertionError("unreachable")


class Supermemory:
    label = "Supermemory"

    def __init__(self, tag):
        self.api = Api(SUPERMEMORY, "Bearer " + keyring_secret("supermemory"))
        self.tag = tag

    final = ("done", "failed")
    retry = ("failed",)

    def ingest(self, records, ledger):
        for start in range(0, len(records), 100):
            documents = [{"content": record["text"], "containerTag": self.tag, "customId": name_of(index),
                          "metadata": {"rid": name_of(index)}, "documentDate": record["timestamp"]}
                         for index, record in records[start:start + 100]]
            started = time.time()
            # A whole batch can come back as HTTP 200 with a single "Failed to save documents" item.
            for attempt in range(3):
                # One batch of 100 took 88 s on average in the first full run; 60 s timed out four times in a row.
                reply = self.api.request("POST", "/v3/documents/batch", {"documents": documents}, timeout=300)
                if reply.get("success"):
                    break
                time.sleep(10 * (attempt + 1))
            items = reply.get("results", [])
            if len(items) == len(documents):
                failed = [{"rid": document["customId"], "error": json.dumps(item)[:300]}
                          for document, item in zip(documents, items) if item.get("status") == "error"]
            else:
                failed = [{"rid": document["customId"], "error": json.dumps(items)[:300]} for document in documents]
            ledger.write(batch=start // 100, rids=[document["customId"] for document in documents],
                         sent=len(documents), failed=failed, s=round(time.time() - started, 1))

    def held(self):
        """Every document under the tag, by record name, with its processing status."""
        states, page = {}, 1
        while True:
            reply = self.api.request("POST", "/v3/documents/list",
                                     {"containerTags": [self.tag], "limit": 500, "page": page, "order": "asc"})
            for document in reply.get("memories", []):
                states[document.get("customId") or (document.get("metadata") or {}).get("rid")] = document["status"]
            if page >= reply["pagination"]["totalPages"]:
                return states
            page += 1

    def extra(self):
        tags = self.api.request("GET", "/v3/container-tags/list")
        for tag in tags if isinstance(tags, list) else tags.get("containerTags", []):
            if tag["containerTag"] == self.tag:
                return {"documents": tag.get("documentCount"), "memories": tag.get("memoryCount"),
                        "last_activity": tag.get("lastActivityAt")}
        return {}

    def search(self, query, variant):
        # threshold "default" is what the Hermes provider sends (none); "0" asks for every candidate.
        body = {"q": query, "containerTag": self.tag, "searchMode": "hybrid", "limit": 10,
                "include": {"documents": True}}
        if variant == "threshold-0":
            body["threshold"] = 0
        reply = self.api.request("POST", "/v4/search", body)
        hits = []
        for item in reply.get("results", []):
            names = [(doc.get("metadata") or {}).get("rid") for doc in item.get("documents") or []]
            names.append((item.get("metadata") or {}).get("rid"))
            hits.append([name for name in names if name])
        return reply, hits

    @staticmethod
    def kinds(reply):
        return {"memory": sum("memory" in item for item in reply.get("results", [])),
                "chunk": sum("chunk" in item for item in reply.get("results", []))}


class Mem0:
    label = "Mem0"

    def __init__(self, tag, infer):
        self.api = Api(MEM0, "Token " + keyring_secret("mem0"))
        self.tag, self.infer = tag, infer

    def add(self, item):
        index, record = item
        body = {"messages": [{"role": "user", "content": record["text"]}], "user_id": self.tag,
                "agent_id": "wirecat-bench", "metadata": {"rid": name_of(index)}, "infer": self.infer}
        try:
            return {"rid": name_of(index), "reply": self.api.request("POST", "/v3/memories/add/", body)}
        except RuntimeError as error:
            return {"rid": name_of(index), "error": str(error)}

    final = ("SUCCEEDED", "FAILED")
    retry = ("FAILED",)

    def ingest(self, records, ledger):
        with ThreadPoolExecutor(max_workers=4) as pool:
            for start in range(0, len(records), 100):
                started = time.time()
                replies = list(pool.map(self.add, records[start:start + 100]))
                ledger.write(batch=start // 100, rids=[row["rid"] for row in replies], sent=len(replies),
                             failed=[{"rid": row["rid"], "error": row["error"][:300]}
                                     for row in replies if "error" in row],
                             s=round(time.time() - started, 1))

    @staticmethod
    def literal(value):
        # The event feed returns payload and metadata sometimes as objects, sometimes as Python repr strings.
        return ast.literal_eval(value) if isinstance(value, str) and value.startswith("{") else value or {}

    def held(self):
        """Every ADD event for the tag, by record name, from the organisation's event feed (newest first)."""
        states, page, since = {}, 1, tag_started(self.tag)
        rank = {"FAILED": 0, "PENDING": 1, "RUNNING": 1, "SUCCEEDED": 2}
        while True:
            reply = self.api.request("GET", f"/v1/events/?page={page}&page_size=100")
            for event in reply.get("results", []):
                if since and datetime.fromisoformat(event["created_at"]) < since:
                    return states
                payload = self.literal(event.get("payload"))
                if event.get("event_type") != "ADD" or payload.get("user_id") != self.tag:
                    continue
                rid = (self.literal(event.get("metadata")) or {}).get("rid") or (payload.get("metadata") or {}).get("rid")
                # A record added twice keeps its best outcome.
                if rank.get(event["status"], 1) >= rank.get(states.get(rid), -1):
                    states[rid] = event["status"]
            if not reply.get("next"):
                return states
            page += 1

    def extra(self):
        return {"memories": self.count()}

    def count(self):
        reply = self.api.request("POST", "/v3/memories/?page=1&page_size=1", {"filters": {"user_id": self.tag}})
        return reply.get("count")

    def search(self, query, variant):
        reply = self.api.request("POST", "/v3/memories/search/",
                                 {"query": query, "filters": {"user_id": self.tag}, "top_k": 10})
        hits = [[(item.get("metadata") or {}).get("rid")] for item in reply.get("results", [])]
        return reply, [[name for name in names if name] for names in hits]


def flatten(groups, names):
    # A memory distilled from several records cites all of them at one rank; dedupe in rank order.
    seen = []
    for group in groups:
        for name in group:
            source = names.get(name, f"unmapped:{name}")
            if source not in seen:
                seen.append(source)
    return seen


def run_queries(service, queries, names, variant, rewrite, raw):
    folder = raw / f"{variant}-{'or' if rewrite is or_query else 'verbatim'}"
    folder.mkdir(exist_ok=True)
    rows = []
    for query in queries:
        text = rewrite(query["question"])
        started = time.perf_counter()
        reply, groups = service.search(text, variant)
        seconds = time.perf_counter() - started
        (folder / f"{query['id']}.json").write_text(json.dumps(reply, ensure_ascii=False, indent=2) + "\n")
        rows.append({"id": query["id"], "query": text, "hits": flatten(groups, names), "results": len(groups),
                     "kinds": service.kinds(reply) if hasattr(service, "kinds") else None,
                     "unmapped_results": sum(not group for group in groups), "seconds": seconds, "complete": True})
    return rows


def check(service, chosen, ledger):
    held = service.held()
    names = [name_of(index) for index, _ in chosen]
    wanted = set(names)
    return held, {"service": service.label, "tag": service.tag, "checked_at": now(), "expected": len(names),
                  "by_status": dict(Counter(held.get(name, "absent") for name in names)),
                  "outside_selection": len(set(held) - wanted), "ledger": ledger.totals(), "service_counts": service.extra()}


def write_status(root, status):
    path = root / f"status-{datetime.now(UTC):%Y%m%dT%H%M%S}.json"
    path.write_text(json.dumps(status, indent=2) + "\n")
    print(json.dumps(status, indent=2))
    return path


def ingest_records(service, chosen, root, args, ledger):
    started = time.time()
    todo = chosen
    if args.resume:
        held, status = check(service, chosen, ledger)
        write_status(root, status)
        todo = [(index, record) for index, record in chosen if held.get(name_of(index), "absent") in ("absent", *service.retry)]
    print(f"sending {len(todo)} of {len(chosen)} records", flush=True)
    service.ingest(todo, ledger)
    submit_s = time.time() - started
    deadline = time.time() + args.wait_minutes * 60
    # One listing per poll instead of one GET per record every 10 s: 7,800 GETs a round was most of the old wait.
    while True:
        held, status = check(service, chosen, ledger)
        if all(held.get(name_of(index)) in service.final for index, _ in chosen) or time.time() > deadline:
            break
        time.sleep(300)
    write_status(root, status)
    return {"records": len(chosen), "sent_this_run": len(todo), "status": status["by_status"], "submit_s": submit_s,
            "until_indexed_s": time.time() - started, "ingest_calls": service.api.calls}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--service", choices=["supermemory", "mem0"], required=True)
    parser.add_argument("--fixture", type=Path, required=True, help="a run.py output directory")
    parser.add_argument("--output", type=Path, required=True, help="new directory; existing paths are refused")
    parser.add_argument("--records", type=int, help="ingest only the first N records (a pilot); default all")
    parser.add_argument("--subset", type=Path, help="ingest only these records: run.py's subset-mem0.json")
    parser.add_argument("--tag", help="container tag / user id; a new one per run keeps runs apart")
    parser.add_argument("--no-infer", action="store_true", help="Mem0: store records verbatim, no fact extraction")
    parser.add_argument("--variants", default="default", help="Supermemory: comma list of default,threshold-0")
    parser.add_argument("--rewrites", default="verbatim,or", help="comma list of verbatim,or")
    parser.add_argument("--wait-minutes", type=float, default=30)
    parser.add_argument("--search-only", action="store_true", help="search an earlier run's --tag; no ingest")
    parser.add_argument("--status", action="store_true",
                        help="check what the service holds for --tag, write status-<time>.json, then stop")
    parser.add_argument("--resume", action="store_true",
                        help="continue an interrupted ingest for --tag in the same --output: send only what is missing")
    args = parser.parse_args()
    if (args.status or args.resume) and not args.tag:
        raise SystemExit("--status and --resume need the --tag of the interrupted run")
    args.output.mkdir(parents=True, exist_ok=args.status or args.resume)
    root = args.output.resolve()
    # Underscores only: Hermes's Supermemory provider turns any other character into "_" before it searches.
    tag = args.tag or f"wirecat_bench_{datetime.now(UTC):%Y%m%d_%H%M%S}"
    records = [json.loads(line) for line in (args.fixture / "corpus.jsonl").read_text().splitlines()]
    queries = json.loads((args.fixture / "queries.json").read_text())
    chosen = list(enumerate(records))
    subset = None
    if args.subset:
        subset = json.loads(args.subset.read_text())
        wanted = set(subset["ids"])
        # Names stay those of the whole corpus, so hits map back through the same table as every other run.
        chosen = [(index, record) for index, record in chosen if record["id"] in wanted]
        lines = "".join(json.dumps(record, ensure_ascii=False) + "\n" for _, record in chosen)
        if len(chosen) != subset["records"] or hashlib.sha256(lines.encode()).hexdigest() != subset["sha256"]:
            raise SystemExit("the subset does not match this fixture's corpus")
    chosen = chosen[:args.records]
    names = {name_of(index): record["id"] for index, record in enumerate(records)}
    service = Supermemory(tag) if args.service == "supermemory" else Mem0(tag, infer=not args.no_infer)

    ledger = Ledger(root / "ledger.jsonl")

    if args.search_only and not args.tag:
        raise SystemExit("--search-only needs the --tag of the run that ingested the records")
    if args.status:
        write_status(root, check(service, chosen, ledger)[1])
        return
    if args.search_only:
        ingest = {"search_only": True, "ingest_calls": 0}
    else:
        ingest = ingest_records(service, chosen, root, args, ledger)
    if isinstance(service, Mem0):
        ingest["memories_stored"] = service.count()
    print(json.dumps(ingest, indent=2))

    raw = root / "raw"
    raw.mkdir(exist_ok=args.resume)
    rewrites = {"verbatim": lambda text: text, "or": or_query}
    variants = args.variants.split(",") if isinstance(service, Supermemory) else ["default"]
    runs = {}
    for variant in variants:
        for rewrite in args.rewrites.split(","):
            label = f"{service.label} {variant}, question {'verbatim' if rewrite == 'verbatim' else 'as OR words'}"
            runs[label] = run_queries(service, queries, names, variant, rewrites[rewrite], raw)
    oracle = json.loads((args.fixture / "oracle.json").read_text())
    scores = []
    for label, rows in runs.items():
        row = score_run(label, rows, oracle)
        row["unmapped_results"] = sum(item["unmapped_results"] for item in rows)
        if rows[0]["kinds"] is not None:
            row["memory_results"] = sum(item["kinds"]["memory"] for item in rows)
            row["chunk_results"] = sum(item["kinds"]["chunk"] for item in rows)
        scores.append(row)
    results = {"service": args.service, "tag": tag,
               "subset": {key: subset[key] for key in ("records", "sha256")} if subset else None, "infer": not args.no_infer if args.service == "mem0" else None,
               "python": platform.python_version(), "date": datetime.now(UTC).isoformat(timespec="seconds"),
               "ingest": ingest, "search_calls": service.api.calls - ingest["ingest_calls"], "scores": scores}
    (root / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    (root / "per-query.json").write_text(json.dumps(runs, ensure_ascii=False, indent=2) + "\n")
    print("| Run | Questions scored | Recall@1 | Recall@5 | Recall@10 | p50 s | p95 s | Empty replies |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|")
    for row in scores:
        print(f"| {row['run']} | {row['questions_scored']} | {row['recall@1']:.2f} | {row['recall@5']:.2f} | "
              f"{row['recall@10']:.2f} | {row['p50_s']:.2f} | {row['p95_s']:.2f} | {row['empty_replies']} |")


if __name__ == "__main__":
    main()
