# OCR on real Russian and English scans: Tesseract and docTR

Measured 2026-11-24 on 125 pages: 40 real Russian scans, the same 40 as simulated phone photos, 20 real English scans
and 25 real receipt photos. The follow-up to the [synthetic test](../README.md).

## Why we ran it

The [synthetic test](../README.md) found docTR's pipeline with a third-party Russian model (doctr-ru-onnx) best on
every variant, and Tesseract weak on photos and pages on their side. It also warned that the Russian model was
trained on synthetic renders like those pages, so real scans could score lower.

The owner asked to check the synthetic result on real scans before deciding whether to port docTR and the Russian
model to TypeScript on onnxruntime. Meanwhile cli-core added `--psm 1` to its Tesseract call
([cli-core#3310](https://github.com/WireCatLabs/cli-core/pull/3310)).

The question: on real scanned and photographed pages, does doctr-ru-onnx still beat Tesseract as cli-core runs it?
The answer decides between staying with Tesseract and `--psm 1`, or porting docTR with the Russian model.

## Setup

**Engines.** The same programs, models and machine as the [synthetic test](../README.md#setup), one run each, 8
threads.

| name | what it is |
|---|---|
| tesseract-fast | `tesseract stdin stdout -l rus+eng`, Ubuntu's fast models: cli-core 0.742.0 |
| tesseract-fast-psm1 | the same with `--psm 1`: cli-core after #3310, when the `osd` data is installed |
| doctr-official | docTR 1.1.0, `db_resnet50` + `crnn_vgg16_bn` (no Cyrillic), with page turning as in the synthetic test |
| doctr-official-straight | the same with page turning off (`assume_straight_pages=True`) |
| doctr-ru-onnx | OnnxTR 0.10.0, `db_resnet50` + [graycat660/doctr-parseq-russian-onnx](https://huggingface.co/graycat660/doctr-parseq-russian-onnx), with page turning as in the synthetic test |
| doctr-ru-onnx-straight | the same with page turning off |

The `-straight` runs were added after the first docTR runs: on real scans docTR's page orientation model turned
upright pages upside down (see [what it showed](#what-it-showed)). Tesseract gets every page as it is, so the
straight runs are the fair comparison of recognition. PaddleOCR was left out: it did not beat Tesseract on Russian in
the synthetic test.

**Data.** No dataset of real Russian printed documents with a free licence and checked text was found:

- Hugging Face and Kaggle Russian OCR sets are handwriting, synthetic renders, or pre-1918 spelling.
- [DDI-100](https://github.com/machine-intelligence-laboratory/DDI-100) is Russian, but its README describes its
  pages as generated: book text put onto document backgrounds with synthetic distortions.
- [FUNSD](https://guillaumejaume.github.io/FUNSD/) is English forms for non-commercial research only, and
  [SROIE](https://rrc.cvc.uab.es/?ch=13) names no licence. Both were left out.

So the sample is built from three public sources:

| set | pages | what | licence | text |
|---|---|---|---|---|
| [ru.wikisource](https://ru.wikisource.org) | 40 | 10 scanned books and law gazettes, 1922–2014, modern spelling, 4 pages each | scans public domain (as tagged on each file page) | proofread twice by volunteers ("Проверена", level 4) |
| the same 40, as photos | 40 | each scan put through the synthetic test's phone photo filter (perspective, uneven light, blur, JPEG 35) | as above | as above |
| [en.wikisource](https://en.wikisource.org) | 20 | 5 scanned books and reports, 1908 to recent, 4 pages each, one two-column encyclopedia | public domain, one CC BY 4.0 | proofread twice ("Validated", level 4) |
| [CORD v2](https://huggingface.co/datasets/naver-clova-ix/cord-v2) test split | 25 | phone photos of Indonesian shop receipts, mostly English menu words and numbers, every 4th of 100 | CC BY 4.0 | the annotators' words, line by line |

There are no real Russian phone photos with checked text in the sample. The simulated ones are real page scans with a
synthetic camera on top; the receipts are the only real photos.

**Selection** ([fetch.py](fetch.py), the choice saved in [selection.json](selection.json)):

- The sources were picked by hand among scans with many validated pages, for a mix of fonts, years and layouts.
- In each source, the validated pages with at least 600 characters of text, without pre-1918 letters, spread evenly
  through the book: 4 per source.
- Scans with a fair-use tag instead of a free licence were left out (the 1937 Great Soviet Encyclopedia: 4 pages).
- Page images are Wikimedia's thumbnails asked for at 1920 px wide. For a narrower DjVu scan Wikimedia serves a
  smaller standard width (960 or 1280 px here: Алые паруса's scan is 1062 px wide and comes at 960). PDF pages are
  rendered at 1920 px. A rerun of `fetch.py` returned the same bytes for the pages checked.

The images are not committed: `uv run fetch.py <dir>` downloads the same pages and the same text revisions
(about 240 MB, with the 234 MB CORD file).

**Expected text.** For Wikisource, the page's wikitext without its header and footer (running heads and page
numbers), rendered by the Wikisource API, footnotes at the end. For CORD, the annotated words, rows top to bottom,
words left to right.

**Metrics** ([score.py](score.py)). All case and punctuation blind (`ё` as `е`), with a word broken by a hyphen at a
line end joined in both texts.

- **Word recall:** the share of the expected words found anywhere on the page, order ignored. This is the main
  metric here: search finds a document by its words, and the expected text leaves out running heads and page numbers
  that every engine reads, so order-based metrics are a little worse for everyone.
- **CER and WER:** character and word error rates against the expected text in its order. A low recall means wrong
  words; a high CER with a good recall means the words are there in another order.
- Median seconds per page, peak memory.

## Results

### Headline: word recall (%, order ignored)

| engine | RU scans | RU simulated photos | EN scans | EN receipt photos |
|---|---|---|---|---|
| tesseract-fast | **89.4** | **84.1** | **98.5** | 38.2 |
| tesseract-fast-psm1 | 89.4 | 84.1 | 98.5 | 38.2 |
| doctr-official | 2.5 | 2.0 | 68.4 | 92.9 |
| doctr-official-straight | 2.4 | 2.2 | 97.3 | **95.7** |
| doctr-ru-onnx | 71.5 | 76.5 | 66.9 | 76.5 |
| doctr-ru-onnx-straight | 84.4 | 83.5 | 95.0 | 81.2 |

### CER loose (%, in order)

| engine | RU scans | RU simulated photos | EN scans | EN receipt photos |
|---|---|---|---|---|
| tesseract-fast | **4.0** | 10.1 | **1.3** | 62.7 |
| tesseract-fast-psm1 | 4.0 | 10.1 | 1.3 | 62.7 |
| doctr-official | 91.0 | 90.5 | 44.8 | 48.5 |
| doctr-official-straight | 89.9 | 90.0 | 41.3 | 45.8 |
| doctr-ru-onnx | 16.6 | 13.9 | 46.2 | 17.7 |
| doctr-ru-onnx-straight | 5.0 | **6.5** | 41.5 | **16.4** |

WER and word precision are in [results/tables.md](results/tables.md).

### Word recall per source, scans (%)

| source | tesseract-fast | doctr-ru-onnx | doctr-ru-onnx-straight |
|---|---|---|---|
| Дьяволиада (Булгаков, 1925) | 79.4 | 78.2 | 78.2 |
| Рассказы (Булгаков, 1926) | 98.4 | 96.1 | 96.1 |
| Дни Турбиных (Булгаков, 1927) | 94.0 | 49.9 | 95.9 |
| Алые паруса (Грин, 1923) | 80.2 | 33.6 | 71.7 |
| Мораль с марксистской точки зрения (Луначарский, 1925) | 94.8 | 69.7 | 94.6 |
| Дирижабли (Циолковский, 1931) | 86.0 | 79.3 | 78.9 |
| Памятники истории Англии XI–XIII вв. (1936) | 84.4 | 68.2 | 68.6 |
| Институтка (Марко Вовчок, 1954) | 97.8 | 71.5 | 97.7 |
| Горнфельд, Новые словечки и старые слова (1922) | 89.1 | 93.7 | 93.1 |
| Собрание законодательства РФ, 2014, № 31 | 89.4 | 76.3 | 77.9 |
| The 9/11 Commission Report (2004) | 99.3 | 96.7 | 96.5 |
| 100 Things You Should Know About Communism (1949) | 98.8 | 96.4 | 95.4 |
| Orthodoxy (Chesterton, 1908) | 99.9 | 75.2 | 98.7 |
| Encyclopædia Britannica 1911, vol. 25 (two columns) | 97.8 | 47.2 | 93.5 |
| Australian Government Cabinet Handbook, 15th edition | 99.5 | 96.4 | 97.0 |

### Speed and memory

| engine | s/page, RU scans | s/page, receipts | peak memory |
|---|---|---|---|
| tesseract-fast | 1.6 | 0.2 | 140 MB |
| tesseract-fast-psm1 | 1.8 | 0.2 | 170 MB |
| doctr-official | 5.4 | 2.9 | 2.1 GB |
| doctr-official-straight | 3.9 | 1.3 | 2.0 GB |
| doctr-ru-onnx | 6.4 | 1.4 | 3.3 GB |
| doctr-ru-onnx-straight | 6.6 | 0.9 | 3.1 GB |

Other work was running on the machine (load average about 30 on 24 threads), so the times are rough. All outputs
are in [results/](results/).

## What it showed

1. **On real Russian scans Tesseract reads more words than docTR with the Russian model.** Word recall 89.4 against
   84.4 (page turning off) and 71.5 (on), CER 4.0 against 5.0 and 16.6. In the synthetic test the Russian model was
   ahead everywhere, by far on photos (CER 0.3 against 23.7); on real scans the lead is gone. Its mistakes are the ones Tesseract makes on old
   type, `н` read as `п`, `е` as `с`, and more of them, plus Latin look-alikes inside Russian words (`k`, `c`, `i`).
   It is ahead on two books only: Горнфельд 1922 (93.1 against 89.1) and Дни Турбиных (95.9 against 94.0).
2. **docTR's page orientation model breaks real scans.** With page turning on, as in the synthetic test, docTR turned
   about 11 of 125 upright pages upside down and read them as mirrored text (`эuо ou yueyp I` on an Orthodoxy page;
   counted as pages under 15 % recall with plenty of output), and on 2 Алые паруса pages found nothing. Turning off page orientation fixed those pages (Дни Турбиных 49.9 → 95.9, Orthodoxy 75.2 → 98.7). Without
   it docTR is not expected to read a page on its side (not measured here), the case `--psm 1` fixes in Tesseract.
3. **docTR reads two columns across.** On the 1911 Britannica it finds 93.5 % of the words, but in the wrong order:
   CER 73 against Tesseract's 1.5. A search finds the words; a quote or a snippet comes out mixed. The same happened
   to PaddleOCR in the synthetic test.
4. **On the simulated photos of real scans the two are close.** Word recall 84.1 (Tesseract) and 83.5 (docTR-RU),
   CER 10.1 and 6.5. docTR keeps the order better on a slanted page; Tesseract finds as many words. The synthetic test
   had Tesseract far behind on photos (CER 23.7 against 0.3); with real type the gap is small.
5. **Real receipt photos are where Tesseract fails and docTR wins.** On the CORD receipts, crumpled and shot under
   uneven light, Tesseract returned nothing at all for 6 of 25 photos and found 38 % of the words. docTR's own model
   found 95.7 % (92.9 % with page turning on), the Russian model 81.2 %. By CER docTR is also ahead (16 to 46
   against 63). These photos are 432 to 2304 px wide, of mostly English text.
6. **`--psm 1` changes nothing on upright pages.** Tesseract's output was the same on every one of the 125 pages, at
   0.2 s more per page. It costs nothing here and fixes pages on their side.
7. **docTR as installed still cannot read Russian:** word recall 2.4. With page turning off its English scans are
   close to Tesseract by words (97.3 against 98.5), but it reads the Britannica's two columns across too.

## Recommendation

**Stay with Tesseract and `--psm 1`. Do not port docTR with the Russian model now.**

- On real Russian scans, the common case for a document store, Tesseract is more accurate than docTR with the Russian
  model, about 20 times lighter in memory and 4 times faster. The port would cost new TypeScript around onnxruntime
  and a 360 MB download for a result worse than what cli-core has.
- The synthetic lead came from the model's training data: it was trained on renders like the synthetic pages. On real
  scans it makes Tesseract's mistakes, more often.
- Tesseract's real weak spot is phone photos of crumpled paper such as receipts: nothing at all on a quarter of
  them. docTR reads them well, but only English here. Revisit when a Russian recognition model trained on real
  scans and photos exists, or when users send many photos; the test then is real Russian photos, which no public set
  has today.
- If docTR is tried again, page turning must be off or replaced, and its reading order checked on multi-column pages.

## What was not measured

- **Real Russian phone photos.** None with checked text were found; the Russian photos are real scans with a
  simulated camera.
- Pages on their side or skewed by a few degrees: Wikisource scans are upright. The synthetic test covers those.
- tessdata_best, PaddleOCR, docTR's other recognition models, any image clean-up before OCR.
- Documents: forms, tables, stamps, signatures, handwriting. The real Russian pages are books and a law gazette.
- Receipts in Russian.
- How exact the volunteers' text is: Wikisource keeps the book's spelling and may differ from the scan in small ways
  (quotes, dashes, a footnote's place). The same text is used for every engine.
- Variance: one run per engine, with other work on the machine.
