"""Runs `tesseract stdin stdout -l rus+eng` once per page, as cli-core 0.742.0 does (src/attachments/tesseract.ts).

tesseract-fast-psm1 adds `--psm 1`: Tesseract's own page orientation and script detection, which cli-core adds when the
osd data is installed (WireCatLabs/cli-core#3310).
"""

import json
import os
import resource
import statistics
import subprocess
import sys
import time
from pathlib import Path

PAGES = Path("/pages")
OUT = Path("/out")
DATA = {
  "tesseract-fast": (None, []),
  "tesseract-best": ("/opt/tessdata_best", []),
  "tesseract-fast-psm1": (None, ["--psm", "1"]),
}


def read(image, data, extra):
  env = dict(os.environ)
  if data:
    env["TESSDATA_PREFIX"] = data
  start = time.perf_counter()
  command = ["tesseract", "stdin", "stdout", "-l", "rus+eng", *extra]
  done = subprocess.run(command, input=image, capture_output=True, env=env)
  if done.returncode != 0:
    raise RuntimeError(done.stderr.decode())
  return time.perf_counter() - start, done.stdout.decode().strip()


def main():
  manifest = json.loads((PAGES / "manifest.json").read_text())
  version = subprocess.run(["tesseract", "--version"], capture_output=True, text=True).stdout.splitlines()[0]
  blank = (PAGES / "blank.png").read_bytes()
  for engine, (data, extra) in DATA.items():
    if len(sys.argv) > 1 and engine not in sys.argv[1:]:
      continue
    startup = statistics.median(read(blank, data, extra)[0] for _ in range(5))
    with open(OUT / f"{engine}.jsonl", "w", encoding="utf-8") as out:
      for i, page in enumerate(manifest["pages"]):
        seconds, text = read((PAGES / page["file"]).read_bytes(), data, extra)
        out.write(json.dumps({"file": page["file"], "seconds": seconds, "text": text}, ensure_ascii=False) + "\n")
        out.flush()
        if i % 10 == 0:
          print(f"{engine} {i + 1}/{len(manifest['pages'])}", flush=True)
    meta = {
      "engine": engine,
      "version": version,
      "command": " ".join(["tesseract stdin stdout -l rus+eng", *extra]),
      "tessdata": data or "/usr/share/tesseract-ocr/5/tessdata (Ubuntu packages)",
      "load_seconds": startup,
      "peak_rss_mb": resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss / 1024,
    }
    (OUT / f"{engine}.meta.json").write_text(json.dumps(meta, indent=1))
    print(meta, flush=True)


if __name__ == "__main__":
  main()
