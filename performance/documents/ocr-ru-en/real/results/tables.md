
## word recall (%)

| engine | RU book and law scans | RU the same, as a simulated phone photo | EN book and report scans | EN receipt phone photos (CORD) |
|---|---|---|---|---|
| tesseract-fast | 89.4 | 84.1 | 98.5 | 38.2 |
| tesseract-fast-psm1 | 89.4 | 84.1 | 98.5 | 38.2 |
| doctr-official | 2.5 | 2.0 | 68.4 | 92.9 |
| doctr-official-straight | 2.4 | 2.2 | 97.3 | 95.7 |
| doctr-ru-onnx | 71.5 | 76.5 | 66.9 | 76.5 |
| doctr-ru-onnx-straight | 84.4 | 83.5 | 95.0 | 81.2 |

## CER loose (%)

| engine | RU book and law scans | RU the same, as a simulated phone photo | EN book and report scans | EN receipt phone photos (CORD) |
|---|---|---|---|---|
| tesseract-fast | 4.0 | 10.1 | 1.3 | 62.7 |
| tesseract-fast-psm1 | 4.0 | 10.1 | 1.3 | 62.7 |
| doctr-official | 91.0 | 90.5 | 44.8 | 48.5 |
| doctr-official-straight | 89.9 | 90.0 | 41.3 | 45.8 |
| doctr-ru-onnx | 16.6 | 13.9 | 46.2 | 17.7 |
| doctr-ru-onnx-straight | 5.0 | 6.5 | 41.5 | 16.4 |

## WER loose (%)

| engine | RU book and law scans | RU the same, as a simulated phone photo | EN book and report scans | EN receipt phone photos (CORD) |
|---|---|---|---|---|
| tesseract-fast | 12.0 | 21.1 | 2.3 | 71.4 |
| tesseract-fast-psm1 | 12.0 | 21.1 | 2.3 | 71.4 |
| doctr-official | 100.4 | 101.0 | 57.2 | 54.0 |
| doctr-official-straight | 100.9 | 100.3 | 51.6 | 51.9 |
| doctr-ru-onnx | 33.3 | 27.6 | 63.9 | 30.8 |
| doctr-ru-onnx-straight | 18.5 | 19.9 | 52.6 | 28.0 |

## word precision (%)

| engine | RU book and law scans | RU the same, as a simulated phone photo | EN book and report scans | EN receipt phone photos (CORD) |
|---|---|---|---|---|
| tesseract-fast | 89.3 | 84.3 | 98.0 | 65.6 |
| tesseract-fast-psm1 | 89.3 | 84.3 | 98.0 | 65.6 |
| doctr-official | 2.5 | 2.0 | 68.2 | 90.8 |
| doctr-official-straight | 2.4 | 2.2 | 96.9 | 92.4 |
| doctr-ru-onnx | 71.2 | 75.0 | 62.7 | 74.4 |
| doctr-ru-onnx-straight | 82.8 | 83.0 | 94.6 | 78.7 |

## Word recall per source, scans (%)

| source | tesseract-fast | tesseract-fast-psm1 | doctr-official | doctr-official-straight | doctr-ru-onnx | doctr-ru-onnx-straight |
|---|---|---|---|---|---|---|
| The 9-11 Commission Report (Official Government Edition).djvu | 99.3 | 99.3 | 97.2 | 97.2 | 96.7 | 96.5 |
| 100 Things You Should Know About Communism Series (IA 100thingsyoushou1949unit).djvu | 98.8 | 98.8 | 96.6 | 96.8 | 96.4 | 95.4 |
| Дирижабли (Циолковский 1931).pdf | 86.0 | 86.0 | 3.7 | 3.9 | 79.3 | 78.9 |
| Собрание законодательства РФ. 2014. № 31.pdf | 89.4 | 89.4 | 9.5 | 9.1 | 76.3 | 77.9 |
| Горнфельд А. Г. Новые словечки и старые слова. 1922.pdf | 89.1 | 89.1 | 0.5 | 0.5 | 93.7 | 93.1 |
| Рассказы (Булгаков, 1926).djvu | 98.4 | 98.4 | 2.9 | 2.9 | 96.1 | 96.1 |
| Мораль с марксистской точки зрения (Луначарский, 1925).pdf | 94.8 | 94.8 | 0.0 | 0.0 | 69.7 | 94.6 |
| Алые паруса (Грин, 1923).djvu | 80.2 | 80.2 | 0.0 | 0.0 | 33.6 | 71.7 |
| Петрушевский Д.М. (ред.). Памятники истории Англии XI-XIII вв. 1936.djvu | 84.4 | 84.4 | 2.2 | 2.2 | 68.2 | 68.6 |
| Orthodoxy (1908).djvu | 99.9 | 99.9 | 75.3 | 99.3 | 75.2 | 98.7 |
| Институтка (Марко Вовчок, 1954).djvu | 97.8 | 97.8 | 0.3 | 0.3 | 71.5 | 97.7 |
| Дни Турбиных (Белая гвардия) (Булгаков, 1927).djvu | 94.0 | 94.0 | 0.0 | 0.3 | 49.9 | 95.9 |
| EB1911 - Volume 25.djvu | 97.8 | 97.8 | 49.1 | 96.7 | 47.2 | 93.5 |
| Australian Government Cabinet Handbook 15th edition.pdf | 99.5 | 99.5 | 99.0 | 99.0 | 96.4 | 97.0 |
| Дьяволиада (М. Булгаков, 1925).djvu | 79.4 | 79.4 | 0.0 | 0.0 | 78.2 | 78.2 |

## Median seconds per page

| engine | RU book and law scans | RU the same, as a simulated phone photo | EN book and report scans | EN receipt phone photos (CORD) |
|---|---|---|---|---|
| tesseract-fast | 1.56 | 1.32 | 1.57 | 0.21 |
| tesseract-fast-psm1 | 1.82 | 1.36 | 1.52 | 0.24 |
| doctr-official | 5.35 | 5.00 | 6.18 | 2.91 |
| doctr-official-straight | 3.87 | 3.86 | 4.78 | 1.25 |
| doctr-ru-onnx | 6.44 | 6.36 | 7.33 | 1.35 |
| doctr-ru-onnx-straight | 6.58 | 6.48 | 9.11 | 0.93 |

pages: RU book and law scans 40, RU the same, as a simulated phone photo 40, EN book and report scans 20, EN receipt phone photos (CORD) 25
