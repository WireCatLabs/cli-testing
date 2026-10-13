"""Runs every query of a private queries.json through memo, drive and qmd; appends ranked ids and latency to runs.json.

Environment (all required, the data is the owner's and never committed here):
  BENCH_DIR     holds queries.json, drive-docs.json, drive-md/, and qmd's config/ and cache/
  NOTES_ROOT    the notes folder memo indexes
  NOTES_FOLDER  memo's folder id for NOTES_ROOT
  NOTES_SKIP    comma-separated note paths left out of both sides
  DRIVE_PROFILE the drive profile to search

  python3 -I run.py [engine ...]     # e.g. memo drive, or "qmd query"; all engines when none is named
"""

import json
import os
import subprocess
import sys
import time

B = os.environ["BENCH_DIR"]
NOTES_ROOT = os.environ["NOTES_ROOT"]
NOTES_FOLDER = os.environ["NOTES_FOLDER"]
SKIP = set(filter(None, os.environ.get("NOTES_SKIP", "").split(",")))
DRIVE_PROFILE = os.environ["DRIVE_PROFILE"]
Q = json.load(open(f"{B}/queries.json"))
REF_BY_ID = {d["id"].lower(): d["ref"] for d in json.load(open(f"{B}/drive-docs.json"))}
DRIVE_REFS = set(REF_BY_ID.values())
QMD_ENV = {**os.environ, "QMD_CONFIG_DIR": f"{B}/config", "XDG_CACHE_HOME": f"{B}/cache"}
ONLY = set(sys.argv[1:])


def run(argv, env=None):
    started = time.perf_counter()
    out = subprocess.run(argv, capture_output=True, text=True, env=env, timeout=600)
    took = (time.perf_counter() - started) * 1000
    try:
        return json.loads(out.stdout), took, None
    except json.JSONDecodeError:
        return None, took, (out.stderr.strip().splitlines() or ["no output"])[-1][:200]


def note_id(path):
    path = path.removeprefix(NOTES_ROOT + "/")
    return path if path.endswith(".md") and path not in SKIP else None


def memo_notes(q):
    data, took, err = run(["memo", "search", "notes", q, "--folder", NOTES_FOLDER, "--json", "--limit", "30"])
    return [i for i in (note_id(h.get("path", "")) for h in (data or {}).get("hits", [])) if i], took, err


def drive(q):
    data, took, err = run(["drive", DRIVE_PROFILE, "search", q, "--json", "--limit", "30"])
    return [h.get("ref") for h in (data or {}).get("hits", []) if h.get("ref") in DRIVE_REFS], took, err


def qmd(mode, collection):
    def search(q):
        data, took, err = run(["qmd", mode, q, "--json", "-n", "10", "-c", collection], env=QMD_ENV)
        ids = []
        for hit in data or []:
            path = hit.get("file", "").split(f"qmd://{collection}/", 1)[-1]
            ids.append(REF_BY_ID.get(path.removesuffix(".md").lower()) if collection == "drive" else note_id(path))
        return [i for i in ids if i], took, err

    return search


ENGINES = {
    "notes": {
        "memo": memo_notes,
        "qmd search": qmd("search", "notes"),
        "qmd vsearch": qmd("vsearch", "notes"),
        "qmd query": qmd("query", "notes"),
    },
    "drive": {
        "drive": drive,
        "qmd search": qmd("search", "drive"),
        "qmd vsearch": qmd("vsearch", "drive"),
        "qmd query": qmd("query", "drive"),
    },
}

out_path = f"{B}/runs.json"
runs = json.load(open(out_path)) if os.path.exists(out_path) else []
done = {(r["corpus"], r["engine"], r["q"]) for r in runs}
for corpus, engines in ENGINES.items():
    for engine, search in engines.items():
        if ONLY and engine not in ONLY:
            continue
        for query in Q[corpus]:
            if (corpus, engine, query["q"]) in done:
                continue
            ids, took, err = search(query["q"])
            runs.append({
                "corpus": corpus, "engine": engine, "kind": query["kind"], "q": query["q"], "rel": query["rel"],
                "ranked": ids[:10], "ms": round(took), "error": err,
            })
            json.dump(runs, open(out_path, "w"), ensure_ascii=False, indent=1)
        print(corpus, engine, "done", flush=True)
