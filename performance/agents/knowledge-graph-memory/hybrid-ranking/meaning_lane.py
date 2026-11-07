"""Mail meaning ranking only, outside memo: which part of memo's meaning lane loses the reworded questions?

Ranks the 4,372 mails of a v3 store against each reworded question, with one piece swapped at a time: the vectors
memo stored, the text they were made from (memo embeds "<sender>: <subject>\\n\\n<body>"), the 8-bit model memo ships
against full precision, the query prefix.

    uv run --with fastembed --with onnxruntime --with tokenizers python3 -I meaning_lane.py \\
        ~/.cache/wirecat-bench/memo-v3-baseline/memo ~/.cache/wirecat-bench/kg-fixture-v3-paraphrased
"""
import json
import re
import sqlite3
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from fastembed import TextEmbedding
from fastembed.common.model_description import ModelSource, PoolingType
from tokenizers import Tokenizer

store, fixture = Path(sys.argv[1]), Path(sys.argv[2])
models = store / "wirecat-state/models/text/e5-small"


class Quantized:
    """memo's e5-small: the 8-bit ONNX file and tokenizer it downloaded, mean pooled and normalised."""

    def __init__(self):
        self.tok = Tokenizer.from_file(str(models / "tokenizer.json"))
        self.tok.enable_truncation(512)
        self.tok.enable_padding()
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        self.session = ort.InferenceSession(str(models / "onnx/model_quantized.onnx"), options)
        self.inputs = {i.name for i in self.session.get_inputs()}

    def embed(self, texts, batch=64):
        out = []
        for start in range(0, len(texts), batch):
            enc = self.tok.encode_batch(texts[start:start + batch])
            ids = np.array([e.ids for e in enc], dtype=np.int64)
            mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
            feed = {"input_ids": ids, "attention_mask": mask}
            if "token_type_ids" in self.inputs:
                feed["token_type_ids"] = np.zeros_like(ids)
            hidden = self.session.run(None, feed)[0]
            pooled = (hidden * mask[..., None]).sum(1) / mask.sum(1, keepdims=True)
            out.append(pooled / np.linalg.norm(pooled, axis=1, keepdims=True))
        return np.vstack(out)


class Full:
    def __init__(self):
        name = "intfloat/multilingual-e5-small"
        TextEmbedding.add_custom_model(model=name, pooling=PoolingType.MEAN, normalization=True, dim=384,
                                       sources=ModelSource(hf=name), model_file="onnx/model.onnx")
        self.model = TextEmbedding(name, threads=4)

    def embed(self, texts):
        return np.array(list(self.model.embed(texts, batch_size=64)))


def plain_words(text):
    return re.sub(r"\s+", " ", re.sub(r"[()\"+\-~^*?\\\[\]{}!|&]", " ", text)).strip()


records = [json.loads(line) for line in (fixture / "corpus.jsonl").read_text().splitlines()]
by_name = {f"r{i + 1:04}": r for i, r in enumerate(records)}
# The harness names each mail by its subject, r0001…; the record's own first sentence is in its text.
oracle = {r["id"]: set(r["required_citations"]) for r in json.loads((fixture / "oracle.json").read_text())}
para = {k["id"] for k in json.loads((fixture / "kinds.json").read_text()) if k.get("paraphrased")}
questions = [q for q in json.loads((fixture / "queries.json").read_text()) if q["id"] in para and oracle[q["id"]]]

db = sqlite3.connect(f"file:{store}/wirecat-state/wirecat.db?mode=ro", uri=True)
# One piece per email here (every record is short), in the order threadPieces cuts a thread.
emails = db.execute("""SELECT e.subject, e.email_thread_id, row_number() OVER (PARTITION BY e.email_thread_id
                        ORDER BY coalesce(e.sent_at, e.received_at), e.id) - 1 FROM emails e""").fetchall()
stored = {(t, p): np.frombuffer(v, dtype=np.float32) for t, p, v in db.execute(
    """SELECT k.chunkable_id, k.position, v.vector FROM chunks k JOIN embeddings v ON v.content_hash = k.content_hash
        WHERE k.chunkable_type = 'email_thread'""")}
mail = [(subject, by_name[subject]["id"], stored.get((thread, position))) for subject, thread, position in emails]
mail = [m for m in mail if m[2] is not None]
ids = [m[1] for m in mail]
texts = [by_name[m[0]]["text"] for m in mail]
print(f"{len(mail)} mails with a stored vector of {len(emails)}", flush=True)


def author(text):
    found = re.search(r"(?:^|\. )([A-Z][a-z]+ [A-Z][a-z]+):", text)
    return found.group(1) if found else "Notifications"


q8, full = Quantized(), Full()
passages = {
    "stored by memo": np.vstack([m[2] for m in mail]),
    "Synthetic Sender: subject + text": q8.embed(
        [f"passage: Synthetic Sender: {m[0]}\n\n{t}" for m, t in zip(mail, texts)]),
    "author: subject + text": q8.embed([f"passage: {author(t)}: {m[0]}\n\n{t}" for m, t in zip(mail, texts)]),
    "subject + text, no sender": q8.embed([f"passage: {m[0]}\n\n{t}" for m, t in zip(mail, texts)]),
    "record text": q8.embed(["passage: " + t for t in texts]),
    "record text, full precision": full.embed(["passage: " + t for t in texts]),
}
asked = [plain_words(q["question"]) for q in questions]
queries = {"8-bit": q8.embed(["query: " + t for t in asked]), "full": full.embed(["query: " + t for t in asked]),
           "8-bit, no prefix": q8.embed(asked)}


def ranks(qv, pv):
    order = np.argsort(-(qv @ pv.T), axis=1)
    out = []
    for q, row in zip(questions, order):
        ranked = [ids[j] for j in row]
        out.append([ranked.index(s) if s in ranked else None for s in oracle[q["id"]] if s in ids])
    return out


for p_label, pv in passages.items():
    for q_label, qv in queries.items():
        # Every query form against memo's own vectors; a rebuilt text only with the query of its own precision.
        if not p_label.startswith("stored") and q_label != ("full" if "full" in p_label else "8-bit"):
            continue
        rs = ranks(qv, pv)
        flat = [r for row in rs for r in row]
        at = {k: sum(r is not None and r < k for r in flat) / len(flat) for k in (5, 10, 30)}
        print(f"{p_label:34} | query {q_label:16} | mail answers {len(flat)} | in top5 {at[5]:.2f} top10 {at[10]:.2f} "
              f"top30 {at[30]:.2f} | median rank {sorted(flat)[len(flat) // 2]}", flush=True)
