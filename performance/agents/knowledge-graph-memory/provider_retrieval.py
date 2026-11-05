#!/usr/bin/env python3
"""Ingest the synthetic corpus into a hosted memory service and score its own search, with no answer model."""

import argparse
import json
import platform
import subprocess
import time
import urllib.error
import urllib.request
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

    def ingest(self, records, log):
        documents = [{"content": record["text"], "containerTag": self.tag, "customId": name_of(index),
                      "metadata": {"rid": name_of(index)}, "documentDate": record["timestamp"]}
                     for index, record in records]
        ids, failures = [], []
        for start in range(0, len(documents), 100):
            batch = documents[start:start + 100]
            # A whole batch can come back as HTTP 200 with a single "Failed to save documents" item.
            for attempt in range(3):
                # One batch of 100 took 88 s on average in the first full run; 60 s timed out four times in a row.
                reply = self.api.request("POST", "/v3/documents/batch", {"documents": batch}, timeout=300)
                log.append(reply)
                if reply.get("success"):
                    break
                time.sleep(10 * (attempt + 1))
            for item in reply["results"]:
                (ids if item.get("status") != "error" else failures).append(item)
        return [item["id"] for item in ids], failures

    def wait(self, ids, log, deadline):
        pending, states = set(ids), {}
        while pending and time.time() < deadline:
            for document_id in list(pending):
                reply = self.api.request("GET", f"/v3/documents/{document_id}")
                states[document_id] = (reply.get("status"), reply.get("dreamingStatus"))
                # Search can return chunks once status is done; memories exist only after dreaming ends.
                if reply.get("status") == "failed" or (reply.get("status") == "done"
                                                        and reply.get("dreamingStatus") in ("done", "failed")):
                    pending.discard(document_id)
            if pending:
                time.sleep(10)
        log.append({"states": {key: list(value) for key, value in states.items()}})
        return {"done": sum(value[0] == "done" for value in states.values()),
                "dreaming_done": sum(value[1] == "done" for value in states.values()),
                "failed": sum("failed" in value for value in states.values()), "still_pending": len(pending)}

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

    def ingest(self, records, log):
        with ThreadPoolExecutor(max_workers=4) as pool:
            replies = list(pool.map(self.add, records))
        log.extend(replies)
        events = [row["reply"].get("event_id") for row in replies if "reply" in row]
        failures = [row for row in replies if "error" in row]
        return [event for event in events if event], failures

    def wait(self, events, log, deadline):
        pending, states = set(events), {}
        while pending and time.time() < deadline:
            for event in list(pending):
                reply = self.api.request("GET", f"/v1/event/{event}/")
                states[event] = reply.get("status")
                if reply.get("status") in ("SUCCEEDED", "FAILED"):
                    pending.discard(event)
            if pending:
                time.sleep(10)
        log.append({"states": states})
        return {"done": sum(value == "SUCCEEDED" for value in states.values()),
                "failed": sum(value == "FAILED" for value in states.values()), "still_pending": len(pending)}

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
    folder.mkdir()
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


def ingest_records(service, chosen, root, args):
    log = []
    started = time.time()
    handles, failures = service.ingest(chosen, log)
    submit_s = time.time() - started
    processed = service.wait(handles, log, time.time() + args.wait_minutes * 60)
    indexed_s = time.time() - started
    (root / "ingest-log.json").write_text(json.dumps(log, ensure_ascii=False, indent=2) + "\n")
    return {"records": len(chosen), "accepted": len(handles), "rejected": len(failures),
            "rejections": failures[:20], "processed": processed, "submit_s": submit_s, "until_indexed_s": indexed_s,
            "ingest_calls": service.api.calls}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--service", choices=["supermemory", "mem0"], required=True)
    parser.add_argument("--fixture", type=Path, required=True, help="a run.py output directory")
    parser.add_argument("--output", type=Path, required=True, help="new directory; existing paths are refused")
    parser.add_argument("--records", type=int, help="ingest only the first N records (a pilot); default all")
    parser.add_argument("--tag", help="container tag / user id; a new one per run keeps runs apart")
    parser.add_argument("--no-infer", action="store_true", help="Mem0: store records verbatim, no fact extraction")
    parser.add_argument("--variants", default="default", help="Supermemory: comma list of default,threshold-0")
    parser.add_argument("--rewrites", default="verbatim,or", help="comma list of verbatim,or")
    parser.add_argument("--wait-minutes", type=float, default=30)
    parser.add_argument("--search-only", action="store_true", help="search an earlier run's --tag; no ingest")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    root = args.output.resolve()
    # Underscores only: Hermes's Supermemory provider turns any other character into "_" before it searches.
    tag = args.tag or f"wirecat_bench_{datetime.now(UTC):%Y%m%d_%H%M%S}"
    records = [json.loads(line) for line in (args.fixture / "corpus.jsonl").read_text().splitlines()]
    queries = json.loads((args.fixture / "queries.json").read_text())
    chosen = list(enumerate(records))[:args.records]
    names = {name_of(index): record["id"] for index, record in chosen}
    service = Supermemory(tag) if args.service == "supermemory" else Mem0(tag, infer=not args.no_infer)

    if args.search_only and not args.tag:
        raise SystemExit("--search-only needs the --tag of the run that ingested the records")
    if args.search_only:
        ingest = {"search_only": True, "ingest_calls": 0}
    else:
        ingest = ingest_records(service, chosen, root, args)
    if isinstance(service, Mem0):
        ingest["memories_stored"] = service.count()
    print(json.dumps(ingest, indent=2))

    raw = root / "raw"
    raw.mkdir()
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
    results = {"service": args.service, "tag": tag, "infer": not args.no_infer if args.service == "mem0" else None,
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
