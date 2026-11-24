## Headline: CER, case and punctuation ignored (%)

| engine | RU clean | RU photo | EN clean | EN photo | mixed clean | mixed photo |
|---|---|---|---|---|---|---|
| tesseract-fast | 1.0 | 23.7 | 0.1 | 21.0 | 0.7 | 13.3 |
| tesseract-best | 0.2 | 23.2 | 0.1 | 20.8 | 0.4 | 13.1 |
| tesseract-fast-psm1 | 1.0 | 23.7 | 0.1 | 21.0 | 0.7 | 13.3 |
| doctr-official | 77.7 | 76.7 | 0.1 | 0.1 | 51.7 | 51.7 |
| doctr-ru-onnx | 0.6 | 0.3 | 0.6 | 0.5 | 0.5 | 0.5 |
| paddle-eslav | 0.8 | 26.5 | 0.0 | 38.6 | 46.0 | 56.8 |
| paddle-eslav-mobile | 0.7 | 23.1 | 0.2 | 22.7 | 45.5 | 57.9 |

## Language ru, all 7 variants (%)

| engine | CER raw | CER loose | WER raw | WER loose | word bag F1 | without 90°: CER loose |
|---|---|---|---|---|---|---|
| tesseract-fast | 23.9 | 21.2 | 31.6 | 29.7 | 80.1 | 10.5 |
| tesseract-best | 24.0 | 21.5 | 30.5 | 28.7 | 81.4 | 10.4 |
| tesseract-fast-psm1 | 11.9 | 9.2 | 18.3 | 15.9 | 93.0 | 10.5 |
| doctr-official | 75.2 | 77.1 | 80.6 | 75.9 | 26.8 | 77.0 |
| doctr-ru-onnx | 4.2 | 0.5 | 6.5 | 2.1 | 98.0 | 0.5 |
| paddle-eslav | 12.7 | 10.0 | 19.1 | 15.2 | 93.3 | 11.5 |
| paddle-eslav-mobile | 11.1 | 8.3 | 17.5 | 14.5 | 95.2 | 9.6 |

## Language en, all 7 variants (%)

| engine | CER raw | CER loose | WER raw | WER loose | word bag F1 | without 90°: CER loose |
|---|---|---|---|---|---|---|
| tesseract-fast | 26.8 | 25.6 | 31.7 | 30.8 | 79.4 | 16.1 |
| tesseract-best | 26.4 | 25.2 | 30.7 | 30.1 | 80.2 | 15.7 |
| tesseract-fast-psm1 | 15.5 | 15.0 | 18.5 | 17.6 | 93.7 | 16.1 |
| doctr-official | 0.2 | 0.1 | 0.9 | 0.3 | 99.7 | 0.1 |
| doctr-ru-onnx | 0.7 | 0.6 | 3.0 | 2.0 | 98.0 | 0.5 |
| paddle-eslav | 12.2 | 12.0 | 14.3 | 14.3 | 96.9 | 14.0 |
| paddle-eslav-mobile | 7.7 | 7.5 | 10.4 | 10.4 | 99.4 | 8.8 |

## Language mixed, all 7 variants (%)

| engine | CER raw | CER loose | WER raw | WER loose | word bag F1 | without 90°: CER loose |
|---|---|---|---|---|---|---|
| tesseract-fast | 22.1 | 21.3 | 25.3 | 24.7 | 82.0 | 10.4 |
| tesseract-best | 22.1 | 21.5 | 24.9 | 24.4 | 82.3 | 10.4 |
| tesseract-fast-psm1 | 9.2 | 9.0 | 11.0 | 10.3 | 95.5 | 10.4 |
| doctr-official | 50.2 | 51.8 | 54.0 | 50.8 | 50.3 | 51.8 |
| doctr-ru-onnx | 1.0 | 0.5 | 4.7 | 2.6 | 97.4 | 0.5 |
| paddle-eslav | 49.1 | 49.3 | 56.9 | 56.8 | 84.9 | 49.8 |
| paddle-eslav-mobile | 49.3 | 49.2 | 56.9 | 56.8 | 91.7 | 49.8 |

## By variant, CER loose, all 8 documents (%)

| engine | clean-300dpi | scan-150dpi | noise-blur | rotated-2-5deg | rotated-90deg | photo-perspective | phone-jpeg |
|---|---|---|---|---|---|---|---|
| tesseract-fast | 0.7 | 0.7 | 2.3 | 26.6 | 85.3 | 29.1 | 11.3 |
| tesseract-best | 0.3 | 0.8 | 1.6 | 27.3 | 86.8 | 28.9 | 10.8 |
| tesseract-fast-psm1 | 0.7 | 0.7 | 2.3 | 26.6 | 2.8 | 29.1 | 11.3 |
| doctr-official | 52.5 | 52.3 | 51.9 | 52.5 | 52.5 | 52.2 | 51.8 |
| doctr-ru-onnx | 0.6 | 0.5 | 0.5 | 0.7 | 0.6 | 0.4 | 0.4 |
| paddle-eslav | 13.1 | 13.0 | 15.6 | 18.7 | 13.1 | 59.8 | 15.5 |
| paddle-eslav-mobile | 12.9 | 12.9 | 14.0 | 17.8 | 12.8 | 49.6 | 15.5 |

## By variant, WER loose, all 8 documents (%)

| engine | clean-300dpi | scan-150dpi | noise-blur | rotated-2-5deg | rotated-90deg | photo-perspective | phone-jpeg |
|---|---|---|---|---|---|---|---|
| tesseract-fast | 2.6 | 2.3 | 5.7 | 33.2 | 102.7 | 37.2 | 16.8 |
| tesseract-best | 0.9 | 2.3 | 4.2 | 33.1 | 102.9 | 36.6 | 15.4 |
| tesseract-fast-psm1 | 2.6 | 2.3 | 5.7 | 33.2 | 6.2 | 37.2 | 16.8 |
| doctr-official | 50.3 | 50.0 | 50.0 | 50.4 | 50.3 | 50.0 | 50.1 |
| doctr-ru-onnx | 2.3 | 2.0 | 2.3 | 2.6 | 2.3 | 1.9 | 2.0 |
| paddle-eslav | 16.5 | 16.5 | 20.6 | 26.0 | 16.6 | 66.3 | 20.2 |
| paddle-eslav-mobile | 15.9 | 15.9 | 18.8 | 25.3 | 15.8 | 62.3 | 19.7 |

## By variant, word bag F1, all 8 documents (%)

| engine | clean-300dpi | scan-150dpi | noise-blur | rotated-2-5deg | rotated-90deg | photo-perspective | phone-jpeg |
|---|---|---|---|---|---|---|---|
| tesseract-fast | 97.8 | 98.3 | 95.1 | 79.7 | 7.4 | 94.2 | 92.7 |
| tesseract-best | 99.2 | 98.2 | 96.5 | 80.0 | 7.9 | 94.8 | 94.4 |
| tesseract-fast-psm1 | 97.8 | 98.3 | 95.1 | 79.7 | 97.5 | 94.2 | 92.7 |
| doctr-official | 51.1 | 51.3 | 51.4 | 51.2 | 51.1 | 51.3 | 51.3 |
| doctr-ru-onnx | 97.8 | 98.0 | 97.8 | 97.5 | 97.8 | 98.2 | 98.1 |
| paddle-eslav | 95.5 | 95.5 | 91.3 | 95.3 | 95.3 | 72.6 | 95.0 |
| paddle-eslav-mobile | 95.9 | 96.2 | 93.9 | 95.6 | 96.0 | 94.1 | 95.4 |

## Layout: CER loose against word bag F1 per document, clean 300 dpi (%)

| engine | ru-contract | ru-invoice | ru-letter | ru-receipt | en-letter | en-invoice | mix-two-columns | mix-contract |
|---|---|---|---|---|---|---|---|---|
| tesseract-fast | 0.0 / 100.0 | 1.2 / 96.7 | 0.6 / 97.2 | 5.3 / 86.0 | 0.0 / 100.0 | 0.3 / 99.3 | 0.2 / 98.5 | 1.2 / 97.9 |
| tesseract-best | 0.0 / 100.0 | 0.4 / 98.1 | 0.0 / 100.0 | 1.4 / 96.3 | 0.0 / 100.0 | 0.3 / 99.3 | 0.0 / 100.0 | 0.8 / 98.2 |
| tesseract-fast-psm1 | 0.0 / 100.0 | 1.2 / 96.7 | 0.6 / 97.2 | 5.3 / 86.0 | 0.0 / 100.0 | 0.3 / 99.3 | 0.2 / 98.5 | 1.2 / 97.9 |
| doctr-official | 87.9 / 13.7 | 60.3 / 40.8 | 89.7 / 8.9 | 44.5 / 60.5 | 0.0 / 100.0 | 0.3 / 99.3 | 42.5 / 58.9 | 62.1 / 38.7 |
| doctr-ru-onnx | 1.0 / 97.9 | 0.3 / 98.9 | 0.3 / 97.9 | 0.2 / 98.4 | 0.2 / 99.0 | 1.4 / 95.6 | 0.5 / 97.0 | 0.6 / 97.0 |
| paddle-eslav | 0.0 / 100.0 | 3.2 / 89.6 | 0.1 / 99.0 | 0.7 / 97.9 | 0.0 / 100.0 | 0.0 / 100.0 | 78.1 / 98.0 | 10.1 / 78.7 |
| paddle-eslav-mobile | 0.0 / 100.0 | 2.6 / 91.7 | 0.1 / 99.0 | 0.7 / 97.9 | 0.0 / 100.0 | 0.4 / 97.8 | 77.9 / 98.5 | 9.2 / 81.7 |

## Speed and memory

| engine | s/page clean 300 dpi | s/page phone JPEG | s/page all | load s | peak RSS MB |
|---|---|---|---|---|---|
| tesseract-fast | 0.82 | 0.53 | 0.84 | 0.07 | 161 |
| tesseract-best | 1.14 | 0.81 | 1.15 | 0.15 | 178 |
| tesseract-fast-psm1 | 1.13 | 0.83 | 1.08 | 0.13 | 199 |
| doctr-official | 4.20 | 3.63 | 4.04 | 6.78 | 1760 |
| doctr-ru-onnx | 4.08 | 4.42 | 4.42 | 1.85 | 2253 |
| paddle-eslav | 10.21 | 2.67 | 10.04 | 1.83 | 8127 |
| paddle-eslav-mobile | 1.98 | 0.71 | 1.91 | 2.10 | 2818 |
