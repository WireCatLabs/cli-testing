"""Meaning search alone, model against model: which local embedding model finds the record when the question
uses other words? No word search, no store, no answer model; everything runs on this machine.

    uv run --with fastembed python3 eval_embeddings.py --fixture ~/.cache/wirecat-bench/kg-fixture-v3 \
        --paraphrased ~/.cache/wirecat-bench/kg-fixture-v3-paraphrased --model intfloat/multilingual-e5-large

Scores recall@5 and @10 over the questions that have a source record: all of them with the record's words,
and the reworded ones both ways. The corpus may be an enriched one (enrich_records.py); questions and key are
the fixture's.
"""

import argparse
import json
import time
from pathlib import Path

import numpy as np
from fastembed import TextEmbedding
from fastembed.common.model_description import ModelSource, PoolingType

# Prefixes each model was trained with; a query without its prefix scores lower.
STYLE = {
    "intfloat/multilingual-e5-small": ("query: ", "passage: "),
    "intfloat/multilingual-e5-large": ("query: ", "passage: "),
    # The prompts memo would use for it (cli-core src/embeddings/models.ts) and the model card gives.
    "google/embeddinggemma-300m": ("task: search result | query: ", "title: none | text: "),
    "Qwen/Qwen3-Embedding-0.6B-Q": ("Instruct: Given a question, retrieve the record that answers it\nQuery: ", ""),
    "Qwen/Qwen3-Embedding-0.6B": ("Instruct: Given a question, retrieve the record that answers it\nQuery: ", ""),
}


def model_for(name):
    if name == "intfloat/multilingual-e5-small" and name not in {m["model"] for m in TextEmbedding.list_supported_models()}:
        # The model memo ships (8-bit there); fastembed does not list it, so it is added from its Hugging Face ONNX.
        TextEmbedding.add_custom_model(model=name, pooling=PoolingType.MEAN, normalization=True, dim=384,
                                       sources=ModelSource(hf=name), model_file="onnx/model.onnx")
    return TextEmbedding(name, threads=4)


def recall(order, sources, k):
    found = [len(set(order[i][:k]) & sources[i]) / len(sources[i]) for i in range(len(order))]
    return round(sum(found) / len(found), 2)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--paraphrased", type=Path, required=True)
    parser.add_argument("--corpus", type=Path, help="another corpus.jsonl with the same ids, e.g. an enriched one")
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    records = [json.loads(line) for line in ((args.corpus or args.fixture / "corpus.jsonl").read_text().splitlines())]
    ids = [record["id"] for record in records]
    oracle = {row["id"]: set(row["required_citations"]) for row in json.loads((args.fixture / "oracle.json").read_text())}
    plain = {q["id"]: q["question"] for q in json.loads((args.fixture / "queries.json").read_text())}
    other = {q["id"]: q["question"] for q in json.loads((args.paraphrased / "queries.json").read_text())}
    reworded = [qid for qid in plain if plain[qid] != other[qid] and oracle[qid]]
    asked = [qid for qid in plain if oracle[qid]]
    query_prefix, passage_prefix = STYLE.get(args.model, ("", ""))
    model = model_for(args.model)
    started = time.time()
    corpus = np.array(list(model.embed([passage_prefix + record["text"] for record in records], batch_size=64)))
    indexed = time.time() - started

    def search(questions):
        vectors = np.array(list(model.embed([query_prefix + text for text in questions])))
        scores = vectors @ corpus.T
        return [[ids[j] for j in np.argsort(-row)[:10]] for row in scores]

    result = {"model": args.model, "corpus": str(args.corpus or args.fixture / "corpus.jsonl"), "records": len(ids),
              "index_seconds": round(indexed, 1)}
    for label, qids, texts in (("all, record's words", asked, plain), ("reworded, record's words", reworded, plain),
                               ("reworded, other words", reworded, other)):
        order = search([texts[qid] for qid in qids])
        result[label] = {"questions": len(qids), "recall@5": recall(order, [oracle[q] for q in qids], 5),
                         "recall@10": recall(order, [oracle[q] for q in qids], 10)}
    print(json.dumps(result))


if __name__ == "__main__":
    main()
