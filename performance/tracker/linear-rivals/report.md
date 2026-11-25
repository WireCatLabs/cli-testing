| Contestant | Form | hit@1 | hit@5 | No-answer questions with 0 hits | Median ms | Median tokens | Requests per question |
|---|---|---|---|---|---|---|---|
| ours: issues search | keywords | 7/27 | 7/27 | 3/3 | 376 | 39 | 0 |
| ours: issues search | sentence | 2/27 | 2/27 | 3/3 | 376 | 39 | 0 |
| ours: issues search (one quoted argument) | keywords | 1/27 | 1/27 | 3/3 | 475 | 39 | 0 |
| ours: issues search (one quoted argument) | sentence | 0/27 | 0/27 | 3/3 | 424 | 39 | 0 |
| ours: search | keywords | 1/27 | 1/27 | 3/3 | 410 | 80 | 0 |
| ours: search | sentence | 0/27 | 0/27 | 3/3 | 427 | 85 | 0 |
| ours: both | keywords | 8/27 | 8/27 | 3/3 | 901 | 120 | 0 |
| ours: both | sentence | 2/27 | 2/27 | 3/3 | 889 | 126 | 0 |
| ours: memo search all | keywords | 8/27 | 8/27 | 3/3 | 526 | 187 | 0 |
| ours: memo search all | sentence | 5/27 | 6/27 | 2/3 | 563 | 187 | 0 |
| ours: issues search (after sync --embed) | keywords | 7/27 | 7/27 | 3/3 | 614 | 39 | 0 |
| ours: issues search (after sync --embed) | sentence | 2/27 | 2/27 | 3/3 | 628 | 39 | 0 |
| ours: issues search (one quoted argument) (after sync --embed) | keywords | 1/27 | 1/27 | 3/3 | 393 | 39 | 0 |
| ours: issues search (one quoted argument) (after sync --embed) | sentence | 0/27 | 0/27 | 3/3 | 403 | 39 | 0 |
| ours: search (after sync --embed) | keywords | 3/27 | 3/27 | 0/3 | 3834 | 392 | 0 |
| ours: search (after sync --embed) | sentence | 3/27 | 3/27 | 0/3 | 4313 | 420 | 0 |
| ours: both (after sync --embed) | keywords | 10/27 | 10/27 | 0/3 | 3887 | 432 | 0 |
| ours: both (after sync --embed) | sentence | 5/27 | 5/27 | 0/3 | 3525 | 476 | 0 |
| ours: memo search all (after sync --embed) | keywords | 26/27 | 27/27 | 0/3 | 4204 | 1509 | 0 |
| ours: memo search all (after sync --embed) | sentence | 25/27 | 27/27 | 0/3 | 3720 | 1520 | 0 |
| ours: api semantic-search (live) | keywords | 25/27 | 25/27 | 0/3 | 1199 | 76 | 1 |
| ours: api semantic-search (live) | sentence | 25/27 | 25/27 | 0/3 | 1014 | 145 | 1 |
| Linear MCP | keywords | 14/27 | 24/27 | 0/3 | 779 | 971 | 2 |
| Linear MCP | sentence | 7/27 | 12/27 | 0/3 | 821 | 2743 | 2 |
| Linearis | keywords | 22/27 | 22/27 | 0/3 | 576 | 1621 | 1 |
| Linearis | sentence | 22/27 | 22/27 | 0/3 | 577 | 4515 | 1 |
| schpet/linear-cli | keywords | 22/27 | 22/27 | 0/3 | 366 | 984 | not visible |
| schpet/linear-cli | sentence | 22/27 | 22/27 | 0/3 | 297 | 3314 | not visible |

| Question | Case | Expected | Keyword words found as written | Sentence words found as written | Rank (keywords): ours: issues search · ours: memo search all (after sync --embed) · ours: api semantic-search (live) · Linear MCP · Linearis · schpet/linear-cli |
|---|---|---|---|---|---|
| q01 | paraphrase, typo | b01 | 50% | 33% | – · 1 · 1 · 5 · 1 · 1 |
| q02 | answer in a comment, paraphrase | b04 | 67% | 50% | – · 1 · 1 · 7 · 1 · 1 |
| q03 | answer in a comment | b18 | 100% | 67% | 1 · 1 · 1 · 1 · 1 · 1 |
| q04 | synonyms, look-alike m16 | m01 | 33% | 33% | – · 1 · 1 · 4 · 1 · 1 |
| q05 | synonyms | m03 | 33% | 50% | – · 1 · 1 · 1 · 1 · 1 |
| q06 | answer in a comment, word forms | n03 | 0% | 20% | 1 · 1 · 1 · 2 · 1 · 1 |
| q07 | answer in a document | d2 | 67% | 67% | – · 1 · 1 · 1 · – · – |
| q08 | answer in a document, paraphrase | d3 | 100% | 50% | – · 1 · 1 · 1 · – · – |
| q09 | answer in a document, look-alike b03 b12 | d1 | 100% | 83% | – · 2 · 1 · 1 · – · – |
| q10 | Russian word forms, е for ё | b16 | 0% | 25% | – · 1 · 1 · 1 · 1 · 1 |
| q11 | English question, Russian issue | m14 | 0% | 0% | – · 1 · – · – · – · – |
| q12 | word forms, look-alike b08 | b07 | 50% | 17% | – · 1 · 1 · 4 · 1 · 1 |
| q13 | direct words, control | b08 | 100% | 100% | 1 · 1 · 1 · 1 · 1 · 1 |
| q14 | direct words, control | n19 | 100% | 100% | 1 · 1 · 1 · 2 · 1 · 1 |
| q15 | synonyms | n01 | 50% | 33% | – · 1 · 1 · 2 · 1 · 1 |
| q16 | answer in a comment | n10 | 50% | 25% | – · 1 · 1 · 1 · 1 · 1 |
| q17 | typo in a name | n04 | 0% | 0% | – · 1 · – · – · – · – |
| q18 | word forms | n05 | 50% | 25% | 1 · 1 · 1 · 2 · 1 · 1 |
| q19 | no shared rare word | b09 | 20% | 29% | – · 1 · 1 · 3 · 1 · 1 |
| q20 | look-alike m13 | m06 | 67% | 67% | – · 1 · 1 · 1 · 1 · 1 |
| q21 | word split, word forms | m09 | 50% | 60% | – · 1 · 1 · 1 · 1 · 1 |
| q22 | paraphrase | b06 | 67% | 40% | 1 · 1 · 1 · 3 · 1 · 1 |
| q23 | English question, Russian issue | n16 | 50% | 33% | – · 1 · 1 · 1 · 1 · 1 |
| q24 | Russian word forms | n16 | 0% | 0% | – · 1 · 1 · 1 · 1 · 1 |
| q25 | term not in the title | n11 | 75% | 83% | – · 1 · 1 · 5 · 1 · 1 |
| q26 | answer in a comment, look-alike m01 | m16 | 100% | 60% | 1 · 1 · 1 · 1 · 1 · 1 |
| q27 | synonyms | m02 | 33% | 50% | – · 1 · 1 · 1 · 1 · 1 |
| q28 | no answer in the data | none | – | – | 0 hits · 7 hits · 8 hits · 8 hits · 6 hits · 6 hits |
| q29 | no answer in the data | none | – | – | 0 hits · 9 hits · 2 hits · 2 hits · 2 hits · 2 hits |
| q30 | no answer in the data, misremembered | none | – | – | 0 hits · 8 hits · 8 hits · 9 hits · 7 hits · 7 hits |

Median share of keyword-query words found as written in the expected item: 50%.
