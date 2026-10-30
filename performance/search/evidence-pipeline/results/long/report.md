| Arm | Answer@3 | MRR | Answer span in first 3 / 10 | Revoked Answer@3 | Control Answer@3 | Won / lost vs Core | Pairs cut |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A3 | 42% | 0.41 | 27% / 27% | 8% | 67% | 0 / 2 | — |
| A3, no passages | 42% | 0.40 | 42% / 42% | 8% | 67% | 0 / 2 | — |
| mmarco mix, whole parent, 512 tokens | 48% | 0.43 | 27% / 27% | 17% | 67% | 0 / 0 | 598 |
| mmarco mix, parent 300 chars, 512 tokens | 48% | 0.43 | 27% / 27% | 17% | 67% | 0 / 0 | 598 |
| mmarco mix, parent 300 chars, 256 tokens | 39% | 0.35 | 21% / 27% | 8% | 67% | 0 / 3 | 1164 |
| mmarco mix, parent 300 chars, 128 tokens | 30% | 0.25 | 18% / 21% | 8% | 50% | 0 / 6 | 1520 |
| mmarco mix, parent 300 chars, 512 tokens + follow-ups K=5 M=2 T=3 ctx (exploratory, not chosen) | 73% | 0.68 | 48% / 48% | 83% | 67% | 8 / 0 | — |

33 answerable questions, 12 revoked, 6 controls.
