"""One run of `memo search all` over every cited question of kg-fixture-v3 on a store copy.

usage: run.py <label> <memo bin> <store copy dir> [plain|reworded] [ENV=value ...]
Prints recall@1/5/10 on the 17 reworded questions and on all 46, the words-only hits in the top 10, and p50/p95 of
memo's own `duration_ms`. Replies are kept in runs/<label>/.
"""
import json, statistics, sys
from pathlib import Path

KG = Path("/home/leemour/Projects/AI/cli-testing/.claude/worktrees/kg-10k/performance/agents/knowledge-graph-memory")
sys.path.insert(0, str(KG))
from memo_baseline import Memo, mail_name  # noqa: E402

HERE = Path(__file__).resolve().parent
B = Path.home() / ".cache/wirecat-bench"


def recall(rows, oracle, qs, at):
    return round(sum(len(oracle[q] & set(rows[q][:at])) / len(oracle[q]) for q in qs) / len(qs), 3)


def main(label, binary, store, wording="reworded", *pairs):
    memo = Memo(binary, Path(store))
    memo.env.update(dict(pair.split("=", 1) for pair in pairs))
    names = {f"r{i + 1:04}": json.loads(l)["id"] for i, l in enumerate((B / "kg-fixture-v3/corpus.jsonl").read_text().splitlines())}
    plain = {q["id"]: q["question"] for q in json.loads((B / "kg-fixture-v3/queries.json").read_text())}
    other = {q["id"]: q["question"] for q in json.loads((B / "kg-fixture-v3-paraphrased/queries.json").read_text())}
    oracle = {r["id"]: set(r["required_citations"]) for r in json.loads((B / "kg-fixture-v3/oracle.json").read_text())}
    asked = [q for q in plain if oracle[q]]
    reworded = [q for q in asked if plain[q] != other[q]]
    out = HERE / "runs" / label
    out.mkdir(parents=True, exist_ok=True)
    rows, slots, words_only, durations = {}, 0, 0, []
    for qid in asked:
        typed = plain[qid] if wording == "plain" else other[qid]
        reply, _ = memo.json("search", "all", typed, "--limit", "10")
        (out / f"{qid}.json").write_text(json.dumps(reply, ensure_ascii=False, indent=1))
        items = reply["items"][:10]
        rows[qid] = [names.get(i.get("title", "")) or names.get(mail_name(i.get("ref", "")), i.get("ref")) for i in items]
        slots += len(items)
        words_only += sum(i.get("found_by") == ["words"] for i in items)
        durations.append(reply["meta"]["duration_ms"])
    q = statistics.quantiles(durations, n=20)
    result = {
        "run": label, "wording": wording,
        "reworded": [recall(rows, oracle, reworded, at) for at in (1, 5, 10)],
        "all46": [recall(rows, oracle, asked, at) for at in (1, 5, 10)],
        "words_only": f"{words_only}/{slots}",
        "p50_ms": round(statistics.median(durations)), "p95_ms": round(q[18]),
        "per_q": {qid: f"{len(oracle[qid] & set(rows[qid]))}/{len(oracle[qid])}" for qid in reworded},
    }
    (out / "result.json").write_text(json.dumps(result, indent=1))
    print(json.dumps({k: v for k, v in result.items() if k != "per_q"}))


if __name__ == "__main__":
    main(*sys.argv[1:])
