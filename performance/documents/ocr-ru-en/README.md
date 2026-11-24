# OCR on Russian and English pages: Tesseract, docTR, PaddleOCR

Measured 2026-11-24 on 56 synthetic pages.

## Why we ran it

WireCat CLIs now read scans and pictures for search. ydisk 0.7.0 and drive 0.75.x do it through cli-core 0.742.0.
The default is `read_scans: local`: cli-core runs the system `tesseract` program with Russian and English data,
one process per page (`tesseract stdin stdout -l rus+eng`, in cli-core `src/attachments/tesseract.ts` at
`02236c6b9`).

The owner asked whether Tesseract is good enough. The independent
[OmniDocBench](https://github.com/opendatalab/OmniDocBench) puts PaddleOCR far ahead of Tesseract, but it has only
English and Chinese pages. The owner also expected docTR to beat Tesseract. Nobody had compared them on Russian.

The question: on Russian, English and mixed paperwork, scanned and photographed, which local engine reads the text
best, and at what cost in install size, speed and memory? The answer picks the engine behind `read_scans: local`, or
an engine to add as an option.

## Setup

**Engines.** All local, CPU only, 8 threads (`taskset -c 0-7`, `OMP_NUM_THREADS=8`, Docker `--cpuset-cpus 0-7`).

| name | what runs | models |
|---|---|---|
| tesseract-fast | Tesseract 5.3.4 (Ubuntu 24.04 package), the exact cli-core command | Ubuntu's `tesseract-ocr-rus` and `-eng` 4.1.0, which are the tessdata_fast models (3.9 MB and 4.1 MB) |
| tesseract-best | the same program and command, `TESSDATA_PREFIX` set to the best models | [tessdata_best](https://github.com/tesseract-ocr/tessdata_best) `rus` and `eng` at commit `e12c65a`, sha256 checked in the [Dockerfile](tesseract/Dockerfile) |
| tesseract-fast-psm1 | tesseract-fast with `--psm 1` added: Tesseract's own page orientation and script detection | the fast models and Ubuntu's `osd` data, which `tesseract-ocr` installs anyway |
| doctr-official | [docTR](https://github.com/mindee/doctr) 1.1.0, PyTorch 2.15.0 CPU | `db_resnet50` detection, `crnn_vgg16_bn` recognition: docTR's defaults |
| doctr-ru-onnx | [OnnxTR](https://github.com/felixdittrich92/OnnxTR) 0.10.0 (docTR's pipeline on onnxruntime 1.32.0) | OnnxTR's `db_resnet50` detection, recognition [graycat660/doctr-parseq-russian-onnx](https://huggingface.co/graycat660/doctr-parseq-russian-onnx) at `d052b72`, `model.onnx` sha256 `7e3630803a05ad8f8e180db658272a145384de6135a546affb1538ce51c08e84` |
| paddle-eslav | [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) 3.7.0, PaddlePaddle 3.2.2 CPU | `PP-OCRv5_server_det` detection, `eslav_PP-OCRv5_mobile_rec` recognition: what PaddleOCR picks for `lang="ru"` |
| paddle-eslav-mobile | the same | `PP-OCRv5_mobile_det` detection, the same recognition: the small set a port to Node would ship |

What each engine can read, from its own code and docs:

- **docTR has no official model that reads Cyrillic.** Every pretrained recognition model in docTR 1.1.0 uses the
  `french` vocabulary (`doctr/models/recognition/*/pytorch.py`). The `multilingual` vocabulary
  (`doctr/datasets/vocabs.py`) and the community model built on it, `Felix92/doctr-torch-parseq-multilingual-v1`, are
  Latin script only. docTR's own docs list no Cyrillic model
  ([sharing models](https://mindee.github.io/doctr/using_doctr/sharing_models.html)).
  So doctr-official is in the test to show what an install of docTR does with Russian today.
- **doctr-ru-onnx is a third-party model, not docTR's.** It is a docTR PARSeq model fine-tuned for Russian and Latin
  text by one person, published in October 2026 under Apache-2.0, with about 75 downloads. Its card says it was
  trained on 1.5 million synthetic word images rendered from about 130 fonts, and that real scans will score lower.
  Our pages are synthetic too, so it may score better here than on real scans.
- **PaddleOCR 3.7.0 maps `lang="ru"` to `eslav_PP-OCRv5_mobile_rec`** (Russian, Belarusian, Ukrainian and English,
  `paddleocr/_pipelines/ocr.py` and `_utils/langs.py`). **PP-OCRv6 has no Cyrillic model**: its languages are
  Chinese, English, Japanese and Latin-script languages (`_PPOCRV6_LANGS` in the same file;
  [PP-OCRv6 docs](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv6/PP-OCRv6.html)).

**Options, the same on every page.** No tuning per variant.

- Tesseract: none, as cli-core runs it. Page segmentation mode 3 (the default) does not turn a page lying on its side;
  tesseract-fast-psm1 adds `--psm 1`, which does.
- docTR and OnnxTR: `assume_straight_pages=False, detect_orientation=True, straighten_pages=True,
  disable_crop_orientation=True`. The page is turned upright first.
- PaddleOCR: `use_doc_orientation_classify=True, use_doc_unwarping=False, use_textline_orientation=False`.

The per-word and per-line orientation models were turned off in both docTR and PaddleOCR after a first run. They
turned upright Russian words and lines upside down. See [what it showed](#what-it-showed).

**What cli-core feeds Tesseract.** A picture goes to `tesseract` as it is, if it is at most 4 MB, 20 megapixels and
8000 px a side; a larger one is skipped (`src/attachments/ocr.ts`, `src/models/types.ts`). A scanned PDF page is
rendered at `min(2, 2000 / width, 2000 / height)` times its size in points, about 144 dpi for A4. So the
scan-150dpi variant is what cli-core reads from a scanned PDF, and the 300 dpi times are an upper bound. The
noise-blur PNGs here are 8.9 to 9.3 MB, so cli-core would skip them as files; a real scanner saves such a page as a
much smaller JPEG.

**Data.** [generate.py](generate.py) renders 8 documents with Pillow from seed `20261124`, all names and numbers
invented: a Russian contract, a Russian invoice with a table, a Russian official letter, a Russian shop receipt in a
narrow column, an English letter, an English invoice with a table, a two-column Russian and English policy, and a
Russian service agreement full of English names, addresses and product names. Fonts are free and ship with Ubuntu:
Liberation Serif and Sans, DejaVu Sans and Sans Mono, Noto Serif and Sans. Their sha256 are written to the
manifest ([results/pages-manifest.json](results/pages-manifest.json)). The phone numbers in the documents are made up
for the test. Each document is made in 7 variants:

| variant | what it is |
|---|---|
| clean-300dpi | the rendered page, 2480 × 3508 |
| scan-150dpi | the same page at half the size |
| noise-blur | Gaussian blur (radius 1.6) and Gaussian noise (sigma 28) |
| rotated-2-5deg | turned by 2 to 5 degrees |
| rotated-90deg | turned on its side |
| photo-perspective | the page on a dark desk, shot at a slant, light falling off to one corner, slight blur |
| phone-jpeg | the same kind of photo scaled to 1600 px on the long side, JPEG quality 35 |

That makes 56 pages (24 Russian, 16 English, 16 mixed). No image is committed: the generator rebuilds the same files
from the seed (checked: identical bytes on a second run). The expected text reads a table row by row and two columns
one after the other, left first.

**Metrics.** [score.py](score.py), with [rapidfuzz](https://github.com/rapidfuzz/RapidFuzz) 3.14.6 for edit distance.

- CER and WER: edit distance over characters and over words, divided by the length of the expected text, summed over
  the pages of a group. Whitespace is collapsed first. **raw** keeps case and punctuation. **loose** lowercases,
  drops punctuation and treats ё as е: what a search would still find.
- **Word bag F1**: the loose words as a bag, order ignored. A page with a low CER but a high word bag F1 has its words
  right and its order wrong. That is a layout failure (columns read across, a table read down, lines split), not a
  recognition failure.
- Time per page: wall time of one page after the model is loaded and one page was read to warm up. For Tesseract it
  is the whole `tesseract` process, as cli-core pays it, so the model load is in every page.
- Load: for Python engines, from the start of the script to a blank picture read; for Tesseract, the median of 5
  blank pictures.
- Peak RSS: the largest resident memory of the process over the whole run (`getrusage`).
- Install size: the venv (`du -sb`) plus downloaded models; for Tesseract, the installed size of the Ubuntu packages
  it adds to a bare `ubuntu:24.04`.

**Machine.** AMD Ryzen AI 9 HX 370 (12 cores, 24 threads), 59 GB RAM, Linux 7.0.0-44, Python 3.12, uv. Other work
was running on the machine. One engine ran at a time.

**Run**, in this folder:

```sh
uv run generate.py ~/.cache/wirecat-ocr-bench/pages

docker build -t wirecat-ocr-tesseract tesseract
for e in tesseract-fast tesseract-best tesseract-fast-psm1; do
  docker run --rm --cpuset-cpus 0-7 -v ~/.cache/wirecat-ocr-bench/pages:/pages:ro \
    -v ~/.cache/wirecat-ocr-bench/results:/out wirecat-ocr-tesseract $e
done

uv venv ~/.cache/wirecat-ocr-bench/venv-doctr --python 3.12
VIRTUAL_ENV=~/.cache/wirecat-ocr-bench/venv-doctr uv pip install torch==2.15.0 torchvision==0.29.2 \
  --index-url https://download.pytorch.org/whl/cpu
VIRTUAL_ENV=~/.cache/wirecat-ocr-bench/venv-doctr uv pip install python-doctr==1.1.0
uv venv ~/.cache/wirecat-ocr-bench/venv-onnxtr --python 3.12
VIRTUAL_ENV=~/.cache/wirecat-ocr-bench/venv-onnxtr uv pip install "onnxtr[cpu]==0.10.0"
uv venv ~/.cache/wirecat-ocr-bench/venv-paddle --python 3.12
VIRTUAL_ENV=~/.cache/wirecat-ocr-bench/venv-paddle uv pip install paddlepaddle==3.2.2 paddleocr==3.7.0
mkdir -p ~/.cache/wirecat-ocr-bench/hf/parseq-ru
for f in model.onnx config.json; do
  curl -sSfL -o ~/.cache/wirecat-ocr-bench/hf/parseq-ru/$f \
    https://huggingface.co/graycat660/doctr-parseq-russian-onnx/resolve/d052b72f062ec8914a0dd9a892f21b11165e2ab0/$f
done
(cd ~/.cache/wirecat-ocr-bench/hf/parseq-ru &&
  echo "7e3630803a05ad8f8e180db658272a145384de6135a546affb1538ce51c08e84  model.onnx" | sha256sum -c)

B=~/.cache/wirecat-ocr-bench
OMP_NUM_THREADS=8 taskset -c 0-7 $B/venv-doctr/bin/python run_python.py doctr-official $B/pages $B/results
OMP_NUM_THREADS=8 taskset -c 0-7 $B/venv-onnxtr/bin/python run_python.py doctr-ru-onnx $B/pages $B/results \
  $B/hf/parseq-ru
for e in paddle-eslav paddle-eslav-mobile; do
  OMP_NUM_THREADS=8 taskset -c 0-7 $B/venv-paddle/bin/python run_python.py $e $B/pages $B/results
done
uv run score.py $B/pages $B/results
```

docTR, OnnxTR and PaddleX download their other models on first use, unpinned: docTR from doctr-static.mindee.com,
OnnxTR from its GitHub releases, PaddleX from Hugging Face (`PaddlePaddle/<model name>`; at the time
`eslav_PP-OCRv5_mobile_rec` was at revision `7553801` and `PP-OCRv5_server_det` at `ca867c8`). Cache folders:
`DOCTR_CACHE_DIR`, `ONNXTR_CACHE_DIR`, `PADDLE_PDX_CACHE_HOME`.

[run_python.py](run_python.py) runs the Python engines. The Tesseract runner is [tesseract/run.py](tesseract/run.py).
Every engine's output, page by page, is in [results/](results/); `scores.json` there has every page's numbers.

## Results

All numbers are percentages over the pages of a group; lower CER and WER is better, higher word bag F1 is better.
"Photo" is the two photo variants together. Every table is printed by `score.py`; the full print is
[results/tables.md](results/tables.md).

### Headline: CER loose

| engine | RU clean | RU photo | EN clean | EN photo | mixed clean | mixed photo |
|---|---|---|---|---|---|---|
| tesseract-fast | 1.0 | 23.7 | 0.1 | 21.0 | 0.7 | 13.3 |
| tesseract-best | 0.2 | 23.2 | 0.1 | 20.8 | 0.4 | 13.1 |
| tesseract-fast-psm1 | 1.0 | 23.7 | 0.1 | 21.0 | 0.7 | 13.3 |
| doctr-official | 77.7 | 76.7 | 0.1 | 0.1 | 51.7 | 51.7 |
| doctr-ru-onnx | 0.6 | 0.3 | 0.6 | 0.5 | 0.5 | 0.5 |
| paddle-eslav | 0.8 | 26.5 | 0.0 | 38.6 | 46.0 | 56.8 |
| paddle-eslav-mobile | 0.7 | 23.1 | 0.2 | 22.7 | 45.5 | 57.9 |

### By language, all 7 variants

| engine | RU CER raw | RU CER loose | RU WER loose | RU word bag F1 | EN CER loose | EN word bag F1 | mixed CER loose | mixed word bag F1 |
|---|---|---|---|---|---|---|---|---|
| tesseract-fast | 23.9 | 21.2 | 29.7 | 80.1 | 25.6 | 79.4 | 21.3 | 82.0 |
| tesseract-best | 24.0 | 21.5 | 28.7 | 81.4 | 25.2 | 80.2 | 21.5 | 82.3 |
| tesseract-fast-psm1 | 11.9 | 9.2 | 15.9 | 93.0 | 15.0 | 93.7 | 9.0 | 95.5 |
| doctr-official | 75.2 | 77.1 | 75.9 | 26.8 | 0.1 | 99.7 | 51.8 | 50.3 |
| doctr-ru-onnx | 4.2 | 0.5 | 2.1 | 98.0 | 0.6 | 98.0 | 0.5 | 97.4 |
| paddle-eslav | 12.7 | 10.0 | 15.2 | 93.3 | 12.0 | 96.9 | 49.3 | 84.9 |
| paddle-eslav-mobile | 11.1 | 8.3 | 14.5 | 95.2 | 7.5 | 99.4 | 49.2 | 91.7 |

doctr-ru-onnx's raw CER (4.2) is much higher than its loose CER (0.5) on Russian: about half of its wrong words on
clean Russian pages differ only in letter case (`С`/`с`, `О`/`о`), which search ignores. Raw WER and the tables
without the 90° pages are in
[results/tables.md](results/tables.md).

### By variant, CER loose, all 8 documents

| engine | clean 300 dpi | 150 dpi | noise and blur | rotated 2–5° | rotated 90° | photo | phone JPEG |
|---|---|---|---|---|---|---|---|
| tesseract-fast | 0.7 | 0.7 | 2.3 | 26.6 | 85.3 | 29.1 | 11.3 |
| tesseract-best | 0.3 | 0.8 | 1.6 | 27.3 | 86.8 | 28.9 | 10.8 |
| tesseract-fast-psm1 | 0.7 | 0.7 | 2.3 | 26.6 | 2.8 | 29.1 | 11.3 |
| doctr-official | 52.5 | 52.3 | 51.9 | 52.5 | 52.5 | 52.2 | 51.8 |
| doctr-ru-onnx | 0.6 | 0.5 | 0.5 | 0.7 | 0.6 | 0.4 | 0.4 |
| paddle-eslav | 13.1 | 13.0 | 15.6 | 18.7 | 13.1 | 59.8 | 15.5 |
| paddle-eslav-mobile | 12.9 | 12.9 | 14.0 | 17.8 | 12.8 | 49.6 | 15.5 |

### By variant, word bag F1 (order ignored)

| engine | clean 300 dpi | 150 dpi | noise and blur | rotated 2–5° | rotated 90° | photo | phone JPEG |
|---|---|---|---|---|---|---|---|
| tesseract-fast | 97.8 | 98.3 | 95.1 | 79.7 | 7.4 | 94.2 | 92.7 |
| tesseract-best | 99.2 | 98.2 | 96.5 | 80.0 | 7.9 | 94.8 | 94.4 |
| tesseract-fast-psm1 | 97.8 | 98.3 | 95.1 | 79.7 | 97.5 | 94.2 | 92.7 |
| doctr-official | 51.1 | 51.3 | 51.4 | 51.2 | 51.1 | 51.3 | 51.3 |
| doctr-ru-onnx | 97.8 | 98.0 | 97.8 | 97.5 | 97.8 | 98.2 | 98.1 |
| paddle-eslav | 95.5 | 95.5 | 91.3 | 95.3 | 95.3 | 72.6 | 95.0 |
| paddle-eslav-mobile | 95.9 | 96.2 | 93.9 | 95.6 | 96.0 | 94.1 | 95.4 |

### Layout: CER loose / word bag F1 per document, clean 300 dpi

| engine | ru-contract | ru-invoice | ru-letter | ru-receipt | en-letter | en-invoice | mix-two-columns | mix-contract |
|---|---|---|---|---|---|---|---|---|
| tesseract-fast | 0.0 / 100 | 1.2 / 96.7 | 0.6 / 97.2 | 5.3 / 86.0 | 0.0 / 100 | 0.3 / 99.3 | 0.2 / 98.5 | 1.2 / 97.9 |
| tesseract-best | 0.0 / 100 | 0.4 / 98.1 | 0.0 / 100 | 1.4 / 96.3 | 0.0 / 100 | 0.3 / 99.3 | 0.0 / 100 | 0.8 / 98.2 |
| tesseract-fast-psm1 | 0.0 / 100 | 1.2 / 96.7 | 0.6 / 97.2 | 5.3 / 86.0 | 0.0 / 100 | 0.3 / 99.3 | 0.2 / 98.5 | 1.2 / 97.9 |
| doctr-official | 87.9 / 13.7 | 60.3 / 40.8 | 89.7 / 8.9 | 44.5 / 60.5 | 0.0 / 100 | 0.3 / 99.3 | 42.5 / 58.9 | 62.1 / 38.7 |
| doctr-ru-onnx | 1.0 / 97.9 | 0.3 / 98.9 | 0.3 / 97.9 | 0.2 / 98.4 | 0.2 / 99.0 | 1.4 / 95.6 | 0.5 / 97.0 | 0.6 / 97.0 |
| paddle-eslav | 0.0 / 100 | 3.2 / 89.6 | 0.1 / 99.0 | 0.7 / 97.9 | 0.0 / 100 | 0.0 / 100 | 78.1 / 98.0 | 10.1 / 78.7 |
| paddle-eslav-mobile | 0.0 / 100 | 2.6 / 91.7 | 0.1 / 99.0 | 0.7 / 97.9 | 0.0 / 100 | 0.4 / 97.8 | 77.9 / 98.5 | 9.2 / 81.7 |

### Speed, memory, install size

| engine | s/page clean 300 dpi | s/page phone JPEG | load s | peak RSS MB | install MB | models download at first run from |
|---|---|---|---|---|---|---|
| tesseract-fast | 0.82 | 0.53 | 0.07 | 161 | 84 | nothing: Ubuntu packages |
| tesseract-best | 1.14 | 0.81 | 0.15 | 178 | 106 | nothing: two files added by hand |
| tesseract-fast-psm1 | 1.13 | 0.83 | 0.13 | 199 | 84 | nothing: Ubuntu packages |
| doctr-official | 4.20 | 3.63 | 6.8 | 1,760 | 1,555 | doctr-static.mindee.com (170 MB) |
| doctr-ru-onnx | 4.08 | 4.42 | 1.9 | 2,253 | 363 | GitHub releases of OnnxTR (108 MB), Hugging Face (93 MB) |
| paddle-eslav | 10.21 | 2.67 | 1.8 | 8,127 | 1,196 | Hugging Face, `PaddlePaddle/*` (100 MB) |
| paddle-eslav-mobile | 1.98 | 0.71 | 2.1 | 2,818 | 1,115 | Hugging Face, `PaddlePaddle/*` (19 MB) |

- Tesseract's time is a whole `tesseract` process per page, model load included, as cli-core runs it. The others are
  one warm process. The Python engines' load time is with the files already on disk.
- Install: Tesseract is the installed size of the 50 Ubuntu packages `tesseract-ocr tesseract-ocr-rus
  tesseract-ocr-eng` add to a bare `ubuntu:24.04` (with `--no-install-recommends`); 18 MB of it is the language data
  (rus, eng, osd). Most of the rest (ICU, X11 and font libraries) is already on a desktop. tesseract-best adds the two
  15 MB best files. The Python engines are the venv plus their models: PyTorch is most of docTR's 1.4 GB venv,
  PaddlePaddle most of Paddle's 1.1 GB; OnnxTR's venv is 162 MB.
- paddle-eslav reads a 300 dpi page with the server detector in 10 s and 8.1 GB of memory. A 150 dpi page or the
  phone JPEG takes 2.7 s.
- doctr-official's timing run shared the first minute with a short PaddleOCR check, so its first pages may be slow.

## What it showed

1. **Tesseract, as cli-core runs it, reads clean Russian scans well and photos badly.** Clean, 150 dpi and noisy
   scans: CER loose 0.3 to 2.3, Russian 1.0 (fast) and 0.2 (best). It fails in three cases:
   - **A page on its side gives nothing useful:** CER 85, word bag F1 7. The default page segmentation mode does not
     turn the page. Phone pictures and scans of a landscape page arrive like this. **`--psm 1` fixes it:** CER 2.8,
     word bag F1 97.5 on the same pages, the same text on every other page, and 0.3 s more per page.
   - **A page turned by 2 to 5 degrees** loses a fifth of its words overall (word bag F1 80, CER 27). Four of the 8
     pages read fine; on the other 4 Tesseract returns only part of the page: 13 words of the English invoice's 135,
     56 of the mixed contract's 169, 115 of the Russian invoice's 181, 153 of the English letter's 209. The pages
     are whole and easy to read; on the English invoice Tesseract returns only the three total lines. `--psm 1`
     does not change this.
   - **Photos:** CER 29 and 11, but word bag F1 94 and 93. The words are mostly right; the order is broken, because
     Tesseract cuts a slanted page into blocks and reads them out of order. Search by words still finds most of
     them; a snippet or a quote does not.
   - tessdata_best is a little better than the Ubuntu models on clean Russian (0.2 against 1.0) and on the receipt
     (1.4 against 5.3), and 40 % slower. It does not help with rotation or photos.
2. **docTR as installed cannot read Russian at all.** Every Russian word comes out in Latin look-alikes
   (`AOTOBOP` for `ДОГОВОР`): Russian CER 77, word bag F1 27. On English it is the best engine here (CER 0.1 on every
   variant, photos included). The expectation that docTR is much better than Tesseract holds for English only.
3. **docTR's pipeline with a Russian recognition model is the best engine on every variant.** doctr-ru-onnx: CER
   loose 0.4 to 0.7 on every variant, 90° and photos included, word bag F1 97.5 to 98.2. docTR's own detector and
   page straightening do the layout work: two columns, tables, slanted photos and 90° pages come out in order.
   Two caveats. The model is a third party's, recent, with few users. And it was trained on synthetic renders like
   these pages, so real scans will score lower; how much lower, this test cannot say.
4. **PaddleOCR is not better than Tesseract on Russian here.** It is better on rotated pages (CER 13 against 85 on
   90°), but worse elsewhere:
   - **English words inside Russian text come out in Cyrillic look-alikes.** `CloudDesk Pro` becomes `СlоидДеsк
     Рrо`, `Telegram` becomes `Теlедгат`, `Google Workspace` becomes `Gоодlе Wогкsрасе`. A search for those
     words does not find them. This is the mixed contract's CER 10 and word bag F1 79. It is a recognition failure
     of `eslav_PP-OCRv5_mobile_rec`.
   - **Two columns are read across**, line by line from both columns: CER 78, word bag F1 98 (layout).
   - **With the server detector, a full-size photo is cut into single words** and they come out in no useful order
     (CER 60, word bag F1 73). The mobile detector does better on the same photos (CER 50, word bag F1 94).
5. **Per-word orientation models break Russian in both docTR and PaddleOCR.** A first run had them on. docTR's
   crop orientation model turned some Russian words upside down (`кинэнигНL/OLIЧ` for `выполнения`): doctr-ru-onnx's
   Russian CER on clean pages was 3.5 instead of 0.6. PaddleOCR's text line orientation model marked 6 of 18 upright
   lines of the Russian letter as upside down, and they came back empty: Russian CER on clean pages was 21.8 instead
   of 0.8. Anyone who uses these engines for Russian has to turn them off. The first run's output is not committed;
   the numbers here are from its scores.
6. **The current PaddlePaddle release does not run this pipeline on CPU.** `paddlepaddle` 3.3.1, which `pip install`
   picks today, stops on the first page with `NotImplementedError: ConvertPirAttribute2RuntimeAttribute not support`
   in its oneDNN code ([Paddle #77340](https://github.com/PaddlePaddle/Paddle/issues/77340),
   [PaddleOCR #18162](https://github.com/PaddlePaddle/PaddleOCR/issues/18162), both open). 3.2.2 works.

## Recommendation for `read_scans: local`

**Keep Tesseract as the default and add `--psm 1` to cli-core's command now. Make docTR's pipeline with a Russian
model, run through ONNX, the candidate to replace it.** Do not add PaddleOCR or a Python dependency.

- **Tesseract** stays because it is good enough on scans (the common case for a document store), it is one system
  program (84 MB, nothing downloaded), it is fast (about 1 s a page, 200 MB of memory), and cli-core already uses
  it. `--psm 1` is a one-word change in `src/attachments/tesseract.ts` that makes pages on their side readable (CER
  85 → 2.8) and changes nothing else here. Its `osd` data comes with the `tesseract-ocr` package on Ubuntu; on other
  systems cli-core should check `--list-langs` for `osd` and leave the flag out without it. The `extractor` name
  should change with the flag, so scans already read are read again. Its other weak spots, skewed pages and photos,
  stay.
- **docTR with a Russian model** reads everything here almost perfectly, photos and turned pages included. The cost:
  about 360 MB of models and runtime, 4 s a page on 8 threads, 2.2 GB of memory. It is the most accurate option here
  that can run inside cli-core without Python:
  - docTR exports its models to ONNX (`export_model_to_onnx`,
    [docTR docs](https://mindee.github.io/doctr/using_doctr/using_model_export.html)), and OnnxTR runs that pipeline on
    onnxruntime with no PyTorch. That is what doctr-ru-onnx measured.
  - cli-core already runs local ONNX models: its embeddings run on onnxruntime through `@wirecat/cli-core-onnx`
    (`src/embeddings/onnx-runtime.ts`), with models downloaded and checked by sha256. onnxruntime-node ships CPU
    builds for Linux, macOS and Windows on x64 and arm64
    ([onnxruntime docs](https://onnxruntime.ai/docs/get-started/with-javascript/node.html)).
  - What is missing: the steps around the models (page straightening, the text detector's box decoding, word order)
    would have to be written in TypeScript, as OnnxTR does them in Python; and the Russian model is one person's
    work. Before any of that, it needs a test on real scans and photos, which this test does not have.
- **PaddleOCR** is not worth it for Russian. It mixes Cyrillic into English words, reads two columns across, and in
  Python costs 1.1 GB and up to 8 GB of memory. It does export to ONNX (official ONNX files of these models are on
  Hugging Face, for example `PaddlePaddle/eslav_PP-OCRv5_mobile_rec_onnx`, 7.9 MB, and `PP-OCRv5_mobile_det_onnx`,
  4.8 MB; [PaddleOCR ONNX docs](https://www.paddleocr.ai/v3.7.0/en/version3.x/inference_deployment/others/obtaining_onnx_models.html)),
  and npm has JavaScript runners for it (`@paddleocr/paddleocr-js` for the browser, `ppu-paddle-ocr` for Node). So
  PaddleOCR is the easier ONNX path, and the small one, but the recognition failures above would stay.

| option | accuracy here | install | speed and memory | integration |
|---|---|---|---|---|
| Tesseract (now) | scans good, 90° and photos bad | 84 MB system package | 0.8 s, 160 MB | done |
| Tesseract with `--psm 1` | scans and 90° good, skewed pages and photos bad | the same | 1.1 s, 200 MB | one flag and an `osd` check |
| docTR pipeline + Russian model on ONNX | best everywhere, synthetic data only | about 360 MB download | 4 s, 2.2 GB | new code around onnxruntime, which cli-core has |
| PaddleOCR | Russian and English alone fine, mixed text and two columns bad | 13 MB ONNX or 1.1 GB Python | 0.7–2 s, 2.8 GB (Python) | a JS runner from npm or new code |

## What was not measured

- **Real scans and photos.** Every page is a synthetic render; real paper has stamps, signatures, folds, other fonts
  and print defects. doctr-ru-onnx's model was trained on renders like these, so its lead may shrink.
- Tesseract with `--psm 0` first, with `--psm 1` and the best models together, or with any image clean-up (deskew)
  before it.
- docTR and PaddleOCR through onnxruntime-node or any JavaScript runner. OnnxTR in Python stands in for the ONNX path.
- PaddleOCR's `cyrillic_PP-OCRv5_mobile_rec`, docTR's smaller detectors, the CRNN variant of the Russian model,
  quantised models, a GPU.
- Handwriting, PDFs, table structure (a table is scored as text row by row), and pages with pictures.
- Variance: each engine read each page once. Other work was running on the machine.
