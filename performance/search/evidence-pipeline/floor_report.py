"""Markdown tables for the meaning floor runs (pipeline.py --floors). Usage: floor_report.py NAME=floors.json[,...] ..."""
from collections import defaultdict
import json
from pathlib import Path
import statistics
import sys

import numpy as np

ABSENT = ('missing', 'premise')
SIDES = ('conflict', 'revoked')
groups = {}
for argument in sys.argv[1:]:
    name, paths = argument.split('=')
    runs = [json.loads(Path(path).read_text()) for path in paths.split(',')]
    groups[name] = ([row for run in runs for row in run['rows']], [c for run in runs for c in run['cosines']])


def label(floor):
    return 'none' if floor is None else f'{floor:.2f}'


def pct(values):
    return f'{100 * sum(values) / len(values):.0f}%' if values else '—'


for name, (rows, cosines) in groups.items():
    absent = sorted({row['question'] for row in rows if row['kind'] in ABSENT})
    answerable = sorted({row['question'] for row in rows if row['answerable']})
    print(f'### {name}: {len(answerable)} answerable, {len(absent)} missing/premise\n')
    print('| Arm | Floor | Answer@3 | MRR | Answer@3 lost / won vs none | Conflict sides lost | Meaning hits kept '
          '(mean) | Answerable: words only | Missing/premise: off-topic meaning-only items in top 5 (total) | '
          'Missing/premise: words only | Missing/premise: off-question bytes of 8 KiB (mean) |')
    print('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
    by = defaultdict(dict)
    for row in rows:
        by[(row['arm'], row['floor'])][row['question']] = row
    for arm in dict.fromkeys(row['arm'] for row in rows):
        none = by[(arm, None)]
        for floor in dict.fromkeys(row['floor'] for row in rows):
            cell = by[(arm, floor)]
            lost = sum(none[q]['answer_at_3'] and not cell[q]['answer_at_3'] for q in answerable)
            won = sum(cell[q]['answer_at_3'] and not none[q]['answer_at_3'] for q in answerable)
            sides = sum(none[q]['all_conflict_sides'] and not cell[q]['all_conflict_sides']
                        for q in cell if cell[q]['kind'] in SIDES)
            print(f"| {arm} | {label(floor)} | {pct([cell[q]['answer_at_3'] for q in answerable])} | "
                  f"{statistics.mean(cell[q]['answer_rr'] for q in answerable):.2f} | {lost} / {won} | {sides} | "
                  f"{statistics.mean(r['meaning_kept'] for r in cell.values()):.0f} | "
                  f"{sum(cell[q]['words_only'] for q in answerable)} of {len(answerable)} | "
                  f"{sum(cell[q]['meaning_only_offtopic_top5'] for q in absent)} | "
                  f"{sum(cell[q]['words_only'] for q in absent)} of {len(absent)} | "
                  f"{statistics.mean(cell[q]['off_question_bytes'] for q in absent):.0f} |")
    print()

print('### E5 cosine, query to message\n')
print('| Split | Answer messages (grade 3) | Graded 1–2 | Ungraded in meaning top 100 | Best hit, answerable | '
      'Best hit, missing/premise | Best hit, conflict/unresolved |')
print('| --- | --- | --- | --- | --- | --- | --- |')


def spread(values):
    if not values:
        return '—'
    p10, p50, p90 = np.quantile(values, [.1, .5, .9])
    return f'{p50:.3f} ({p10:.3f}–{p90:.3f}, n {len(values)})'


for name, (_, cosines) in groups.items():
    answers = [c for q in cosines for g, c in q['graded'].values() if g == 3]
    partial = [c for q in cosines for g, c in q['graded'].values() if 1 <= g <= 2]
    other = [c for q in cosines for c in q['ungraded_top100']]
    top = lambda test: [q['top1'] for q in cosines if test(q)]
    print(f"| {name} | {spread(answers)} | {spread(partial)} | {spread(other)} | {spread(top(lambda q: q['answerable']))} | "
          f"{spread(top(lambda q: q['kind'] in ABSENT))} | "
          f"{spread(top(lambda q: q['kind'] in ('conflict', 'unresolved')))} |")
print('\n| Split | Answer messages below 0.80 / 0.82 / 0.84 / 0.86 / 0.88 |\n| --- | --- |')
for name, (_, cosines) in groups.items():
    answers = [c for q in cosines for g, c in q['graded'].values() if g == 3]
    print(f"| {name} | {' / '.join(pct([c < floor for c in answers]) for floor in (.8, .82, .84, .86, .88))} |")
print('\nBest-hit cosine with Core\'s query text (plainWords) minus the harness query:\n')
for name, (_, cosines) in groups.items():
    shift = [q['top1_core_query'] - q['top1'] for q in cosines]
    print(f'- {name}: median {statistics.median(shift):+.3f}, range {min(shift):+.3f} to {max(shift):+.3f}')
