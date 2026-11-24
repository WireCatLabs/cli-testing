# /// script
# requires-python = ">=3.11"
# dependencies = ["rapidfuzz==3.14.6"]
# ///
"""Scores every engine's output against the expected text and prints the tables of the README.

Usage: uv run score.py <pages dir> <results dir>
"""

import json
import re
import statistics
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

from rapidfuzz.distance import Levenshtein

PAGES = Path(sys.argv[1])
RESULTS = Path(sys.argv[2])
ENGINES = [
  "tesseract-fast",
  "tesseract-best",
  "tesseract-fast-psm1",
  "doctr-official",
  "doctr-ru-onnx",
  "paddle-eslav",
  "paddle-eslav-mobile",
]
VARIANTS = [
  "clean-300dpi",
  "scan-150dpi",
  "noise-blur",
  "rotated-2-5deg",
  "rotated-90deg",
  "photo-perspective",
  "phone-jpeg",
]
PHOTO = {"photo-perspective", "phone-jpeg"}


def raw(text):
  return " ".join(text.split())


def loose(text):
  """Case, punctuation and ё/е do not count: what a search for the words would still find."""
  text = unicodedata.normalize("NFC", text).lower().replace("ё", "е")
  return " ".join(re.sub(r"[^\w\s]|_", " ", text).split())


def score(ref, hyp):
  out = {}
  for name, norm in (("raw", raw), ("loose", loose)):
    r, h = norm(ref), norm(hyp)
    out[f"chars_{name}"] = len(r)
    out[f"char_edits_{name}"] = Levenshtein.distance(r, h)
    out[f"words_{name}"] = len(r.split())
    out[f"word_edits_{name}"] = Levenshtein.distance(r.split(), h.split())
  ref_bag, hyp_bag = Counter(loose(ref).split()), Counter(loose(hyp).split())
  out["bag_ref"] = sum(ref_bag.values())
  out["bag_hyp"] = sum(hyp_bag.values())
  out["bag_hit"] = sum((ref_bag & hyp_bag).values())
  return out


def agg(rows):
  if not rows:
    return None

  def s(k):
    return sum(r[k] for r in rows)

  p = s("bag_hit") / s("bag_hyp") if s("bag_hyp") else 0
  rc = s("bag_hit") / s("bag_ref")
  return {
    "cer_raw": s("char_edits_raw") / s("chars_raw"),
    "cer_loose": s("char_edits_loose") / s("chars_loose"),
    "wer_raw": s("word_edits_raw") / s("words_raw"),
    "wer_loose": s("word_edits_loose") / s("words_loose"),
    "bag_f1": 2 * p * rc / (p + rc) if p + rc else 0,
    "seconds_median": statistics.median(r["seconds"] for r in rows),
    "pages": len(rows),
  }


def pct(x):
  return "–" if x is None else f"{100 * x:.1f}"


def table(head, rows):
  lines = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
  lines += ["| " + " | ".join(str(c) for c in row) + " |" for row in rows]
  return "\n".join(lines)


def main():
  manifest = json.loads((PAGES / "manifest.json").read_text())
  pages = {p["file"]: p for p in manifest["pages"]}
  truth = {p["doc"]: (PAGES / f"{p['doc']}.txt").read_text(encoding="utf-8") for p in manifest["pages"]}
  engines = [e for e in ENGINES if (RESULTS / f"{e}.jsonl").exists()]
  scored, meta = defaultdict(list), {}
  for engine in engines:
    meta[engine] = json.loads((RESULTS / f"{engine}.meta.json").read_text())
    for line in (RESULTS / f"{engine}.jsonl").read_text(encoding="utf-8").splitlines():
      row = json.loads(line)
      page = pages[row["file"]]
      scored[engine].append({**page, "seconds": row["seconds"], **score(truth[page["doc"]], row["text"])})


  def pick(e, f):
    return agg([r for r in scored[e] if f(r)])

  print("## Headline: CER, case and punctuation ignored (%)\n")
  head = ["engine", "RU clean", "RU photo", "EN clean", "EN photo", "mixed clean", "mixed photo"]
  rows = []
  for e in engines:
    row = [e]
    for lang in ("ru", "en", "mixed"):
      row.append(pct(pick(e, lambda r: r["lang"] == lang and r["variant"] == "clean-300dpi")["cer_loose"]))
      row.append(pct(pick(e, lambda r: r["lang"] == lang and r["variant"] in PHOTO)["cer_loose"]))
    rows.append(row)
  print(table(head, rows))

  for lang in ("ru", "en", "mixed"):
    print(f"\n## Language {lang}, all 7 variants (%)\n")
    head = ["engine", "CER raw", "CER loose", "WER raw", "WER loose", "word bag F1", "without 90°: CER loose"]
    rows = []
    for e in engines:
      a = pick(e, lambda r: r["lang"] == lang)
      b = pick(e, lambda r: r["lang"] == lang and r["variant"] != "rotated-90deg")
      rows.append([e, pct(a["cer_raw"]), pct(a["cer_loose"]), pct(a["wer_raw"]), pct(a["wer_loose"]),
                   pct(a["bag_f1"]), pct(b["cer_loose"])])
    print(table(head, rows))

  for metric, title in (("cer_loose", "CER loose"), ("wer_loose", "WER loose"), ("bag_f1", "word bag F1")):
    print(f"\n## By variant, {title}, all 8 documents (%)\n")
    rows = [[e] + [pct(pick(e, lambda r, v=v: r["variant"] == v)[metric]) for v in VARIANTS] for e in engines]
    print(table(["engine"] + VARIANTS, rows))

  print("\n## Layout: CER loose against word bag F1 per document, clean 300 dpi (%)\n")
  docs = list(dict.fromkeys(p["doc"] for p in manifest["pages"]))
  rows = []
  for e in engines:
    row = [e]
    for d in docs:
      a = pick(e, lambda r, d=d: r["doc"] == d and r["variant"] == "clean-300dpi")
      row.append(f"{pct(a['cer_loose'])} / {pct(a['bag_f1'])}")
    rows.append(row)
  print(table(["engine"] + docs, rows))

  print("\n## Speed and memory\n")
  rows = []
  for e in engines:
    m = meta[e]
    rows.append([
      e,
      f"{pick(e, lambda r: r['variant'] == 'clean-300dpi')['seconds_median']:.2f}",
      f"{pick(e, lambda r: r['variant'] == 'phone-jpeg')['seconds_median']:.2f}",
      f"{pick(e, lambda r: True)['seconds_median']:.2f}",
      f"{m['load_seconds']:.2f}",
      f"{m['peak_rss_mb']:.0f}",
    ])
  print(table(["engine", "s/page clean 300 dpi", "s/page phone JPEG", "s/page all", "load s", "peak RSS MB"], rows))

  out = {
    "engines": meta,
    "pages": {e: [{k: v for k, v in r.items() if k != "size"} for r in scored[e]] for e in engines},
  }
  (RESULTS / "scores.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
  main()
