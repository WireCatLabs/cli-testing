"""Search lab: test ways to rank records over cached vectors, offline, and score every one the same way.

    uv run --with fastembed==0.9.1 python3 -I lab.py queries --cache cache          # embed every query text (heavy)
    uv run --with fastembed==0.9.1 python3 -I lab.py rerank --cache cache --models-dir models \
        --model BAAI/bge-reranker-base --set v3-all,v3-rew --base hybrid                 # cross-encoder pair scores
    uv run --with fastembed==0.9.1 --with anthropic==2.6.0 python3 -I lab.py llmrerank --cache cache --base stackC
    uv run --with fastembed==0.9.1 python3 -I lab.py eval --cache cache --output results.json

Sets: v3-all (46 questions with a source record, the record's words), v3-rew (the 17 questions reworded so they
share no word with their record), lb (LifeBench fenghaoran, 288 answerable), lb-s20 (a fixed 20% of lb, stratified
by first category, for paid hypotheses). recall@10 is the share of a question's gold records in the first ten,
averaged; hit@10 the share of questions with at least one. Corpus vectors come from embed.py, rewrites from
rewrite.py.
"""

import argparse
import json
import re
import sqlite3
import time
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

BENCH = Path.home() / ".cache/wirecat-bench"
V3, V3P = BENCH / "kg-fixture-v3", BENCH / "kg-fixture-v3-paraphrased"
LB = BENCH / "lifebench/fixtures/fenghaoran"
GEMMA, E5 = "google/embeddinggemma-300m", "intfloat/multilingual-e5-small"
STYLE = {
    GEMMA: ("task: search result | query: ", "title: none | text: "),
    E5: ("query: ", "passage: "),
}
GEMMA_PREFIXES = {
    "search": "task: search result | query: ",
    "qa": "task: question answering | query: ",
    "fact": "task: fact checking | query: ",
    "none": "",
}
CATEGORIES = ("Single_hop", "Multi_hop", "Temporal", "Pattern_recognition(Non-declarative)", "Knowledge_update",
              "Causal", "Conflict", "Hidden_info")
STOP = set("""a an the and or of to in on at for by with from as is are was were be been being do does did have has had
i me my we our you your he she it its they them their this that these those what which who whom whose when where why
how much many so far now current currently again about into than then there here can could would should will shall
may might must not no yes if any all some each every one answer like e.g eg please""".split())


def slug(model):
    return model.split("/")[-1]


class Corpus:
    def __init__(self, name, fixture):
        self.name = name
        self.records = [json.loads(line) for line in (fixture / "corpus.jsonl").read_text().splitlines()]
        self.ids = [r["id"] for r in self.records]
        self.index = {rid: i for i, rid in enumerate(self.ids)}
        self.time = np.array([datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00")).timestamp()
                              for r in self.records])
        self._fts = None

    def vectors(self, cache, model, mode="text"):
        stem = cache / f"{self.name}-{slug(model)}-{mode}"
        assert json.loads(Path(f"{stem}.ids.json").read_text()) == self.ids
        return np.load(f"{stem}.npy")

    def fts(self):
        if self._fts is None:
            db = sqlite3.connect(":memory:")
            db.execute("create virtual table r using fts5(body, tokenize='porter unicode61')")
            db.executemany("insert into r(rowid, body) values (?, ?)",
                           [(i, (rec.get("title", "") + "\n" + rec["text"]).strip()) for i, rec in enumerate(self.records)])
            self._fts = db
        return self._fts

    def bm25(self, text, n=100):
        words = [w for w in re.findall(r"\w+", text.lower()) if w not in STOP and len(w) > 1]
        if not words:
            return [], []
        match = " OR ".join(f'"{w}"' for w in dict.fromkeys(words))
        rows = self.fts().execute("select rowid, -bm25(r) from r where r match ? order by bm25(r) limit ?",
                                  (match, n)).fetchall()
        return [r[0] for r in rows], [r[1] for r in rows]


class Question:
    def __init__(self, qid, text, as_of, gold, categories=()):
        self.id, self.text, self.as_of, self.gold, self.categories = qid, text, as_of, gold, list(categories)
        self.as_of_ts = datetime.fromisoformat(as_of.replace("Z", "+00:00")).timestamp()


def sample(questions, share=0.2, seed=20261108):
    """A fixed 20% of the questions, stratified by each question's first category, for paid hypotheses."""
    rng = np.random.default_rng(seed)
    groups = defaultdict(list)
    for q in questions:
        groups[q.categories[0]].append(q)
    picked = set()
    for _, qs in sorted(groups.items()):
        n = max(1, round(share * len(qs)))
        picked.update(q.id for q in rng.choice(qs, n, replace=False))
    return [q for q in questions if q.id in picked]


def load_sets():
    v3 = Corpus("v3", V3)
    oracle = {r["id"]: r for r in json.loads((V3 / "oracle.json").read_text())}
    plain = json.loads((V3 / "queries.json").read_text())
    other = {q["id"]: q["question"] for q in json.loads((V3P / "queries.json").read_text())}
    gold = {qid: {v3.index[c] for c in row["required_citations"]} for qid, row in oracle.items()}
    v3_all = [Question(q["id"], q["question"], q["as_of"], gold[q["id"]]) for q in plain if gold[q["id"]]]
    v3_rew = [Question(q["id"], other[q["id"]], q["as_of"], gold[q["id"]]) for q in plain
              if gold[q["id"]] and other[q["id"]] != q["question"]]
    lb = Corpus("lb", LB)
    lb_q = [Question(q["id"], q["question"], q["as_of"], {lb.index[c] for c in q["required_citations"]},
                     q["categories"]) for q in json.loads((LB / "oracle.json").read_text()) if q["required_citations"]]
    return {"v3-all": (v3, v3_all), "v3-rew": (v3, v3_rew), "lb": (lb, lb_q), "lb-s20": (lb, sample(lb_q))}


# ---------- rewrites and query texts


def rewrites(cache):
    path = cache / "rewrites.json"
    return json.loads(path.read_text()) if path.exists() else {}


def rewrite(rw, kind, q):
    as_of = q.as_of[:10] if kind in ("mqdate", "range") else ""
    return rw.get(f"{kind}\t{as_of}\t{q.text}", {}).get("out", "")


def lines(text):
    out = [re.sub(r"^\s*\d+[.)]\s*", "", line).strip().strip('"') for line in text.splitlines()]
    return [line for line in out if line]


def date_range(rw, q):
    found = re.findall(r"\d{4}-\d{2}-\d{2}", rewrite(rw, "range", q))
    if len(found) < 2:
        return None
    start = datetime.fromisoformat(found[0] + "T00:00:00+00:00").timestamp()
    end = (datetime.fromisoformat(found[1] + "T00:00:00+00:00") + timedelta(days=1)).timestamp()
    return (start, end) if end > start else None


def query_texts(model, q, rw, variant):
    """The strings to embed for one question under one variant, prefixed as the model expects."""
    qp, pp = STYLE[model]
    if variant == "q":
        return [qp + q.text]
    if variant.startswith("prefix-"):
        return [GEMMA_PREFIXES[variant[7:]] + q.text]
    if variant in ("mq", "mqdate"):
        return [qp + q.text] + [qp + line for line in lines(rewrite(rw, variant, q))[:3]]
    if variant == "hyde":
        return [pp + rewrite(rw, "hyde", q)]
    if variant == "hyde-q":
        return [qp + q.text, pp + rewrite(rw, "hyde", q)]
    raise ValueError(variant)


VARIANTS = {GEMMA: ["q", "prefix-qa", "prefix-fact", "prefix-none", "mq", "mqdate", "hyde", "hyde-q"],
            E5: ["q", "mq", "hyde"]}


class QueryVectors:
    def __init__(self, cache, model):
        self.path = cache / f"queries-{slug(model)}"
        self.texts = json.loads(Path(f"{self.path}.json").read_text()) if Path(f"{self.path}.json").exists() else []
        self.matrix = np.load(f"{self.path}.npy") if self.texts else np.zeros((0, 1), dtype=np.float32)
        self.row = {t: i for i, t in enumerate(self.texts)}

    def add(self, model_obj, texts):
        new = [t for t in dict.fromkeys(texts) if t not in self.row]
        if not new:
            return 0
        vectors = np.array(list(model_obj.embed(new, batch_size=16)), dtype=np.float32)
        self.matrix = vectors if not self.texts else np.concatenate([self.matrix, vectors])
        self.texts += new
        self.row = {t: i for i, t in enumerate(self.texts)}
        np.save(f"{self.path}.npy", self.matrix)
        Path(f"{self.path}.json").write_text(json.dumps(self.texts, ensure_ascii=False))
        return len(new)

    def get(self, texts):
        return self.matrix[[self.row[t] for t in texts]]


def cmd_queries(args):
    from fastembed import TextEmbedding
    sets, rw = load_sets(), rewrites(args.cache)
    for model in args.models.split(","):
        if not Path(f"{args.cache}/v3-{slug(model)}-text.npy").exists():
            continue
        if model == E5 and E5 not in {m["model"] for m in TextEmbedding.list_supported_models()}:
            from fastembed.common.model_description import ModelSource, PoolingType
            TextEmbedding.add_custom_model(model=E5, pooling=PoolingType.MEAN, normalization=True, dim=384,
                                           sources=ModelSource(hf=E5), model_file="onnx/model.onnx")
        qv = QueryVectors(args.cache, model)
        texts = [t for _, qs in sets.values() for q in qs for v in VARIANTS[model] for t in query_texts(model, q, rw, v)]
        started = time.time()
        added = qv.add(TextEmbedding(model, threads=args.threads), texts)
        print(json.dumps({"model": model, "added": added, "seconds": round(time.time() - started, 1),
                          "ms_per_query": round(1000 * (time.time() - started) / max(added, 1), 1)}))


# ---------- ranking primitives


def top(scores, n):
    order = np.argpartition(-scores, min(n, len(scores) - 1))[:n]
    return list(order[np.argsort(-scores[order])])


def rrf(lists, k=60, weights=None):
    fused = defaultdict(float)
    for li, ranked in enumerate(lists):
        w = 1.0 if weights is None else weights[li]
        for rank, doc in enumerate(ranked):
            fused[doc] += w / (k + rank + 1)
    return sorted(fused, key=lambda d: -fused[d])


def minmax(values):
    values = np.asarray(values, dtype=float)
    if len(values) == 0:
        return values
    lo, hi = values.min(), values.max()
    return (values - lo) / (hi - lo) if hi > lo else np.ones_like(values)


def weighted(dense, dense_ids, words_ids, words_scores, alpha):
    """alpha * normalised cosine + (1 - alpha) * min-max normalised BM25, over the union of both candidate lists."""
    cand = list(dict.fromkeys(list(dense_ids) + list(words_ids)))
    d = minmax(dense[cand])
    w_map = dict(zip(words_ids, minmax(words_scores)))
    w = np.array([w_map.get(c, 0.0) for c in cand])
    return [cand[i] for i in np.argsort(-(alpha * d + (1 - alpha) * w))]


def weighted_abs(dense, dense_ids, words_ids, words_scores, alpha, half):
    """Like weighted, but BM25 is scaled by s / (s + half), so a weak word match stays weak instead of becoming 1."""
    cand = list(dict.fromkeys(list(dense_ids) + list(words_ids)))
    d = minmax(dense[cand])
    w_map = {i: sc / (sc + half) for i, sc in zip(words_ids, words_scores)}
    w = np.array([w_map.get(c, 0.0) for c in cand])
    return [cand[i] for i in np.argsort(-(alpha * d + (1 - alpha) * w))]


def score(questions, rankings, k=10):
    rec = [len(q.gold & set(r[:k])) / len(q.gold) for q, r in zip(questions, rankings)]
    hit = [bool(q.gold & set(r[:k])) for q, r in zip(questions, rankings)]
    out = {"recall@10": round(float(np.mean(rec)), 3), "hit@10": round(float(np.mean(hit)), 3)}
    if questions[0].categories:
        out["by_category"] = {}
        for c in CATEGORIES:
            idx = [i for i, q in enumerate(questions) if c in q.categories]
            if idx:
                out["by_category"][c] = {"n": len(idx), "recall@10": round(float(np.mean([rec[i] for i in idx])), 3),
                                         "hit@10": round(float(np.mean([hit[i] for i in idx])), 3)}
    out["_per_question"] = rec
    return out


# ---------- the lab


RERANK_BASES = {
    "gemma": lambda lab, c, q: lab.dense(c, q)[0],
    "hybrid": lambda lab, c, q: rrf([lab.dense(c, q)[0], c.bm25(q.text)[0]], 60),
    "stackC": lambda lab, c, q: stack(lab, c, q, rewrite_kind="mqdate"),
    "e5-hybrid": lambda lab, c, q: rrf([lab.dense(c, q, model=E5)[0], c.bm25(q.text)[0]], 60),
}


def doc_text(corpus, i, chars):
    r = corpus.records[i]
    return ((r.get("title", "") + "\n") if r.get("title") else "") + r["text"][:chars]


class Lab:
    def __init__(self, cache):
        self.cache = cache
        self.sets = load_sets()
        self.rw = rewrites(cache)
        self.qv = {m: QueryVectors(cache, m) for m in (GEMMA, E5)}
        self.cv = {}
        self.rerank_cache = {}
        self._llm = {}
        for corpus, _ in self.sets.values():
            corpus.fts()

    def corpus_vectors(self, corpus, model, mode="text"):
        key = (corpus.name, model, mode)
        if key not in self.cv:
            self.cv[key] = corpus.vectors(self.cache, model, mode)
        return self.cv[key]

    def has(self, corpus, model, mode="text"):
        return model is None or Path(f"{self.cache}/{corpus.name}-{slug(model)}-{mode}.npy").exists()

    def dense(self, corpus, q, model=GEMMA, variant="q", fuse="rrf", n=100, mode="text", mask=None, k=60):
        cv = self.corpus_vectors(corpus, model, mode)
        s = self.qv[model].get(query_texts(model, q, self.rw, variant)) @ cv.T
        if mask is not None:
            s = np.where(mask, s, -9.0)
            lists = [[d for d in top(row, n) if mask[d]] for row in s]
        else:
            lists = [top(row, n) for row in s]
        if len(lists) == 1:
            return lists[0], s[0]
        if fuse in ("mean", "max"):
            v = s.mean(axis=0) if fuse == "mean" else s.max(axis=0)
            order = top(v, n)
            return ([d for d in order if mask[d]] if mask is not None else order), v
        return rrf(lists, k)[:n], s[0]

    def base_order(self, c, q, base):
        return RERANK_BASES[base](self, c, q)

    def rerank_path(self, model, set_name, base):
        return self.cache / f"rerank-{slug(model)}-{set_name}-{base}.json"

    def reranker_models(self):
        return sorted({p.name.split("-v3-all-")[0][7:] for p in self.cache.glob("rerank-*-v3-all-*.json")} |
                      {p.name.split("-lb-")[0][7:] for p in self.cache.glob("rerank-*-lb-*.json")})

    def rerank_bases(self):
        return [b for b in RERANK_BASES if any(self.cache.glob(f"rerank-*-{b}.json"))]

    def load_rerank(self, model, corpus_name, base):
        key = (model, corpus_name, base)
        if key not in self.rerank_cache:
            data = {}
            for p in self.cache.glob(f"rerank-{model}-*-{base}.json"):
                if (corpus_name == "lb") == ("-lb-" in p.name):
                    data.update(json.loads(p.read_text())["scores"])
            self.rerank_cache[key] = data
        return self.rerank_cache[key]

    def reranked(self, c, q, model, base):
        scores = self.load_rerank(model, c.name, base).get(f"{q.id}\t{q.text}")
        if scores is None:
            return None
        order = self.base_order(c, q, base)
        return sorted(order[:50], key=lambda d: -scores[str(d)]) + order[50:]

    def llm_path(self, base):
        return self.cache / f"llmrerank-{base}-json.json"

    def llm_reranked(self, c, q, base):
        if base not in self._llm:
            path = self.llm_path(base)
            self._llm[base] = json.loads(path.read_text()) if path.exists() else {}
        entry = self._llm[base].get(f"{c.name}\t{q.id}\t{q.text}")
        if entry is None:
            return None
        order = self.base_order(c, q, base)
        head = list(dict.fromkeys(order[i] for i in entry["order"] if 0 <= i < 30))
        return head + [d for d in order if d not in set(head)]

    def chunked(self, c, q):
        vec = np.load(self.cache / f"{c.name}-{slug(GEMMA)}-chunks.npy")
        owner = np.array(json.loads((self.cache / f"{c.name}-{slug(GEMMA)}-chunks.owner.json").read_text()))
        qvec = self.qv[GEMMA].get(query_texts(GEMMA, q, self.rw, "q"))
        best = (qvec @ self.corpus_vectors(c, GEMMA).T)[0].copy()
        np.maximum.at(best, owner, (qvec @ vec.T)[0])
        return top(best, 100)


def mask_before(corpus, q):
    return corpus.time <= q.as_of_ts


UPDATE_WORDS = re.compile(r"\b(current|currently|now|latest|most recent|still|so far|these days|anymore|new|today)\b",
                          re.I)


def recency(order, scores, corpus, beta, window=None):
    """Among the candidates, add beta times how recent the record is (0 oldest, 1 newest among them)."""
    cand = order[:window] if window else order
    t = corpus.time[cand]
    span = t.max() - t.min()
    r = (t - t.min()) / span if span > 0 else np.zeros(len(cand))
    head = [cand[i] for i in np.argsort(-(minmax(scores[cand]) + beta * r))]
    return head + [d for d in order if d not in set(head)]


def in_range_boost(order, scores, corpus, rng, beta):
    if rng is None:
        return order
    inside = ((corpus.time[order] >= rng[0]) & (corpus.time[order] < rng[1])).astype(float)
    return [order[i] for i in np.argsort(-(minmax(scores[order]) + beta * inside))]


def stack(lab, c, q, a=0.7, half=10, rewrite_kind=None, date=True, boost=0.5, fuse="weighted"):
    """Date cut, vectors of the question (and its rewrites, mean vector), words (with the rewrite's keywords), fused,
    then records inside the question's date range moved up."""
    mask = mask_before(c, q) if date else None
    order, s = lab.dense(c, q, variant=rewrite_kind or "q", fuse="mean", mask=mask)
    text = q.text
    if rewrite_kind:
        text += " " + " ".join(lines(rewrite(lab.rw, rewrite_kind, q))[2:3])
    ids, sc = c.bm25(text, 300)
    if date:
        keep = [(i, x) for i, x in zip(ids, sc) if c.time[i] <= q.as_of_ts][:100]
        ids, sc = [i for i, _ in keep], [x for _, x in keep]
    if fuse == "rrf":
        out = rrf([order, ids], 60)
    elif half:
        out = weighted_abs(s, order, ids, sc, a, half)
    else:
        out = weighted(s, order, ids, sc, a)
    if boost:
        rng = date_range(lab.rw, q)
        if rng is not None:
            head = out[:100]
            inside = ((c.time[head] >= rng[0]) & (c.time[head] < rng[1])).astype(float)
            base = 1 - np.arange(len(head)) / len(head)
            out = [head[i] for i in np.argsort(-(base + boost * inside))] + out[100:]
    return out


def run_hypotheses(lab, only=None):
    """Every row of the results table: name -> {set -> (ranking per question, offline ms per question)}."""
    H = {}

    def add(name, fn, sets=("v3-all", "v3-rew", "lb", "lb-s20"), model=GEMMA):
        if only and not any(o in name for o in only):
            return
        H[name] = {}
        for s in sets:
            corpus, qs = lab.sets[s]
            if not lab.has(corpus, model):
                continue
            started = time.time()
            rankings = [fn(corpus, q) for q in qs]
            if any(r is None for r in rankings):
                continue
            H[name][s] = (rankings, (time.time() - started) * 1000 / len(qs))
        if not H[name]:
            del H[name]

    def g(c, q, **kw):
        return lab.dense(c, q, **kw)[0]

    add("words only (FTS5 BM25, OR of content words)", lambda c, q: c.bm25(q.text)[0], model=None)
    add("e5-small alone", lambda c, q: g(c, q, model=E5), model=E5)
    add("Gemma alone (baseline)", lambda c, q: g(c, q))

    # (c) hybrid words + Gemma
    for k in (10, 30, 60, 100):
        add(f"hybrid RRF k={k}", lambda c, q, k=k: rrf([g(c, q), c.bm25(q.text)[0]], k))
    for wt in (0.3, 0.5):
        add(f"hybrid RRF k=60, words weight {wt}", lambda c, q, wt=wt: rrf([g(c, q), c.bm25(q.text)[0]], 60, [1, wt]))
    for a in (0.5, 0.7, 0.8, 0.9):
        def fn(c, q, a=a):
            order, s = lab.dense(c, q)
            ids, sc = c.bm25(q.text)
            return weighted(s, order, ids, sc, a)
        add(f"hybrid weighted, alpha={a} on vectors", fn)
    for half in (5, 10, 20):
        for a in (0.5, 0.7):
            def fn(c, q, a=a, half=half):
                order, s = lab.dense(c, q)
                ids, sc = c.bm25(q.text)
                return weighted_abs(s, order, ids, sc, a, half)
            add(f"hybrid weighted, alpha={a}, BM25 scaled s/(s+{half})", fn)
    add("hybrid e5-small RRF k=60", lambda c, q: rrf([g(c, q, model=E5), c.bm25(q.text)[0]], 60), model=E5)

    # (e) query prefix variants
    for p in ("qa", "fact", "none"):
        add(f"Gemma, query prefix '{GEMMA_PREFIXES[p] or 'none'}'", lambda c, q, p=p: g(c, q, variant=f"prefix-{p}"))

    # (b) rewriting at search time
    for fuse in ("rrf", "mean"):
        add(f"Gemma + Haiku 3 rewrites, {fuse}", lambda c, q, f=fuse: g(c, q, variant="mq", fuse=f))
    add("Gemma + Haiku dated rewrites, rrf", lambda c, q: g(c, q, variant="mqdate"))
    add("HyDE alone (Haiku record, passage prefix)", lambda c, q: g(c, q, variant="hyde"))
    add("Gemma + HyDE, rrf", lambda c, q: g(c, q, variant="hyde-q"))
    add("Gemma + HyDE, mean vector", lambda c, q: g(c, q, variant="hyde-q", fuse="mean"))

    def mq_words(c, q, kind="mq"):
        extra = " ".join(lines(rewrite(lab.rw, kind, q))[2:3])
        return rrf([g(c, q, variant=kind), c.bm25(q.text + " " + extra)[0]], 60)
    add("Gemma rewrites + words with Haiku keywords, rrf", mq_words)
    add("Gemma dated rewrites + words with dated keywords, rrf", lambda c, q: mq_words(c, q, "mqdate"))
    add("e5-small + Haiku 3 rewrites, rrf", lambda c, q: g(c, q, model=E5, variant="mq"), model=E5)
    add("e5-small + HyDE, rrf", lambda c, q: rrf([g(c, q, model=E5), g(c, q, model=E5, variant="hyde")]), model=E5)

    # (d) dates
    add("Gemma, records after the question's date dropped", lambda c, q: g(c, q, mask=mask_before(c, q)))
    add("hybrid RRF k=60, records after the question's date dropped",
        lambda c, q: rrf([g(c, q, mask=mask_before(c, q)),
                          [d for d in c.bm25(q.text, 300)[0] if c.time[d] <= q.as_of_ts][:100]], 60))
    for beta in (0.1, 0.3):
        for window in (10, 30):
            def fn(c, q, beta=beta, window=window):
                order, s = lab.dense(c, q, mask=mask_before(c, q))
                return recency(order, s, c, beta, window)
            add(f"Gemma, date cut + recency boost beta={beta} over top {window}", fn)

    def gated(c, q):
        order, s = lab.dense(c, q, mask=mask_before(c, q))
        return recency(order, s, c, 0.3, 30) if UPDATE_WORDS.search(q.text) else order
    add("Gemma, date cut + recency boost only when the question says now/current/latest", gated)
    for beta in (0.2, 0.5):
        def fn(c, q, beta=beta):
            order, s = lab.dense(c, q, mask=mask_before(c, q))
            return in_range_boost(order, s, c, date_range(lab.rw, q), beta)
        add(f"Gemma, date cut + boost records inside Haiku's date range, beta={beta}", fn)

    def range_filter(c, q):
        rng = date_range(lab.rw, q)
        m = mask_before(c, q)
        if rng is not None:
            m = m & (c.time >= rng[0]) & (c.time < rng[1])
            if m.sum() < 10:
                m = mask_before(c, q)
        return g(c, q, mask=m)
    add("Gemma, keep only records inside Haiku's date range (hard filter)", range_filter)

    # stacks
    add("stack A: date cut + hybrid weighted 0.7 (BM25 s/(s+10))", lambda c, q: stack(lab, c, q, boost=0))
    add("stack B: A + boost inside Haiku date range", lambda c, q: stack(lab, c, q))
    add("stack C: B + Haiku dated rewrites (mean vector) and keywords",
        lambda c, q: stack(lab, c, q, rewrite_kind="mqdate"))
    add("stack C', plain rewrites instead of dated", lambda c, q: stack(lab, c, q, rewrite_kind="mq"))
    add("stack C with RRF k=60 instead of weighted", lambda c, q: stack(lab, c, q, rewrite_kind="mqdate", fuse="rrf"))
    add("stack C with alpha 0.8", lambda c, q: stack(lab, c, q, rewrite_kind="mqdate", a=0.8))
    add("stack C, boost 0.3", lambda c, q: stack(lab, c, q, rewrite_kind="mqdate", boost=0.3))
    add("free stack: date cut + hybrid weighted 0.9 (BM25 s/(s+10))", lambda c, q: stack(lab, c, q, a=0.9, boost=0))
    add("free stack: date cut + hybrid weighted 0.85", lambda c, q: stack(lab, c, q, a=0.85, boost=0))
    add("stack C without the date cut", lambda c, q: stack(lab, c, q, rewrite_kind="mqdate", date=False))
    add("stack C without words (vectors of rewrites + date cut + range boost)",
        lambda c, q: stack(lab, c, q, rewrite_kind="mqdate", a=1.0))

    # (a) cross-encoder rerankers, from cached pair scores
    for model in lab.reranker_models():
        for base in lab.rerank_bases():
            add(f"rerank {model} over top 50 of {base}", lambda c, q, m=model, b=base: lab.reranked(c, q, m, b))

            def fn2(c, q, m=model, b=base):
                r = lab.reranked(c, q, m, b)
                return None if r is None else rrf([r, lab.base_order(c, q, b)], 60)
            add(f"rerank {model} over top 50 of {base}, RRF with first stage", fn2)

    # LLM rerank
    for base in ("hybrid", "stackC"):
        if lab.llm_path(base).exists():
            add(f"Haiku listwise rerank over top 30 of {base}", lambda c, q, b=base: lab.llm_reranked(c, q, b))

    # (e) title and chunks
    if lab.has(lab.sets["lb"][0], GEMMA, "title"):
        add("Gemma with the record's title in the title slot",
            lambda c, q: g(c, q, mode="title" if c.name == "lb" else "text"))
    if lab.has(lab.sets["lb"][0], GEMMA, "chunks"):
        add("Gemma, long records split into chunks, best chunk per record", lab.chunked)
    return H


# ---------- commands


def cmd_rerank(args):
    from fastembed.rerank.cross_encoder import TextCrossEncoder
    lab = Lab(args.cache)
    encoder = TextCrossEncoder(args.model, threads=args.threads, cache_dir=str(args.models_dir))
    for set_name in args.set.split(","):
        corpus, qs = lab.sets[set_name]
        path = lab.rerank_path(args.model, set_name, args.base)
        data = json.loads(path.read_text()) if path.exists() else {"scores": {}, "ms": []}
        for i, q in enumerate(qs[: args.limit or None]):
            key = f"{q.id}\t{q.text}"
            if key in data["scores"]:
                continue
            cand = lab.base_order(corpus, q, args.base)[:50]
            started = time.time()
            s = list(encoder.rerank(q.text, [doc_text(corpus, d, args.chars) for d in cand], batch_size=args.batch))
            data["ms"].append(round((time.time() - started) * 1000, 1))
            data["scores"][key] = {str(d): float(v) for d, v in zip(cand, s)}
            if i % 20 == 19:
                path.write_text(json.dumps(data))
        path.write_text(json.dumps(data))
        ms = sorted(data["ms"])
        print(json.dumps({"model": args.model, "set": set_name, "base": args.base, "questions": len(data["scores"]),
                          "ms_median": ms[len(ms) // 2] if ms else None, "threads": args.threads}))


LLM_PROMPT = (
    "Today is {as_of}. A person searches their own archive of messages, mails, notes, calendar entries and phone "
    "records with the question below. Here are {n} candidate records, numbered.\n\n{records}\n\n"
    "Question: {question}\n\n"
    "Which records help answer the question? List their numbers, most useful first, at most ten; an empty list if "
    "none does."
)
LLM_FORMAT = {"type": "json_schema", "schema": {
    "type": "object", "properties": {"records": {"type": "array", "items": {"type": "integer"}}},
    "required": ["records"], "additionalProperties": False}}


def cmd_llmrerank(args):
    import subprocess
    import threading
    from concurrent.futures import ThreadPoolExecutor

    import anthropic

    key = subprocess.run(["secret-tool", "lookup", "service", "cli-memo", "account", "anthropic"],
                         capture_output=True, text=True, check=True).stdout.strip()
    client = anthropic.Anthropic(api_key=key, max_retries=4)
    lab = Lab(args.cache)
    path = lab.llm_path(args.base)
    data = json.loads(path.read_text()) if path.exists() else {}
    lock = threading.Lock()
    todo = []
    for set_name in args.set.split(","):
        corpus, qs = lab.sets[set_name]
        for q in qs:
            k = f"{corpus.name}\t{q.id}\t{q.text}"
            if k not in data:
                # SQLite objects stay in the thread that made them, so candidates are found before the pool.
                todo.append((k, corpus, q, lab.base_order(corpus, q, args.base)[:30]))
    spent = sum(v["cost"] for v in data.values())

    def call(item):
        nonlocal spent
        k, corpus, q, cand = item
        if spent > args.budget:
            return
        records = "\n".join(f"[{i}] ({corpus.records[d]['timestamp'][:10]}) "
                            + doc_text(corpus, d, args.chars).replace("\n", " ") for i, d in enumerate(cand))
        started = time.time()
        r = client.messages.create(
            model="claude-haiku-5-5", max_tokens=300, thinking={"type": "disabled"},
            output_config={"effort": "low", "format": LLM_FORMAT},
            messages=[{"role": "user", "content": LLM_PROMPT.format(as_of=q.as_of[:10], n=len(cand), records=records,
                                                                    question=q.text)}])
        text = "".join(b.text for b in r.content if b.type == "text")
        cost = r.usage.input_tokens * 0.10 / 1e6 + r.usage.output_tokens * 0.50 / 1e6
        with lock:
            spent += cost
            data[k] = {"order": json.loads(text)["records"] if r.stop_reason == "end_turn" else [], "raw": text,
                       "stop": r.stop_reason, "ms": round((time.time() - started) * 1000), "cost": cost,
                       "in": r.usage.input_tokens}

    with ThreadPoolExecutor(8) as pool:
        list(pool.map(call, todo))
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1))
    ms = sorted(v["ms"] for v in data.values())
    print(json.dumps({"calls": len(data), "cost": round(spent, 4), "ms_median": ms[len(ms) // 2],
                      "input_tokens_median": sorted(v["in"] for v in data.values())[len(data) // 2]}))


def cmd_eval(args):
    lab = Lab(args.cache)
    H = run_hypotheses(lab, args.only.split(",") if args.only else None)
    results = {}
    for name, per_set in H.items():
        results[name] = {}
        for s, (rankings, ms) in per_set.items():
            results[name][s] = score(lab.sets[s][1], rankings)
            results[name][s]["ms_per_query_offline"] = round(ms, 2)
    base = results.get("Gemma alone (baseline)", {})
    for name, row in results.items():
        cells = []
        for s in ("v3-rew", "v3-all", "lb", "lb-s20"):
            if s not in row:
                cells.append("-")
                continue
            moved = ""
            if s in base and name != "Gemma alone (baseline)":
                a, b = np.array(row[s]["_per_question"]), np.array(base[s]["_per_question"])
                moved = f" (+{int((a > b).sum())}/-{int((a < b).sum())})"
            cells.append(f"{row[s]['recall@10']:.2f}" + (f"/{row[s]['hit@10']:.2f}" if s == "lb" else "") + moved)
        print(f"{name:85s} " + " | ".join(cells))
    for row in results.values():
        for sc in row.values():
            sc.pop("_per_question", None)
    if args.output:
        old = json.loads(args.output.read_text()) if args.output.exists() and args.only else {}
        old.update(results)
        args.output.write_text(json.dumps(old, indent=1) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("queries")
    p.add_argument("--cache", type=Path, required=True)
    p.add_argument("--models", default=f"{GEMMA},{E5}")
    p.add_argument("--threads", type=int, default=8)
    p.set_defaults(fn=cmd_queries)
    p = sub.add_parser("rerank")
    p.add_argument("--cache", type=Path, required=True)
    p.add_argument("--models-dir", type=Path, required=True, help="a folder of its own for downloaded reranker models")
    p.add_argument("--model", required=True)
    p.add_argument("--set", default="v3-all,v3-rew")
    p.add_argument("--base", default="hybrid", choices=list(RERANK_BASES))
    p.add_argument("--chars", type=int, default=2000, help="a record is cut to this many characters")
    p.add_argument("--threads", type=int, default=8)
    p.add_argument("--batch", type=int, default=16)
    p.add_argument("--limit", type=int, default=0)
    p.set_defaults(fn=cmd_rerank)
    p = sub.add_parser("llmrerank")
    p.add_argument("--cache", type=Path, required=True)
    p.add_argument("--set", default="v3-all,v3-rew,lb-s20")
    p.add_argument("--base", default="stackC", choices=list(RERANK_BASES))
    p.add_argument("--chars", type=int, default=400)
    p.add_argument("--budget", type=float, default=1.0)
    p.set_defaults(fn=cmd_llmrerank)
    p = sub.add_parser("eval")
    p.add_argument("--cache", type=Path, required=True)
    p.add_argument("--only", help="comma-separated parts of hypothesis names")
    p.add_argument("--output", type=Path)
    p.set_defaults(fn=cmd_eval)
    args = parser.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
