"""Runs runtime.mjs for WebAssembly and native at several thread counts, alternating, and compares their answers.
Usage: python compare.py <@wirecat/cli-core dir> <node_modules with onnxruntime-node> <out.json> [repeats]"""
import json
import math
import os
import statistics
import subprocess
import sys
import tempfile

core, modules, output = sys.argv[1:4]
repeats = int(sys.argv[4]) if len(sys.argv) > 4 else 3
here = os.path.dirname(os.path.abspath(__file__))
configs = [("wasm", 8), ("wasm", 4), ("native", 1), ("native", 2), ("native", 4), ("native", 8), ("native", 12)]
work = tempfile.mkdtemp(prefix="rerank-runtime-")
runs = []
for repeat in range(repeats):
  for runtime, threads in configs:
    vectors = f"{work}/{runtime}-{threads}.json"
    done = subprocess.run(["node", f"{here}/runtime.mjs", core, modules, runtime, str(threads), vectors],
                          capture_output=True, text=True, check=True)
    row = json.loads(done.stdout)
    row["vectors"] = json.load(open(vectors))
    row["load_average"] = os.getloadavg()[0]
    runs.append(row)
    print(runtime, threads, round(row["mixed_one_by_one_ms"]), flush=True)


def ranks(values):
  order = sorted(range(len(values)), key=lambda i: -values[i])
  out = [0] * len(values)
  for rank, i in enumerate(order):
    out[i] = rank
  return out


def spearman(a, b):
  ra, rb = ranks(a), ranks(b)
  n = len(a)
  return 1 - 6 * sum((x - y) ** 2 for x, y in zip(ra, rb)) / (n * (n * n - 1))


def top(values, k):
  return set(sorted(range(len(values)), key=lambda i: -values[i])[:k])


timed = ["import_ms", "e5_load_ms", "e5_query_ms", "e5_20_passages_ms", "mmarco_load_ms", "one_by_one_50_of_40_words_ms",
         "one_by_one_50_of_120_words_ms", "one_by_one_50_of_300_words_ms", "mixed_one_by_one_ms",
         "mixed_batch_10_by_length_ms", "total_ms", "peak_rss_mb"]
summary = {}
for runtime, threads in configs:
  rows = [r for r in runs if r["runtime"] == runtime and r["threads"] == threads]
  summary[f"{runtime}-{threads}"] = {key: round(statistics.median(r[key] for r in rows)) for key in timed}
  summary[f"{runtime}-{threads}"]["batch_largest_score_change"] = rows[0]["batch_largest_score_change"]
  summary[f"{runtime}-{threads}"]["same_pair"] = rows[0]["same_pair"]

wasm = next(r for r in runs if r["runtime"] == "wasm" and r["threads"] == 8)
agreement = {}
for runtime, threads in configs:
  other = next(r for r in runs if r["runtime"] == runtime and r["threads"] == threads)
  a, b = wasm["mixed_scores"], other["mixed_scores"]
  cosines = [sum(x * y for x, y in zip(u, v)) for u, v in zip(wasm["vectors"], other["vectors"])]
  agreement[f"{runtime}-{threads}"] = {
    "reranker_spearman_vs_wasm8": round(spearman(a, b), 4),
    "reranker_top5_shared_of_5": len(top(a, 5) & top(b, 5)),
    "reranker_top10_shared_of_10": len(top(a, 10) & top(b, 10)),
    "reranker_largest_score_change": round(max(abs(x - y) for x, y in zip(a, b)), 3),
    "e5_lowest_cosine_vs_wasm8": round(min(cosines), 5),
  }
repeat_noise = [r for r in runs if r["runtime"] == "native" and r["threads"] == 8]
agreement["native-8_between_its_own_runs_spearman"] = round(
  spearman(repeat_noise[0]["mixed_scores"], repeat_noise[-1]["mixed_scores"]), 4)

result = {"core": core.split("/cli-core/")[0].split("@wirecat/cli-core/")[-1], "repeats": repeats,
          "load_average_range": [min(r["load_average"] for r in runs), max(r["load_average"] for r in runs)],
          "summary": summary, "agreement": agreement}
json.dump(result, open(output, "w"), indent=1)
print(json.dumps({"summary": summary, "agreement": agreement}, indent=1))
