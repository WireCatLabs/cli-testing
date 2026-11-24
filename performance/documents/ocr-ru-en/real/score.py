# /// script
# requires-python = ">=3.11"
# dependencies = ["rapidfuzz==3.14.6"]
# ///
"""Scores the engines on the real pages and prints the tables of the README's real-scans section.

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
ENGINES = ["tesseract-fast", "tesseract-fast-psm1", "doctr-official", "doctr-official-straight", "doctr-ru-onnx",
           "doctr-ru-onnx-straight"]
GROUPS = [
  ("ru", "scan", "RU book and law scans"),
  ("ru", "phone-sim", "RU the same, as a simulated phone photo"),
  ("en", "scan", "EN book and report scans"),
  ("en", "photo", "EN receipt phone photos (CORD)"),
]


def joined(text):
  """A word broken at a line end is one word, for the expected text and the engines alike."""
  return re.sub(r"(\w)[-­‐]\s*\n\s*(\w)", r"\1\2", text)


def loose(text):
  text = unicodedata.normalize("NFC", joined(text)).lower().replace("ё", "е")
  return re.sub(r"[^\w\s]|_", " ", text).split()


def score(ref, hyp):
  r, h = loose(ref), loose(hyp)
  rc, hc = " ".join(r), " ".join(h)
  ref_bag, hyp_bag = Counter(r), Counter(h)
  return {
    "chars": len(rc),
    "char_edits": Levenshtein.distance(rc, hc),
    "words": len(r),
    "word_edits": Levenshtein.distance(r, h),
    "bag_ref": len(r),
    "bag_hyp": len(h),
    "bag_hit": sum((ref_bag & hyp_bag).values()),
  }


def agg(rows):
  s = Counter()
  for row in rows:
    s.update({k: v for k, v in row.items() if isinstance(v, int)})
  return {
    "cer": s["char_edits"] / s["chars"],
    "wer": s["word_edits"] / s["words"],
    "recall": s["bag_hit"] / s["bag_ref"],
    "precision": s["bag_hit"] / s["bag_hyp"] if s["bag_hyp"] else 0,
    "seconds": statistics.median(row["seconds"] for row in rows),
    "pages": len(rows),
  }


def pct(x):
  return f"{100 * x:.1f}"


def table(head, rows):
  out = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
  return "\n".join(out + ["| " + " | ".join(str(c) for c in row) + " |" for row in rows])


def main():
  manifest = json.loads((PAGES / "manifest.json").read_text(encoding="utf-8"))
  pages = {p["file"]: p for p in manifest["pages"]}
  engines = [e for e in ENGINES if (RESULTS / f"{e}.meta.json").exists()]
  scored = defaultdict(list)
  for engine in engines:
    for line in (RESULTS / f"{engine}.jsonl").read_text(encoding="utf-8").splitlines():
      row = json.loads(line)
      page = pages.get(row["file"])
      if page is None:
        continue
      truth = (PAGES / f"{page['doc']}.txt").read_text(encoding="utf-8")
      scored[engine].append({**page, "seconds": row["seconds"], **score(truth, row["text"])})

  def pick(engine, test):
    return agg([r for r in scored[engine] if test(r)])

  for metric, title in (("recall", "word recall"), ("cer", "CER loose"), ("wer", "WER loose"),
                        ("precision", "word precision")):
    print(f"\n## {title} (%)\n")
    rows = []
    for e in engines:
      rows.append([e] + [pct(pick(e, lambda r, g=g: (r["lang"], r["variant"]) == g[:2])[metric]) for g in GROUPS])
    print(table(["engine"] + [g[2] for g in GROUPS], rows))

  print("\n## Word recall per source, scans (%)\n")
  sources = list(dict.fromkeys(p.get("index") for p in manifest["pages"] if p["variant"] == "scan"))
  rows = []
  for source in sources:
    rows.append([source] + [pct(pick(e, lambda r, s=source: r.get("index") == s and r["variant"] == "scan")["recall"])
                            for e in engines])
  print(table(["source"] + engines, rows))

  print("\n## Median seconds per page\n")
  rows = [[e] + [f"{pick(e, lambda r, g=g: (r['lang'], r['variant']) == g[:2])['seconds']:.2f}" for g in GROUPS]
          for e in engines]
  print(table(["engine"] + [g[2] for g in GROUPS], rows))
  pages_count = Counter((p["lang"], p["variant"]) for p in manifest["pages"])
  print("\npages: " + ", ".join(f"{g[2]} {pages_count[g[:2]]}" for g in GROUPS))

  (RESULTS / "scores.json").write_text(
    json.dumps({e: scored[e] for e in engines}, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
  main()
