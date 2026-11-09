"""Meaning search alone, model against model, on the v3 records or a LifeBench persona. Vectors only: no word search,
no store, no answer model, nothing leaves the machine.

    uv run --with fastembed==0.9.1 python3 -I eval_models.py --model bge-m3 --cache-dir <models> \
        --fixture ~/.cache/wirecat-bench/kg-fixture-v3 --paraphrased ~/.cache/wirecat-bench/kg-fixture-v3-paraphrased \
        --output v3-bge-m3.json
    uv run --with fastembed==0.9.1 python3 -I eval_models.py --model bge-m3 --cache-dir <models> --check

A copy of ../eval_embeddings.py with more models, the LifeBench fixture (no reworded set), hit@10, and the top ten
of every question saved in the "runs" shape lifebench/score.py reads. Records are embedded shortest first so a
batch pads to similar lengths; the vectors are the same, only the time drops. --check embeds the example sentences
from the model card and prints the scores the card prints next to them, to catch wrong pooling or a wrong prefix.
"""

import argparse
import json
import resource
import time
from pathlib import Path

import numpy as np
from fastembed import TextEmbedding
from fastembed.common.model_description import ModelSource, PoolingType

QWEN_TASK = "Instruct: Given a question, retrieve the record that answers it\nQuery: "
QWEN_CARD = "Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:"
QWEN_CHECK = (["What is the capital of China?", "Explain gravity"],
              ["The capital of China is Beijing.",
               "Gravity is a force that attracts two bodies towards each other. It gives weight to physical objects and "
               "is responsible for the movement of planets around the sun."],
              [[0.7646, 0.1414], [0.1355, 0.6000]])

# name: fastembed model, custom registration or None, query prefix, passage prefix, card check, card prefix for it
MODELS = {
    "e5-small": ("intfloat/multilingual-e5-small",
                 dict(pooling=PoolingType.MEAN, dim=384, sources=ModelSource(hf="intfloat/multilingual-e5-small"),
                      model_file="onnx/model.onnx"),
                 "query: ", "passage: ", None, None),
    "embeddinggemma-300m": ("google/embeddinggemma-300m", None,
                            "task: search result | query: ", "title: none | text: ", None, None),
    "qwen3-0.6b": ("Qwen/Qwen3-Embedding-0.6B", None, QWEN_TASK, "", QWEN_CHECK, QWEN_CARD),
    "qwen3-0.6b-card-prompt": ("Qwen/Qwen3-Embedding-0.6B", None, QWEN_CARD, "", QWEN_CHECK, QWEN_CARD),
    "qwen3-0.6b-q":("Qwen/Qwen3-Embedding-0.6B-Q", None, QWEN_TASK, "", QWEN_CHECK, QWEN_CARD),
    "bge-m3": ("BAAI/bge-m3",
               dict(pooling=PoolingType.CLS, dim=1024, sources=ModelSource(hf="BAAI/bge-m3"),
                    model_file="onnx/model.onnx", additional_files=["onnx/model.onnx_data"]),
               "", "",
               (["What is BGE M3?", "Defination of BM25"],
                ["BGE M3 is an embedding model supporting dense retrieval, lexical matching and multi-vector "
                 "interaction.",
                 "BM25 is a bag-of-words retrieval function that ranks a set of documents based on the query terms "
                 "appearing in each document"],
                [[0.6265, 0.3477], [0.3499, 0.678]]), ""),
    "arctic-l-v2": ("Snowflake/snowflake-arctic-embed-l-v2.0",
                    dict(pooling=PoolingType.CLS, dim=1024,
                         sources=ModelSource(hf="Snowflake/snowflake-arctic-embed-l-v2.0"),
                         model_file="onnx/model.onnx", additional_files=["onnx/model.onnx_data"]),
                    "query: ", "",
                    (["what is snowflake?", "Where can I get the best tacos?"],
                     ["The Data Cloud!", "Mexico City of Course!"], [[0.2715, 0.0661], [0.1250, 0.2797]]), "query: "),
    # Alibaba's own repo needs trust_remote_code (it runs Python from the repo); this is onnx-community's export.
    "gte-multilingual-base": ("onnx-community/gte-multilingual-base",
                              dict(pooling=PoolingType.CLS, dim=768,
                                   sources=ModelSource(hf="onnx-community/gte-multilingual-base"),
                                   model_file="onnx/model.onnx"),
                              "", "",
                              (["what is the capital of China?"],
                               ["how to implement quick sort in python?", "北京", "快排算法介绍"],
                               [[0.3017, 0.7504, 0.3203]]), ""),
}


def model_for(name, cache_dir, threads):
    model, custom = MODELS[name][:2]
    if custom and model not in {m["model"] for m in TextEmbedding.list_supported_models()}:
        TextEmbedding.add_custom_model(model=model, normalization=True, **custom)
    return TextEmbedding(model, cache_dir=str(cache_dir) if cache_dir else None, threads=threads)


def embed(model, texts, batch_size):
    order = sorted(range(len(texts)), key=lambda i: len(texts[i]))
    vectors = np.array(list(model.embed([texts[i] for i in order], batch_size=batch_size)))
    out = np.empty_like(vectors)
    out[order] = vectors
    return out


def check(model, name):
    queries, documents, expected = MODELS[name][4]
    prefix = MODELS[name][5]
    if prefix is None:
        raise SystemExit(f"{name}: no card example")
    scores = embed(model, [prefix + q for q in queries], 8) @ embed(model, documents, 8).T
    print(json.dumps({"model": name, "scores": np.round(scores, 4).tolist(), "card": expected,
                      "max_difference": round(float(np.abs(scores - np.array(expected)).max()), 4)}))


def scored(order, ids, gold, qids):
    rows = [(gold[q], [ids[j] for j in order[i]]) for i, q in enumerate(qids)]
    return {"questions": len(rows),
            "recall@5": round(sum(len(g & set(h[:5])) / len(g) for g, h in rows) / len(rows), 3),
            "recall@10": round(sum(len(g & set(h[:10])) / len(g) for g, h in rows) / len(rows), 3),
            "hit@10": round(sum(bool(g & set(h[:10])) for g, h in rows) / len(rows), 3)}


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--model", required=True, choices=MODELS)
    parser.add_argument("--fixture", type=Path)
    parser.add_argument("--paraphrased", type=Path, help="the v3 fixture with 17 questions reworded")
    parser.add_argument("--output", type=Path, help="new file for the scores and every question's top ten")
    parser.add_argument("--cache-dir", type=Path, help="where fastembed downloads the model")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--check", action="store_true", help="only score the model card's example sentences")
    args = parser.parse_args()
    model = model_for(args.model, args.cache_dir, args.threads)
    if args.check:
        return check(model, args.model)
    records = [json.loads(line) for line in (args.fixture / "corpus.jsonl").read_text().splitlines()]
    ids = [record["id"] for record in records]
    gold = {row["id"]: set(row["required_citations"]) for row in json.loads((args.fixture / "oracle.json").read_text())}
    plain = {q["id"]: q["question"] for q in json.loads((args.fixture / "queries.json").read_text())}
    query_prefix, passage_prefix = MODELS[args.model][2:4]
    started = time.time()
    corpus = embed(model, [passage_prefix + record["text"] for record in records], args.batch_size)
    indexed = time.time() - started

    def top_ten(texts):
        scores = embed(model, [query_prefix + text for text in texts], args.batch_size) @ corpus.T
        return np.argsort(-scores, axis=1)[:, :10]

    started = time.time()
    order = top_ten(list(plain.values()))
    asked = [q for q in plain if gold[q]]
    result = {"model": MODELS[args.model][0], "name": args.model, "query_prefix": query_prefix,
              "passage_prefix": passage_prefix, "records": len(ids), "index_seconds": round(indexed, 1),
              "query_seconds": round(time.time() - started, 1), "batch_size": args.batch_size,
              "threads": args.threads, "scores": {}}
    position = {q: i for i, q in enumerate(plain)}
    result["scores"]["all, record's words"] = scored(order[[position[q] for q in asked]], ids, gold, asked)
    runs = {f"vectors only ({args.model})": [{"id": q, "hits": [ids[j] for j in order[position[q]]]} for q in plain]}
    if args.paraphrased:
        other = {q["id"]: q["question"] for q in json.loads((args.paraphrased / "queries.json").read_text())}
        reworded = [q for q in plain if plain[q] != other[q] and gold[q]]
        result["scores"]["reworded, record's words"] = scored(order[[position[q] for q in reworded]], ids, gold,
                                                              reworded)
        other_order = top_ten([other[q] for q in reworded])
        result["scores"]["reworded, other words"] = scored(other_order, ids, gold, reworded)
        runs[f"vectors only ({args.model}), reworded in other words"] = [
            {"id": q, "hits": [ids[j] for j in other_order[i]]} for i, q in enumerate(reworded)]
    result["peak_rss_mb"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)
    print(json.dumps(result))
    if args.output:
        with args.output.open("x") as out:
            out.write(json.dumps({**result, "runs": runs}, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
