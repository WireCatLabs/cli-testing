"""Ingestion time and cost per engine over the 10 conversations, from the ingest records."""
import glob
import json
from pathlib import Path

IN = Path("/var/tmp/locomo-bench/runs/ingest")
GPT4O_MINI = (0.15, 0.075, 0.60)  # input, cached input, output, USD per 1M tokens (OpenAI pricing page)
rows = {}
hs = [json.loads(Path(p).read_text()) for p in sorted(glob.glob(str(IN / "hindsight-conv-*.json")))]
cost = 0.0
for r in hs:
    tokens = r["llm"]["buckets"][-1]["tokens"] if r["llm"]["buckets"] else {}
    fresh = tokens.get("input", 0) - tokens.get("cached", 0)
    cost += (fresh * GPT4O_MINI[0] + tokens.get("cached", 0) * GPT4O_MINI[1] + tokens.get("output", 0) * GPT4O_MINI[2]) / 1e6
rows["hindsight"] = {"conversations": len(hs), "seconds_total": sum(r["until_consolidated_s"] for r in hs),
                     "seconds_per_conv": [r["until_consolidated_s"] for r in hs], "usd": round(cost, 3),
                     "note": "llm stats read at ingest end; later reflect calls are not included"}
hn = [json.loads(Path(p).read_text()) for p in sorted(glob.glob(str(IN / "honcho-conv-*.json")))]
rows["honcho"] = {"conversations": len(hn), "seconds_total": sum(r["until_derived_s"] for r in hn),
                  "seconds_per_conv": [r["until_derived_s"] for r in hn], "usd": "not reported by Honcho"}
sm = []
for p in glob.glob(str(IN / "supermemory/*/*/results.json")):
    r = json.loads(Path(p).read_text())
    sm.append({"set": Path(p).parts[-3], "conv": Path(p).parts[-2], "s": r["ingest"].get("until_indexed_s"),
               "memories": (r["ingest"].get("at_search") or {}).get("memories"), "docs": (r["ingest"].get("at_search") or {}).get("documents")})
rows["supermemory"] = {"stores": len(sm), "median_s": sorted(x["s"] for x in sm)[len(sm) // 2] if sm else None,
                       "memories_per_store": sorted(x["memories"] or 0 for x in sm), "usd": "free monthly credit"}
print(json.dumps(rows, indent=2))
(IN / "summary.json").write_text(json.dumps({"engines": rows, "supermemory_stores": sm}, indent=2) + "\n")
