"""Meaning search alone: one vector per record, the question's vector against them, no word search, no store.

    uv run --with fastembed python3 eval_embeddings.py --fixture ~/.cache/wirecat-bench/lifebench/fixtures/fenghaoran \
        --model intfloat/multilingual-e5-small --output e5-small.json

A copy of knowledge-graph-memory/eval_embeddings.py (branch perf/kg-memory-10k-prep, c5eac56) without the reworded
question set, which LifeBench does not have, and with recall@1 and the top ten ids of every question saved, so
score.py can split the result by question category. A model reads at most its own input length of a record (512
tokens for e5-small), so the end of a long assistant chat is not seen.
"""

import argparse
import json
import time
from pathlib import Path

import numpy as np
from fastembed import TextEmbedding
from fastembed.common.model_description import ModelSource, PoolingType

STYLE = {
    "intfloat/multilingual-e5-small": ("query: ", "passage: "),
    "google/embeddinggemma-300m": ("task: search result | query: ", "title: none | text: "),
}


def model_for(name):
    if name == "intfloat/multilingual-e5-small" and name not in {m["model"] for m in TextEmbedding.list_supported_models()}:
        TextEmbedding.add_custom_model(model=name, pooling=PoolingType.MEAN, normalization=True, dim=384,
                                       sources=ModelSource(hf=name), model_file="onnx/model.onnx")
    return TextEmbedding(name, threads=4)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", type=Path, required=True, help="new file for the per-question top ten")
    args = parser.parse_args()
    records = [json.loads(line) for line in (args.fixture / "corpus.jsonl").read_text().splitlines()]
    ids = [record["id"] for record in records]
    queries = json.loads((args.fixture / "queries.json").read_text())
    query_prefix, passage_prefix = STYLE.get(args.model, ("", ""))
    model = model_for(args.model)
    started = time.time()
    corpus = np.array(list(model.embed([passage_prefix + record["text"] for record in records], batch_size=32)))
    indexed = time.time() - started
    started = time.time()
    vectors = np.array(list(model.embed([query_prefix + query["question"] for query in queries])))
    order = np.argsort(-(vectors @ corpus.T), axis=1)[:, :10]
    rows = [{"id": query["id"], "hits": [ids[j] for j in order[i]]} for i, query in enumerate(queries)]
    result = {"model": args.model, "records": len(ids), "questions": len(queries), "index_seconds": round(indexed, 1),
              "query_seconds": round(time.time() - started, 1), "runs": {f"vectors only ({args.model})": rows}}
    with args.output.open("x") as out:
        out.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k != "runs"}))


if __name__ == "__main__":
    main()
