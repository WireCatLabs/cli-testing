"""Run patched memo copy against the scratch store copy for every cited question; print recall@10 on reworded/all."""
import json, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from memo_baseline import Memo, mail_name

S = Path(__file__).resolve().parent
B = Path.home() / ".cache/wirecat-bench"
BIN = str(S / "memo-pkg/node_modules/@wirecat/cli-memo/dist/bin/memo.js")


def main(label, env_pairs, limit="10"):
    memo = Memo(BIN, S / os.environ.get("STORE", "store") / "memo")
    memo.env.update(dict(env_pairs))
    # memo 0.131.50 always embeds with e5-small; no MEMO_EMBEDDING_MODEL is needed.
    names = {f"r{i + 1:04}": json.loads(l)["id"] for i, l in enumerate((B / "kg-fixture-v3/corpus.jsonl").read_text().splitlines())}
    plain = {q["id"]: q["question"] for q in json.loads((B / "kg-fixture-v3/queries.json").read_text())}
    other = {q["id"]: q["question"] for q in json.loads((B / "kg-fixture-v3-paraphrased/queries.json").read_text())}
    oracle = {r["id"]: set(r["required_citations"]) for r in json.loads((B / "kg-fixture-v3/oracle.json").read_text())}
    asked = [q for q in plain if oracle[q]]
    reworded = [q for q in asked if plain[q] != other[q]]
    out = S / "runs" / label
    out.mkdir(parents=True, exist_ok=True)
    rows = {}
    for qid in asked:
        if "SPIKE_TRACE_ON" in memo.env:
            memo.env["SPIKE_TRACE"] = str(out / f"{qid}.trace.jsonl")
            Path(memo.env["SPIKE_TRACE"]).unlink(missing_ok=True)
        typed = plain[qid] if os.environ.get("QSET") == "plain" else other[qid]
        reply, _ = memo.json("search", "all", typed, "--limit", limit)
        (out / f"{qid}.json").write_text(json.dumps(reply, ensure_ascii=False, indent=1))
        rows[qid] = [names.get(i.get("title", "")) or names.get(mail_name(i.get("ref", "")), i.get("ref")) for i in reply["items"]]
    score = lambda qs: round(sum(len(oracle[q] & set(rows[q][:10])) / len(oracle[q]) for q in qs) / len(qs), 3)
    found = {q: f"{len(oracle[q] & set(rows[q][:10]))}/{len(oracle[q])}" for q in reworded}
    print(json.dumps({"run": label, "reworded@10": score(reworded), "all46@10": score(asked), "per_q": found}))


if __name__ == "__main__":
    main(sys.argv[1], [a.split("=", 1) for a in sys.argv[2:]])
