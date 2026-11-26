"""Totals per contestant and mode, all 65 and per set; writes per-question rows to rows-private.md. Ids and ranks only."""
import json, statistics, sys
import os
EXP = os.environ.get("EXP") or os.path.expanduser("~/.cache/wirecat-experiment-b")  # the private run folder
sys.path.insert(0, f"{EXP}/p2")
from common import tests, set_of
P = f"{EXP}/p2"
load = lambda path, rep: {r["t"]: r for r in map(json.loads, open(path)) if r["rep"] == rep}
tg = load(f"{P}/tgrun/rows.jsonl", "full")
jw = load(f"{P}/jw/rows.jsonl", "full")
jws = load(f"{P}/jw/rows.jsonl", "stem")
fts = load(f"{P}/fts/rows.jsonl", "full")
qmd = load(f"{P}/qmd/rows.jsonl", "full-search")
for t, r in load(f"{P}/qmd/rows.jsonl", "full-query").items(): qmd.setdefault(t, {}).update(r)
srv = {}
for r in map(json.loads, open(f"{P}/tgserver/rows.jsonl")):
  if r["rep"] == "full": srv.setdefault(r["t"], {}).update(r)
srv_kw = {t: r for t, r in srv.items() if "kw_n" in r}
# name: (rows, rank field, shown(row) or None = rank within the returned list, seconds field)
MODES = {
  "tg search conversations": (tg, "main", lambda r: r.get("shown_text") is not None, "seconds"),
  "jackwener tg search, question as typed": (jw, "asked", None, "seconds"),
  "jackwener, rarest whole word": (jw, "kw_rare", None, "kw_rare_seconds"),
  "jackwener, rarest 5-letter stem": (jws, "kw_rare", None, "kw_rare_seconds"),
  "jackwener, best whole word (oracle)": (jw, "kw_best", None, None),
  "jackwener, best stem (oracle)": (jws, "kw_best", None, None),
  "Telegram server search (tg order), question words": (srv, "typed", None, "typed_seconds"),
  "Telegram server search (tg order), rarest word": (srv_kw, "kw", None, "kw_seconds"),
  "qmd query (hybrid)": (qmd, "query", None, "query_seconds"),
  "qmd search (BM25)": (qmd, "search", None, "search_seconds"),
  "SQLite FTS5 bm25, any word": (fts, "or", None, "or_seconds"),
  "SQLite FTS5, all words": (fts, "and", None, "and_seconds"),
}
le = lambda v, n: v is not None and v <= n
out = ["| contestant / mode | set | n | top 5 | top 20 | shown | median s |", "| --- | --- | --- | --- | --- | --- | --- |"]
for name, (rows, f, shown, sec) in MODES.items():
  for s in ("all 65", "old30", "fresh15", "held20"):
    xs = [r for t, r in rows.items() if s == "all 65" or set_of(t) == s]
    if not xs: continue
    sh = sum(map(shown, xs)) if shown else sum(r.get(f) is not None for r in xs)
    secs = [r[sec] for r in xs if sec and r.get(sec) is not None]
    out.append(f"| {name} | {s} | {len(xs)} | {sum(le(r.get(f), 5) for r in xs)} | {sum(le(r.get(f), 20) for r in xs)} | "
               f"{sh} | {statistics.median(secs) if secs else '—'} |")
print("\n".join(out))
rows = ["| t | set | tg main | tg own | tg shown | jw asked | jw rare word | jw rare stem | jw best word | jw best stem | "
        "qmd query | qmd search | fts any | fts all | tgserver words | tgserver rare word |", "|" + " --- |" * 16]
g = lambda d, t, f: (d.get(t) or {}).get(f) or "-"
for t in tests:
  rows.append(f"| {t} | {set_of(t)} | {g(tg, t, 'main')} | {g(tg, t, 'own')} | {g(tg, t, 'shown_text')} | {g(jw, t, 'asked')} | "
              f"{g(jw, t, 'kw_rare')} | {g(jws, t, 'kw_rare')} | {g(jw, t, 'kw_best')} | {g(jws, t, 'kw_best')} | "
              f"{g(qmd, t, 'query')} | {g(qmd, t, 'search')} | {g(fts, t, 'or')} | {g(fts, t, 'and')} | {g(srv, t, 'typed')} | {g(srv_kw, t, 'kw') if t in srv_kw else 'not run (cap)'} |")
open(f"{P}/rows-private.md", "w").write("# Per-question ranks (private: ids and ranks only)\n\n" + "\n".join(rows) + "\n")
