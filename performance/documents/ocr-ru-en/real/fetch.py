# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow==11.3.0", "numpy==2.3.4", "pyarrow==22.0.0"]
# ///
"""Downloads the real-scan sample: validated Wikisource pages (Russian and English) and CORD v2 receipt photos.

Usage: uv run fetch.py <out dir> [--select]
  --select picks the pages anew from Wikisource and rewrites selection.json beside this script; without it the pages
  and revisions listed in selection.json are fetched, so a rerun reads the same text.
Nothing here is committed but this script and selection.json: the images stay in <out dir>.
"""

import html
import io
import json
import random
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

import pyarrow.parquet as pq
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from generate import phone_jpeg  # noqa: E402

OUT = Path(sys.argv[1])
SELECT = "--select" in sys.argv
SELECTION = HERE / "selection.json"
UA = "wirecat-ocr-bench/0.1 (https://github.com/WireCatLabs/cli-testing)"
PER_SOURCE = 4
MIN_CHARS = 600
OLD_LETTERS = re.compile("[ѣѢіІѳѲѵѴ]")
SOURCES = {
  "ru": [
    "Дьяволиада (М. Булгаков, 1925).djvu",
    "Рассказы (Булгаков, 1926).djvu",
    "Дни Турбиных (Белая гвардия) (Булгаков, 1927).djvu",
    "Алые паруса (Грин, 1923).djvu",
    "Мораль с марксистской точки зрения (Луначарский, 1925).pdf",
    "Дирижабли (Циолковский 1931).pdf",
    "БСЭ-1 Том 35. Крестьянская газета - Ларсон (1937).pdf",
    "Петрушевский Д.М. (ред.). Памятники истории Англии XI-XIII вв. 1936.djvu",
    "Институтка (Марко Вовчок, 1954).djvu",
    "Горнфельд А. Г. Новые словечки и старые слова. 1922.pdf",
    "Собрание законодательства РФ. 2014. № 31.pdf",
  ],
  "en": [
    "The 9-11 Commission Report (Official Government Edition).djvu",
    "EB1911 - Volume 25.djvu",
    "Orthodoxy (1908).djvu",
    "100 Things You Should Know About Communism Series (IA 100thingsyoushou1949unit).djvu",
    "Australian Government Cabinet Handbook 15th edition.pdf",
  ],
}
HOSTS = {"ru": "ru.wikisource.org", "en": "en.wikisource.org"}
PAGE_NS = 104
WIDTH = 1920
CORD = (
  "https://huggingface.co/datasets/naver-clova-ix/cord-v2/resolve/7f0115a4b758a71d6473b8d085751692da2fef98/"
  "data/test-00000-of-00001-9c204eb3f4e11791.parquet"
)
CORD_EVERY = 4
# Scans whose licence allows this use; ru.wikisource also hosts fair-use scans (the 1937 encyclopedia), left out.
LICENCES = {"Public domain", "CC BY 4.0", "CC BY-SA 4.0"}


def fetch(url, data=None):
  for attempt in range(5):
    try:
      time.sleep(1)
      request = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
      with urllib.request.urlopen(request, timeout=120) as r:
        return r.read()
    except urllib.error.HTTPError as error:
      if error.code not in (429, 503) or attempt == 4:
        raise
      time.sleep(10 * (attempt + 1))


def api(host, **params):
  # A POST: page text sent to be rendered is too long for a URL.
  data = urllib.parse.urlencode({**params, "format": "json", "formatversion": 2, "maxlag": 5}).encode()
  return json.loads(fetch(f"https://{host}/w/api.php", data))


class Text(HTMLParser):
  """The visible text of rendered wikitext: blocks on their own lines, no edit links or hidden spans."""

  BLOCKS = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "table", "dd", "dt"}

  def __init__(self):
    super().__init__()
    self.parts, self.hidden = [], 0

  def handle_starttag(self, tag, attrs):
    style = dict(attrs).get("style") or ""
    if tag in ("style", "script") or "display:none" in style.replace(" ", ""):
      self.hidden += 1
    if tag in self.BLOCKS:
      self.parts.append("\n")

  def handle_endtag(self, tag):
    if tag in ("style", "script") and self.hidden:
      self.hidden -= 1
    if tag in self.BLOCKS:
      self.parts.append("\n")

  def handle_data(self, data):
    if not self.hidden:
      self.parts.append(data)


def body_of(content):
  """The page's own text: the header and footer (running heads, page numbers) are left out; footnotes go last."""
  parts = re.match(r"(?s)^<noinclude>.*?</noinclude>(.*?)(?:<noinclude>.*</noinclude>)?\s*$", content)
  body = parts.group(1) if parts else content
  notes = re.findall(r"(?s)<ref[^>/]*>(.*?)</ref>", body)
  body = re.sub(r"(?s)<ref[^>/]*>.*?</ref>|<ref[^>]*/>", "", body)
  return body + ("\n\n" + "\n".join(notes) if notes else "")


def rendered(host, title, wikitext):
  page = api(host, action="parse", title=title, text=wikitext, contentmodel="wikitext", prop="text",
             disablelimitreport=1, disableeditsection=1)
  parser = Text()
  parser.feed(page["parse"]["text"])
  text = html.unescape("".join(parser.parts)).replace(" ", " ").replace(" ", " ").replace(" ", " ")
  return "\n".join(line.strip() for line in text.splitlines() if line.strip())


def validated(host, index):
  """Validated pages of one scan, with their revision and text, in page order."""
  pages, cont = [], {}
  while True:
    r = api(host, action="query", generator="allpages", gapnamespace=PAGE_NS, gapprefix=f"{index}/", gaplimit=50,
            prop="revisions|proofread", rvprop="ids|content", rvslots="main", **cont)
    for page in r.get("query", {}).get("pages", []):
      if page.get("proofread", {}).get("quality") == 4 and "revisions" in page:
        rev = page["revisions"][0]
        pages.append({"title": page["title"], "revid": rev["revid"], "content": rev["slots"]["main"]["content"]})
    if "continue" not in r:
      break
    cont = r["continue"]
  return sorted(pages, key=lambda p: int(p["title"].rsplit("/", 1)[1]))


def select():
  chosen = []
  for lang, indexes in SOURCES.items():
    for index in indexes:
      pages = [p for p in validated(HOSTS[lang], index) if len(body_of(p["content"])) >= MIN_CHARS]
      if lang == "ru":
        pages = [p for p in pages if not OLD_LETTERS.search(p["content"])]
      picks = [pages[round((2 * i + 1) * len(pages) / (2 * PER_SOURCE)) - 1] for i in range(PER_SOURCE)] if len(
        pages) >= PER_SOURCE else pages
      print(f"{lang} {index}: {len(pages)} validated text pages, {len(picks)} taken", flush=True)
      chosen += [{"lang": lang, "index": index, "title": p["title"], "revid": p["revid"]} for p in picks]
  random.Random(20261124).shuffle(chosen)
  SELECTION.write_text(json.dumps({"wikisource": chosen, "cord": {"url": CORD, "every": CORD_EVERY}},
                                  ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def scan_of(host, index, number):
  r = api(host, action="query", titles=f"File:{index}", prop="imageinfo", iiprop="url|extmetadata",
          iiurlwidth=WIDTH, iiurlparam=f"page{number}-{WIDTH}px")
  info = r["query"]["pages"][0]["imageinfo"][0]
  meta = info.get("extmetadata", {})
  url = info["thumburl"]
  if index.endswith(".pdf"):
    # A PDF page's size is in points (about 550 wide), so the thumbnail stops at about 60 dpi; it renders at any of
    # Wikimedia's standard widths.
    url = re.sub(r"page\d+-\d+px", f"page{number}-{WIDTH}px", url)
  return url, info["descriptionurl"], (meta.get("LicenseShortName") or {}).get("value")


def wikisource(manifest):
  picks = json.loads(SELECTION.read_text(encoding="utf-8"))["wikisource"]
  for i, pick in enumerate(picks):
    host = HOSTS[pick["lang"]]
    number = int(pick["title"].rsplit("/", 1)[1])
    doc = f"ws-{pick['lang']}-{pick['revid']}"
    file = OUT / f"{doc}__scan.jpg"
    r = api(host, action="query", revids=pick["revid"], prop="revisions", rvprop="content", rvslots="main")
    content = r["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"]
    (OUT / f"{doc}.txt").write_text(rendered(host, pick["title"], body_of(content)) + "\n", encoding="utf-8")
    url, source, licence = scan_of(host, pick["index"], number)
    if licence not in LICENCES:
      print(f"wikisource {i + 1}/{len(picks)} {pick['title']}: left out, scan licence {licence}", flush=True)
      continue
    if not file.exists():
      file.write_bytes(fetch(url))
    entry = {"doc": doc, "lang": pick["lang"], "kind": "book-scan", "index": pick["index"], "title": pick["title"],
             "revid": pick["revid"], "scan": source, "scan_licence": licence,
             "text": f"https://{host}/w/index.php?oldid={pick['revid']}"}
    manifest["pages"].append({**entry, "file": file.name, "variant": "scan"})
    if pick["lang"] == "ru":
      photo = OUT / f"{doc}__phone-sim.jpg"
      if not photo.exists():
        img, _ = phone_jpeg(Image.open(file).convert("L"), random.Random(f"20261124:{doc}"))
        img.save(photo, "JPEG", quality=35)
      manifest["pages"].append({**entry, "file": photo.name, "variant": "phone-sim"})
    print(f"wikisource {i + 1}/{len(picks)} {pick['title']}", flush=True)


def cord_text(ground_truth):
  """CORD's words as lines: its row ids, top to bottom, each row left to right."""
  rows = {}
  for line in json.loads(ground_truth)["valid_line"]:
    for word in line["words"]:
      rows.setdefault(word["row_id"], []).append((word["quad"]["x1"], word["quad"]["y1"], word["text"]))
  ordered = sorted(rows.values(), key=lambda words: min(y for _, y, _ in words))
  return "\n".join(" ".join(text for _, _, text in sorted(words)) for words in ordered)


def cord(manifest):
  parquet = OUT / "cord-v2-test.parquet"
  if not parquet.exists():
    parquet.write_bytes(fetch(CORD))
  table = pq.read_table(parquet).to_pylist()
  for i, row in enumerate(table[::CORD_EVERY]):
    doc = f"cord-{i * CORD_EVERY:03d}"
    file = OUT / f"{doc}__photo.jpg"
    if not file.exists():
      Image.open(io.BytesIO(row["image"]["bytes"])).convert("RGB").save(file, "JPEG", quality=92)
    (OUT / f"{doc}.txt").write_text(cord_text(row["ground_truth"]) + "\n", encoding="utf-8")
    manifest["pages"].append({"doc": doc, "lang": "en", "kind": "receipt-photo", "file": file.name,
                              "variant": "photo", "source": "CORD v2 test", "licence": "CC BY 4.0"})


def main():
  OUT.mkdir(parents=True, exist_ok=True)
  print(f"pages go to {OUT}", flush=True)
  if SELECT:
    select()
  manifest = {"pages": []}
  wikisource(manifest)
  cord(manifest)
  Image.new("RGB", (64, 64), "white").save(OUT / "blank.png")
  (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
  print(f"{len(manifest['pages'])} pages", flush=True)


if __name__ == "__main__":
  main()
