#!/usr/bin/env python3
"""One search variant on a copy of a finished memo_baseline store: embed what the build's chunk text lacks, then ask
both question sets (original wording, reworded) and score them as memo_baseline and meaning-loss/summarize.py do.

    variant.py --baseline <memo_baseline.py> --memo <memo.js> --store <memo-src-MODEL-v3-paraphrased> --model M --output <new dir>
"""
import argparse, importlib.util, json, shutil, sys
from pathlib import Path

B = Path.home() / ".cache/wirecat-bench"
WHO = ["q12", "q13", "q30", "q31", "q42", "q43"]


def main():
    p = argparse.ArgumentParser()
    for a in ("--baseline", "--memo", "--store", "--model", "--output"):
        p.add_argument(a, required=True)
    p.add_argument("--seed-model", help="a folder holding the model's files, copied in so nothing is downloaded")
    args = p.parse_args()
    spec = importlib.util.spec_from_file_location("memo_baseline", args.baseline)
    mb = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mb)
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=False)
    shutil.copytree(Path(args.store) / "memo", out / "memo", symlinks=True)
    memo = mb.Memo(args.memo, out / "memo")
    if args.seed_model:
        target = out / "memo/wirecat-state/models/text" / args.model
        shutil.copytree(args.seed_model, target)
    version = memo.run("--version")[0].strip()
    memo.json("models", "set", args.model)
    embedded, seconds = mb.embed(memo, "1")
    records = [json.loads(l) for l in (B / "kg-fixture-v3/corpus.jsonl").read_text().splitlines()]
    saved = Path(args.store) / "names.json"
    names = json.loads(saved.read_text()) if saved.exists() else {mb.name_of(i): r["id"] for i, r in enumerate(records)}
    oracle = json.loads((B / "kg-fixture-v3/oracle.json").read_text())
    expected = {r["id"]: set(r["required_citations"]) for r in oracle}
    raw = out / "raw"
    raw.mkdir()
    sets = {f: json.loads((B / f / "queries.json").read_text()) for f in ("kg-fixture-v3", "kg-fixture-v3-paraphrased")}
    plain = {q["id"]: q["question"] for q in sets["kg-fixture-v3"]}
    other = {q["id"]: q["question"] for q in sets["kg-fixture-v3-paraphrased"]}
    reworded = [q for q in plain if expected[q] and plain[q] != other[q]]
    result = {"memo": version, "model": args.model, "embed": {**embedded, "seconds": round(seconds, 1)}, "runs": {}}
    for fixture, queries in sets.items():
        rows = mb.query_all(memo, names, queries, fixture, [], lambda t: t, raw)
        by = {r["id"]: r["hits"] for r in rows}
        score = mb.score_run(fixture, rows, oracle)
        rec = lambda qs: round(sum(len(expected[q] & set(by[q][:10])) / len(expected[q]) for q in qs) / len(qs), 3)
        score["reworded@10"] = rec(reworded)
        score["who@10"] = {q: f"{len(expected[q] & set(by[q][:10]))}/{len(expected[q])}" for q in WHO}
        score["per_reworded"] = {q: f"{len(expected[q] & set(by[q][:10]))}/{len(expected[q])}" for q in reworded}
        result["runs"][fixture] = score
        (out / f"per-query-{fixture}.json").write_text(json.dumps(rows, indent=1))
    (out / "results.json").write_text(json.dumps(result, indent=2) + "\n")
    for f, s in result["runs"].items():
        print(f"{out.name} {f:26} @1 {s['recall@1']:.2f} @5 {s['recall@5']:.2f} @10 {s['recall@10']:.2f} "
              f"rew@10 {s['reworded@10']:.3f} p50 {s['p50_s']:.2f} who {' '.join(s['who@10'].values())}")
    print(f"{out.name} embed {result['embed']['seconds']} s in {embedded['sync_runs']} syncs")


if __name__ == "__main__":
    main()
