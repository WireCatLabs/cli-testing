"""EmbeddingGemma with and without write-time enrichment, reusing paid-for enrichments and computed vectors.

Copies the whole-set store of enrich_bench.py (its 9,840 enrichments) twice. Both copies get the EmbeddingGemma
vectors another run already computed for the records' own chunks (same text, same hash), so only the enrichment chunks
are embedded here. One copy keeps the enrichments ("on"); the other deletes them with `memo models consents revoke`
("off"). Nothing is sent to a provider. Then both question sets are asked of each copy.

    python3 gemma_bench.py --source ~/.cache/wirecat-bench/memo-enrichment-full \\
      --vectors ~/.cache/wirecat-bench/memo-src-embeddinggemma-v3-paraphrased \\
      --fixture ~/.cache/wirecat-bench/kg-fixture-v3 --paraphrased ~/.cache/wirecat-bench/kg-fixture-v3-paraphrased \\
      --output <new dir> --memo <memo.js> --core <cli-core checkout>
"""

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import enrich_bench as bench  # noqa: E402

MODEL = "embeddinggemma"
KEY = "local:embeddinggemma:768"


def prepare(source, vectors, copy, memo_binary, core):
    shutil.copytree(source / "memo", copy / "memo", symlinks=True)
    memo = bench.Memo(memo_binary, copy / "memo")
    models = Path(memo.env["WIRECAT_STATE_DIR"]) / "models" / "text"
    if not (models / MODEL).exists():
        (models / MODEL).symlink_to(vectors / "memo" / "wirecat-state" / "models" / "text" / MODEL)
    config = Path(memo.env["WIRECAT_CONFIG_DIR"]) / "config.json"
    current = json.loads(config.read_text()) if config.exists() else {}
    current.pop("enrichment", None)
    current["text_models"] = {**current.get("text_models", {}), "use": MODEL}
    config.write_text(json.dumps(current, indent=2) + "\n")
    memo.env["MEMO_EMBEDDING_MODEL"] = MODEL
    path = memo.json("store", "info")[0]["item"]["path"]
    done = subprocess.run(["node", str(bench.HERE / "copy_vectors.mjs"), core, path,
                           str(vectors / "memo/wirecat-state/wirecat.db"), KEY], capture_output=True, text=True,
                          check=False)
    if done.returncode != 0:
        raise RuntimeError(f"copy_vectors.mjs exited {done.returncode}: {done.stderr.strip()[-2000:]}")
    copied = json.loads(done.stdout)["copied"]
    return memo, copied


def embed_all(memo, core):
    done = subprocess.run(["node", str(bench.HERE / "gemma_embed.mjs"), core], env=memo.env, capture_output=True,
                          text=True, check=False)
    if done.returncode != 0:
        raise RuntimeError(f"gemma_embed.mjs exited {done.returncode}: {done.stderr.strip()[-2000:]}")
    return json.loads(done.stdout.strip().splitlines()[-1])


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    for name in ("--source", "--vectors", "--fixture", "--paraphrased", "--output"):
        parser.add_argument(name, type=Path, required=True)
    parser.add_argument("--memo", required=True)
    parser.add_argument("--core", required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    records = [json.loads(line) for line in (args.fixture / "corpus.jsonl").read_text().splitlines()]
    plain = json.loads((args.fixture / "queries.json").read_text())
    other = json.loads((args.paraphrased / "queries.json").read_text())
    oracle = json.loads((args.fixture / "oracle.json").read_text())
    names = {bench.name_of(index): record["id"] for index, record in enumerate(records)}
    rewritten = set(bench.reworded_ids(plain, other, oracle))
    results = {"model": MODEL, "reworded": sorted(rewritten), "copies": {}, "scores": []}
    runs = {}
    for label in ("off", "on"):
        copy = args.output / label
        memo, copied = prepare(args.source.resolve(), args.vectors.resolve(), copy, args.memo, args.core)
        cleared = None
        if label == "off":
            cleared = memo.json("models", "consents", "revoke")[0]["item"]["deleted"]
        started = time.perf_counter()
        embedded = embed_all(memo, args.core)
        state = memo.json("models", "consents", "show")[0]["item"]
        results["copies"][label] = {"vectors_copied": copied, "enrichments_deleted": cleared, "embedded": embedded,
                                    "embed_s": time.perf_counter() - started, "enriched": state["enriched"]}
        raw = copy / "raw"
        raw.mkdir()
        for set_name, questions in (("record's words", plain), ("other words", other)):
            slug = set_name.split("'")[0].replace(" ", "-")
            runs[f"gemma {label}, {set_name}, as typed"] = bench.query_all(memo, names, questions, f"{slug}-typed", [],
                                                                         lambda text: text, raw)
            runs[f"gemma {label}, {set_name}, OR"] = bench.query_all(memo, names, questions, f"{slug}-or", [],
                                                                   bench.or_query, raw)
    for label, rows in runs.items():
        results["scores"].append({**bench.score_run(label, rows, oracle), "subset": "all"})
        results["scores"].append({**bench.score_run(label, [row for row in rows if row["id"] in rewritten], oracle),
                                  "subset": "reworded"})
    (args.output / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")
    (args.output / "per-query.json").write_text(json.dumps(runs, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(results["copies"]))
    for row in results["scores"]:
        print(f"| {row['run']} ({row['subset']}) | {row['questions_scored']} | {row['recall@1']:.2f} | "
              f"{row['recall@5']:.2f} | {row['recall@10']:.2f} |")


if __name__ == "__main__":
    main()
