"""Added latency of scoring words-only hits: each of the 46 questions with scoring on and off, alternating, `rounds`
times; memo's own `duration_ms`, so process start-up is left out. usage: latency.py <memo bin> <store copy> <rounds> [ENV=v ...]
"""
import json, statistics, sys
from pathlib import Path

KG = Path("/home/leemour/Projects/AI/cli-testing/.claude/worktrees/kg-10k/performance/agents/knowledge-graph-memory")
sys.path.insert(0, str(KG))
from memo_baseline import Memo  # noqa: E402

B = Path.home() / ".cache/wirecat-bench"


def main(binary, store, rounds, *pairs):
    base = dict(pair.split("=", 1) for pair in pairs)
    oracle = {r["id"]: r["required_citations"] for r in json.loads((B / "kg-fixture-v3/oracle.json").read_text())}
    questions = [q["question"] for q in json.loads((B / "kg-fixture-v3-paraphrased/queries.json").read_text()) if oracle[q["id"]]]
    times = {"on": [], "off": []}
    for n in range(int(rounds)):
        for question in questions:
            for mode in (("on", "off") if n % 2 == 0 else ("off", "on")):
                memo = Memo(binary, Path(store))
                memo.env.update(base | ({"SPIKE_NOSCORE": "1"} if mode == "off" else {}))
                try:
                    reply, _ = memo.json("search", "all", question, "--limit", "10")
                    times[mode].append(reply["meta"]["duration_ms"])
                except RuntimeError:
                    times[mode].append(None)
    for mode, values in times.items():
        ok = sorted(v for v in values if v is not None)
        print(json.dumps({"scoring": mode, "n": len(ok), "timeouts": values.count(None),
                          "p50_ms": round(statistics.median(ok)), "p95_ms": round(statistics.quantiles(ok, n=20)[18])}))
    pairs_ok = [(a, b) for a, b in zip(times["on"], times["off"]) if a is not None and b is not None]
    print(json.dumps({"added_p50_ms": round(statistics.median(a - b for a, b in pairs_ok))}))


if __name__ == "__main__":
    main(*sys.argv[1:])
