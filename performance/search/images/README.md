# Finding images: context, photo data and the picture itself

Private data set, public totals. The queries, per-query ranks and image locators are kept in a private repository; only
counts, rates and timings are here.

## Why it was run

The owner wants photos and screenshots in messengers and in Google Drive to be findable by what they show. Search today
finds an image only by its caption (message text) or file name. The plan for the feature (image search, three levels,
interchangeable providers) needs numbers before it picks a picture model:

1. **Level 1, context** (messengers): caption + up to 3 messages before and after in the same chat within 10 minutes +
   chat title + sender name, embedded with e5.
2. **Level 2, photo data** (Drive): file name, folder path, date taken, place.
3. **Level 3, picture**: an image-text model gives each picture a vector and a text query is embedded by the same model.

The question this answers: how much does each level add over caption-only search, what does a picture model cost on this
laptop, and is level 3 worth turning on. It fed the decision on whether to build level 3 and which model.

## Setup

- Machine: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0, Node v24.19.0, no GPU used (onnxruntime-node, CPU).
- Library: `@huggingface/transformers` 4.3.1 (scripts/package.json). Text: `Xenova/multilingual-e5-small` q8 (118 MB),
  `query: ` and `passage: ` prefixes, the model cli-messaging ships.
- Level 3 **A**: `Xenova/clip-vit-base-patch32` vision q8 (89 MB) with the text side
  `sentence-transformers/clip-ViT-B-32-multilingual-v1` (its own ONNX export, `model_quint8_avx2.onnx`, 135 MB; mean
  pooling and the 768 to 512 Dense layer applied in the script, 1.6 MB). Total 226 MB. The ONNX export contains only the
  transformer, so the projection had to be applied by hand. Also run with CLIP's own English text encoder (`A-en`, 65 MB)
  on English translations of the queries.
- Level 3 **B**: `onnx-community/siglip2-base-patch16-224-ONNX` vision int8 (95 MB) + text int8 (283 MB). Total 378 MB.
  Russian queries lowercased, padded to 64 tokens. Also run with English queries (`B-en`).
- Data: 150 Telegram photos of one personal account, 27 chats, 98 with a caption, 118 distinct files (forwards repeat), 56
  with at least one neighbouring text message inside the window. Photos over 6 MB left out.
- Queries: 30, Russian, one per target image, written by looking at the image and describing what is visible, as a person
  would type it. 16 targets have a caption, 14 do not. The other 149 images are distractors; a byte-identical copy of the
  target counts as a hit.
- Metrics: hit@1, hit@5, hit@10, MRR. Fusion is reciprocal rank fusion, k = 60.
- Commands (from `scripts/`, working directory holds the private files; the profiles are always named:
  `TG_PROFILE`, `TG_ACCOUNT_ID`, `DRIVE_PROFILE`): `python3 -I select_tg.py`,
  `python3 -I dl_tg.py` (`tg $TG_PROFILE messages download`, 1.2 s pause, stops after 3 errors), `node text_levels.mjs`,
  `node embed_l3.mjs`, `python3 -I eval.py`.

## Results

30 queries against 150 images.

| Lane | hit@1 | hit@5 | hit@10 | MRR |
|---|---|---|---|---|
| L0 caption only | 0.37 | 0.43 | 0.43 | 0.39 |
| L1 context | 0.50 | 0.57 | 0.70 | 0.55 |
| L3-A picture, Russian queries | 0.77 | 0.97 | 1.00 | 0.86 |
| L3-A-en picture, English queries | 0.90 | 0.97 | 0.97 | 0.93 |
| L3-B picture, Russian queries | 0.57 | 0.77 | 0.77 | 0.66 |
| L3-B-en picture, English queries | 0.83 | 0.93 | 1.00 | 0.88 |
| L1 + A (RRF) | 0.67 | 0.83 | 0.93 | 0.74 |
| L1 + B (RRF) | 0.63 | 0.83 | 0.87 | 0.70 |
| L1 + A + B (RRF), best fusion | 0.67 | 0.90 | 1.00 | 0.77 |

By target (MRR): captioned targets (16) L0 0.73, L1 0.59, A 0.90, B 0.63. Targets without a caption (14): L0 0.01, L1 0.51,
A 0.83, B 0.69.

Cost on this machine, CPU only, models already on disk.

| Level | Per image, median / p95 | All 150 images | Per query, median / p95 | Load (warm) |
|---|---|---|---|---|
| L0 e5 on caption | 53 ms mean | 8.0 s | 11 ms mean | 0.6 s |
| L1 e5 on context text (median 1.1k characters) | 67 ms mean | 10.0 s | same | same |
| L3-A | 57 / 122 ms | 9.7 s | 44 / 74 ms (A-en 33 / 53) | 0.27 s |
| L3-B | 154 / 240 ms | 24.1 s | 113 / 149 ms (B-en 42 / 85) | 0.41 s |

Per image for A and B is preprocessing plus forward pass of the vision model; reading the file is not counted. Load
times are warm (files in the page cache); the first run downloaded the models and took several seconds longer.

Drive (126 images in the profile's skipped list, PNG, JPEG, WebP and one SVG):

- `imageMediaMetadata.time` present on **0 of 126**; `location` on **0 of 126**; width and height on all 126. These files are
  screenshots and exported graphics, so the date and place that level 2 relies on do not exist for them. Folder path was
  resolved for all 126.
- The image bytes could not be fetched through the `drive` command line: `drive api call drive.files.get` refuses
  `alt=media`, `drive.files.download` returns an OAuth-protected URI only, and `drive.files.export` is denied (403) for
  non-Google files. Level 3 on Drive and a level 2 hit rate were therefore **not measured**.

## What it showed

- A picture model finds photos that have no text at all: on targets without a caption, L0 finds almost nothing (MRR 0.01),
  context raises it to 0.51, and the picture model to 0.83 (A) and 0.69 (B).
- Level 1 helps most where there is no caption, and costs a little where there is one: the neighbouring messages dilute a
  short caption (L1 0.59 vs L0 0.73 on captioned targets).
- A beats B on Russian queries (MRR 0.86 against 0.66), is 2.7 times faster per image, and is smaller (226 MB against
  378 MB). With English queries the two are closer (0.93 and 0.88), and English was better than Russian for both models.
  Whether a query is best sent in Russian or translated is open.
- Reciprocal rank fusion with the text lane did not beat the picture lane alone on this set (MRR 0.77 against 0.86), because
  the queries describe what is visible and the text lane is weak at that. The rank-based merge needs a way to let a strong
  text match win without a weak one dragging a strong picture hit down.

## What was not measured

- Drive pictures and level 2 hit rates (see above). Level 1 for MAX and mail attachments.
- Queries that are about context rather than looks ("the photo he sent about the contract"). Every query here describes
  the picture, which favours level 3 by construction, so the text levels are underestimated on real use.
- Thirty queries on one person's library of 150 images: a difference of one or two queries is noise. Many images are
  screenshots of charts and web pages, which CLIP-type models are known to handle worse than photos.
- OCR, other CLIP sizes, GPU, quantisation levels other than q8 and int8, the offline place-name gazetteer.
- Index size on disk (512 and 768 floats per image) and the cost on the owner's full library; estimate from the per-image
  times above (about 57 ms for A, 154 ms for B, so a library of 10 000 images takes about 10 and 26 minutes).
