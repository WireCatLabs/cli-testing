"""Reads every page with one Python engine and writes <engine>.jsonl and <engine>.meta.json.

Usage, inside that engine's venv: python run_python.py <engine> <pages dir> <results dir> [model dir]
Engines: doctr-official (python-doctr, PyTorch), doctr-ru-onnx (OnnxTR with a community Russian model),
paddle-eslav (PaddleOCR 3.x, eslav_PP-OCRv5_mobile_rec with the server detector), paddle-eslav-mobile (the same
with the mobile detector).
"""

import json
import resource
import sys
import time
from importlib.metadata import version
from pathlib import Path

ENGINE, PAGES, OUT = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
MODEL_DIR = Path(sys.argv[4]) if len(sys.argv) > 4 else None
# On real scans the page orientation model turned upright pages upside down; this reads every page as it lies.
# The crop orientation model turns some Cyrillic words upside down, so it is off in both.
STRAIGHT = {"assume_straight_pages": True, "disable_crop_orientation": True}
TURNING = {"assume_straight_pages": False, "detect_orientation": True, "straighten_pages": True,
           "disable_crop_orientation": True}


def doctr_official(options=TURNING):
  from doctr.io import DocumentFile
  from doctr.models import ocr_predictor

  predictor = ocr_predictor(
    det_arch="db_resnet50",
    reco_arch="crnn_vgg16_bn",
    pretrained=True,
    **options,
  )
  config = {
    "det": "db_resnet50",
    "reco": "crnn_vgg16_bn (french vocab)",
    "options": ", ".join(f"{k}={v}" for k, v in options.items()),
  }
  return lambda path: predictor(DocumentFile.from_images(str(path))).render(), config, ["python-doctr", "torch"]


def doctr_ru_onnx(options=TURNING):
  from onnxtr.io import DocumentFile
  from onnxtr.models import ocr_predictor, parseq

  cfg = json.loads((MODEL_DIR / "config.json").read_text(encoding="utf-8"))
  reco = parseq(str(MODEL_DIR / "model.onnx"), vocab=cfg["vocab"])
  predictor = ocr_predictor(
    det_arch="db_resnet50",
    reco_arch=reco,
    **options,
  )
  config = {
    "det": "db_resnet50 (OnnxTR)",
    "reco": "graycat660/doctr-parseq-russian-onnx (community, vocab russian_latin)",
    "options": ", ".join(f"{k}={v}" for k, v in options.items()),
  }
  return lambda path: predictor(DocumentFile.from_images(str(path))).render(), config, ["onnxtr", "onnxruntime"]


def paddle_eslav(det="PP-OCRv5_server_det"):
  from paddleocr import PaddleOCR

  # PP-OCRv5_server_det is what PaddleOCR 3.7.0 picks for lang="ru" (paddleocr/_pipelines/ocr.py,
  # _get_ocr_model_names); the mobile detector is the small one a Node port over ONNX would ship.
  options = {
    "text_detection_model_name": det,
    "text_recognition_model_name": "eslav_PP-OCRv5_mobile_rec",
    "use_doc_orientation_classify": True,
    "use_doc_unwarping": False,
    # Like docTR's crop orientation, the line orientation model turns upright Russian lines upside down.
    "use_textline_orientation": False,
  }
  ocr = PaddleOCR(device="cpu", cpu_threads=8, **options)

  def read(path):
    lines = []
    for result in ocr.predict(str(path)):
      lines.extend(result["rec_texts"])
    return "\n".join(lines)

  config = {"det": options["text_detection_model_name"], "reco": options["text_recognition_model_name"],
            "options": ", ".join(f"{k}={v}" for k, v in options.items() if k.startswith("use_"))}
  return read, config, ["paddleocr", "paddlepaddle", "paddlex"]


def main():
  start = time.perf_counter()
  read, config, packages = {"doctr-official": doctr_official, "doctr-ru-onnx": doctr_ru_onnx,
                            "doctr-official-straight": lambda: doctr_official(STRAIGHT),
                            "doctr-ru-onnx-straight": lambda: doctr_ru_onnx(STRAIGHT),
                            "paddle-eslav": paddle_eslav,
                            "paddle-eslav-mobile": lambda: paddle_eslav("PP-OCRv5_mobile_det")}[ENGINE]()
  read(PAGES / "blank.png")
  load = time.perf_counter() - start
  manifest = json.loads((PAGES / "manifest.json").read_text())
  # One page read before timing, so the first timed page does not pay for lazy set-up.
  read(PAGES / manifest["pages"][0]["file"])
  with open(OUT / f"{ENGINE}.jsonl", "w", encoding="utf-8") as out:
    for i, page in enumerate(manifest["pages"]):
      t = time.perf_counter()
      text = read(PAGES / page["file"])
      seconds = time.perf_counter() - t
      out.write(json.dumps({"file": page["file"], "seconds": seconds, "text": text}, ensure_ascii=False) + "\n")
      out.flush()
      if i % 10 == 0:
        print(f"{ENGINE} {i + 1}/{len(manifest['pages'])} {seconds:.2f}s", flush=True)
  meta = {
    "engine": ENGINE,
    "versions": {p: version(p) for p in packages},
    **config,
    "load_seconds": load,
    "peak_rss_mb": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024,
  }
  (OUT / f"{ENGINE}.meta.json").write_text(json.dumps(meta, indent=1))
  print(meta)


if __name__ == "__main__":
  main()
