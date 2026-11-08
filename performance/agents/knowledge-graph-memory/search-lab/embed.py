"""Embed a fixture's corpus once per model and save the vectors, so every search hypothesis reuses them.

    uv run --with fastembed==0.9.1 python3 -I embed.py --fixture ~/.cache/wirecat-bench/kg-fixture-v3 \
        --model google/embeddinggemma-300m --name v3 --cache cache

Writes <cache>/<name>-<model>-<mode>.npy (one normalised row per record, corpus order) and a .ids.json beside it.
Embeds in shards of 500 and keeps them, so a stopped run resumes where it was. Mode "chunks" embeds only the pieces
of records longer than 600 characters and writes which record each piece belongs to (.owner.json).
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
SHARD = 500


def model_for(name, threads):
    if name == "intfloat/multilingual-e5-small" and name not in {m["model"] for m in TextEmbedding.list_supported_models()}:
        TextEmbedding.add_custom_model(model=name, pooling=PoolingType.MEAN, normalization=True, dim=384,
                                       sources=ModelSource(hf=name), model_file="onnx/model.onnx")
    return TextEmbedding(name, threads=threads)


def passage(record, model, mode):
    if mode == "title" and model == "google/embeddinggemma-300m":
        return f"title: {record.get('title') or 'none'} | text: {record['text']}"
    return STYLE.get(model, ("", ""))[1] + record["text"]


def chunks(text, size=500):
    """Pieces of about size characters on line boundaries, for records longer than 600 characters."""
    if len(text) <= 600:
        return []
    out, cur = [], ""
    for line in text.splitlines():
        while len(line) > size:
            out.append((cur + "\n" + line[:size]).strip()) if cur else out.append(line[:size])
            cur, line = "", line[size:]
        if len(cur) + len(line) > size and cur:
            out.append(cur)
            cur = ""
        cur = (cur + "\n" + line).strip()
    if cur:
        out.append(cur)
    return out


def slug(model):
    return model.split("/")[-1]


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--mode", choices=["text", "title", "chunks"], default="text")
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--batch", type=int, default=16)
    args = parser.parse_args()
    records = [json.loads(line) for line in (args.fixture / "corpus.jsonl").read_text().splitlines()]
    owner = None
    if args.mode == "chunks":
        pieces = [(i, c) for i, r in enumerate(records) for c in chunks(r["text"])]
        owner = [i for i, _ in pieces]
        ids = [r["id"] for r in records]
        records = [{"text": c, "id": ids[i]} for i, c in pieces]
        print(f"{len(records)} chunks from {len(set(owner))} long records", flush=True)
    stem = args.cache / f"{args.name}-{slug(args.model)}-{args.mode}"
    if Path(f"{stem}.npy").exists():
        print(f"{stem}.npy exists")
        return
    shards = args.cache / f"{stem.name}.shards"
    shards.mkdir(parents=True, exist_ok=True)
    model = model_for(args.model, args.threads)
    started = time.time()
    for start in range(0, len(records), SHARD):
        part = shards / f"{start:06d}.npy"
        if part.exists():
            continue
        texts = [passage(r, args.model, args.mode) for r in records[start:start + SHARD]]
        np.save(part, np.array(list(model.embed(texts, batch_size=args.batch)), dtype=np.float32))
        print(f"{args.name} {start + len(texts)}/{len(records)} {time.time() - started:.0f}s", flush=True)
    vectors = np.concatenate([np.load(shards / f"{s:06d}.npy") for s in range(0, len(records), SHARD)])
    np.save(f"{stem}.npy", vectors)
    Path(f"{stem}.ids.json").write_text(json.dumps([r["id"] for r in records]))
    if owner is not None:
        Path(f"{stem}.owner.json").write_text(json.dumps(owner))
    print(json.dumps({"name": args.name, "model": args.model, "mode": args.mode, "records": len(records),
                      "seconds": round(time.time() - started)}))


if __name__ == "__main__":
    main()
