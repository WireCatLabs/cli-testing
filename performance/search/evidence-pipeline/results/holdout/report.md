Split `holdout`: 42 questions (27 with a grade-3 answer), 2298 units.

### End to end

| Arm | Pool | Answer in pool | Evidence recall | Budget | Answer@1 | Answer@3 | Answer@10 | MRR | nDCG@10 | Direct P@5 | Complete set | All conflict sides | Off-question bytes | Median tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A0 | 100 | 81% | 56% | 8 KiB | 22% | 52% | 70% | 0.40 | 0.38 | 9% | 60% | 39% | 92% | 1882 |
| A1 | 100 | 81% | 61% | 8 KiB | 41% | 56% | 78% | 0.52 | 0.38 | 10% | 67% | 44% | 92% | 1951 |
| A2 | 100 | 89% | 77% | 8 KiB | 52% | 67% | 74% | 0.61 | 0.45 | 13% | 79% | 61% | 92% | 2204 |
| A3 | 100 | 89% | 77% | 8 KiB | 52% | 67% | 74% | 0.61 | 0.45 | 13% | 79% | 61% | 92% | 2186 |
| A4 | 100 | 89% | 77% | 8 KiB | 63% | 78% | 85% | 0.72 | 0.56 | 13% | 76% | 67% | 92% | 2152 |

### Answer@3 by question kind (pool 100, 8 KiB)

| Kind | Questions | A0 | A1 | A2 | A3 | A4 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| approval | 3 | 0% | 0% | 33% | 33% | 33% |
| conditional | 3 | 67% | 100% | 100% | 100% | 100% |
| conflict | 9 | 44% | 56% | 67% | 67% | 78% |
| fact | 6 | 50% | 50% | 50% | 50% | 83% |
| missing | 3 | 0% | 0% | 0% | 0% | 0% |
| negative | 3 | 67% | 67% | 100% | 100% | 100% |
| revoked | 9 | 56% | 56% | 67% | 67% | 67% |
| same-name | 3 | 67% | 67% | 67% | 67% | 100% |
| unresolved | 3 | 67% | 67% | 100% | 100% | 67% |

Unanswerable kinds show complete-set recovery instead of Answer@3.

### Per question, each arm against the one before (pool 100, 8 KiB)

| Change | Answer rank better | Answer rank worse | Complete set gained | Complete set lost |
| --- | ---: | ---: | ---: | ---: |
| A0 → A1 | 11 | 0 | 3 | 0 |
| A1 → A2 | 13 | 4 | 5 | 0 |
| A2 → A3 | 0 | 2 | 0 | 0 |
| A3 → A4 | 8 | 4 | 1 | 2 |

### Fixed candidates (ordering only)

| Ranker | Pool | Answer@1 | Answer@3 | Answer@10 | MRR | nDCG@10 | Direct P@5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| bm25 | 100 | 7% | 15% | 33% | 0.15 | 0.25 | 3% |
| e5 | 100 | 22% | 48% | 59% | 0.37 | 0.46 | 9% |
| rrf | 100 | 11% | 22% | 48% | 0.23 | 0.38 | 6% |

### Cost

| Stage | Median ms | p95 ms | n |
| --- | ---: | ---: | ---: |
| dense | 6.3 | 8.9 | 42 |
| discovery | 20.0 | 72.4 | 42 |
| mmarco_pairs | 354.3 | 440.1 | 42 |
| mmr_100 | 1.5 | 2.7 | 42 |
| variant_bge-int8_plain | 2286.1 | 2828.8 | 42 |
| variant_bge-int8_rich | 3088.0 | 4095.5 | 42 |
| variant_mmarco_plain | 0.0 | 0.0 | 42 |
| variant_mmarco_rich | 396.7 | 570.4 | 42 |

One-time: e5_load 500 ms, e5_index 3820 ms. Peak worker RSS 2281 MB. Clipped pairs: {'e5-small': 0, 'mmarco': 0}.
