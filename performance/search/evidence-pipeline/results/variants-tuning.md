Tuning set: 38 answerable questions; 147 variants.

| Variant | Answer@3 | MRR | Won vs A3 | Lost vs A3 | Conflict/revoked lost | Passes |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| mmarco rich D=50 α=1 | 71% | 0.58 | 9 | 1 | dentavita-q07 | no |
| mmarco rich D=20 α=1 | 71% | 0.55 | 9 | 1 | dentavita-q07 | no |
| mmarco rich D=100 α=1 | 68% | 0.57 | 8 | 1 | dentavita-q07 | no |
| mmarco rich D=50 α=1 τ=0.9 | 71% | 0.54 | 10 | 2 | — | no |
| mmarco rich D=100 α=1 τ=0.9 | 68% | 0.54 | 9 | 2 | — | no |
| bge-int8 rich D=100 α=0.7 | 68% | 0.54 | 8 | 1 | dentavita-q07 | no |
| bge-int8 rich D=50 α=0.7 | 68% | 0.54 | 7 | 0 | — | yes |
| bge-int8 rich D=100 α=1 τ=0.9 | 66% | 0.55 | 8 | 2 | — | no |
| bge-int8 rich D=50 α=1 | 68% | 0.53 | 8 | 1 | dentavita-q07 | no |
| bge-int8 rich D=50 α=1 τ=0.9 | 68% | 0.53 | 8 | 1 | — | yes |
| bge-int8 plain D=50 α=1 | 68% | 0.51 | 8 | 1 | — | yes |
| bge-int8 rich D=100 α=0.7 τ=0.9 | 66% | 0.54 | 8 | 2 | — | no |
| bge-int8 rich D=50 α=0.5 | 68% | 0.50 | 7 | 0 | — | yes |
| bge-int8 rich D=20 α=1 | 68% | 0.50 | 8 | 1 | dentavita-q07 | no |
| bge-int8 rich D=20 α=0.7 | 66% | 0.53 | 6 | 0 | — | yes |
| mmarco rich D=50 α=0.7 | 66% | 0.52 | 6 | 0 | — | yes |
| bge-int8 rich D=100 α=0.5 | 66% | 0.52 | 6 | 0 | — | yes |
| bge-int8 rich D=100 α=1 | 66% | 0.52 | 7 | 1 | dentavita-q07 | no |
| bge-int8 plain D=100 α=1 | 66% | 0.51 | 7 | 1 | — | yes |
| bge-int8 plain D=50 α=0.7 | 66% | 0.50 | 6 | 0 | — | yes |
| mmarco plain D=100 α=0.7 | 66% | 0.50 | 7 | 1 | — | yes |
| mmarco plain D=50 α=1 | 66% | 0.50 | 8 | 2 | dentavita-q07 | no |
| mmarco rich D=100 α=0.7 | 63% | 0.52 | 5 | 0 | — | yes |
| mmarco rich D=50 α=0.5 | 63% | 0.52 | 5 | 0 | — | yes |
| bge-int8 plain D=20 α=0.7 | 66% | 0.49 | 6 | 0 | — | yes |
| mmarco plain D=100 α=1 τ=0.9 | 68% | 0.46 | 9 | 2 | — | no |
| bge-int8 plain D=100 α=1 τ=0.9 | 66% | 0.48 | 8 | 2 | — | no |
| mmarco plain D=100 α=1 | 63% | 0.49 | 7 | 2 | dentavita-q07 | no |
| A3, no reranker | 50% | 0.44 | 0 | 0 | — | yes |
| A3, no reranker, newest-first τ 0.9 | 45% | 0.40 | 1 | 3 | — | no |
| bge-int8 plain D=100 α=1 τ=0.87 | 39% | 0.36 | 6 | 10 | dentavita-q07 | no |
| mmarco plain D=100 α=1 τ=0.87 | 34% | 0.31 | 4 | 10 | dentavita-q07 | no |
| A3, no reranker, newest-first τ 0.87 | 29% | 0.27 | 2 | 10 | dentavita-q07 | no |

Chosen: bge-int8 rich D=50 α=0.7
Best passing mMARCO variant: mmarco rich D=50 α=0.7
