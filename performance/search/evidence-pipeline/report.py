"""Turns a pipeline.py result into the markdown tables of the README. Reads labels only to group by kind."""
import argparse
from collections import defaultdict
import json
from pathlib import Path
import statistics

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('result', type=Path)
parser.add_argument('--pool', type=int, default=100)
parser.add_argument('--budget', type=int, default=8192)
args = parser.parse_args()
root = Path(__file__).resolve().parent
result = json.loads(args.result.read_text())
labels = {q['id']: q for path in sorted((root / 'questions' / result['split']).glob('*.json'))
          for q in json.loads(path.read_text())}
CONFLICT = {'conflict', 'revoked'}


def mean(values):
    values = [v for v in values if v is not None]
    return statistics.mean(values) if values else None


def pct(value):
    return '—' if value is None else f'{value * 100:.0f}%'


def num(value, digits=2):
    return '—' if value is None else f'{value:.{digits}f}'


def answer_rank(budget_row):
    return None if 'answer_rr' not in budget_row or not budget_row['answer_rr'] else round(1 / budget_row['answer_rr'])


answerable = [q for q in labels if 'answer_rr' in next(r for r in result['end_to_end'] if r['question'] == q)['budgets'][str(args.budget)]]
print(f"Split `{result['split']}`: {result['questions']} questions ({len(answerable)} with a grade-3 answer), "
      f"{result['units']} units.\n")
print('### End to end\n')
print('| Arm | Pool | Answer in pool | Evidence recall | Budget | Answer@1 | Answer@3 | Answer@10 | MRR | nDCG@10 '
      '| Direct P@5 | Complete set | All conflict sides | Off-question bytes | Median tokens |')
print('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
groups = defaultdict(list)
for row in result['end_to_end']:
    groups[(row['arm'], row['pool'])].append(row)
for (arm, pool), rows in sorted(groups.items(), key=lambda item: (item[0][1], item[0][0])):
    for budget in map(str, result['settings']['budgets']):
        cells = [row['budgets'][budget] for row in rows]
        answered = [c for c in cells if 'answer_rr' in c]
        conflicts = [row['budgets'][budget]['all_conflict_sides'] for row in rows
                     if labels[row['question']]['kind'] in CONFLICT]
        off = mean([c['off_question_bytes'] / c['bytes'] if c['bytes'] else None for c in cells])
        print(f"| {arm} | {pool} | {pct(mean([r['answer_in_pool'] for r in rows if r['question'] in answerable]))} "
              f"| {pct(mean([r['evidence_recall'] for r in rows]))} | {int(budget) // 1024} KiB "
              f"| {pct(mean([c['answer_at_1'] for c in answered]))} | {pct(mean([c['answer_at_3'] for c in answered]))} "
              f"| {pct(mean([c['answer_at_10'] for c in answered]))} | {num(mean([c['answer_rr'] for c in answered]))} "
              f"| {num(mean([c['ndcg_10'] for c in cells]))} | {pct(mean([c['direct_precision_5'] for c in cells]))} "
              f"| {pct(mean([c['complete_set'] for c in cells]))} | {pct(mean(conflicts))} "
              f"| {pct(off)} | {statistics.median(c['tokens'] for c in cells):.0f} |")

print(f'\n### Answer@3 by question kind (pool {args.pool}, {args.budget // 1024} KiB)\n')
arms = sorted({row['arm'] for row in result['end_to_end']})
print('| Kind | Questions | ' + ' | '.join(arms) + ' |')
print('| --- | ---: | ' + ' | '.join('---:' for _ in arms) + ' |')
by_kind = defaultdict(lambda: defaultdict(list))
for row in result['end_to_end']:
    if row['pool'] == args.pool:
        cell = row['budgets'][str(args.budget)]
        value = cell.get('answer_at_3', cell['complete_set'])
        by_kind[labels[row['question']]['kind']][row['arm']].append(value)
for kind, cells in sorted(by_kind.items()):
    print(f"| {kind} | {len(cells[arms[0]])} | " + ' | '.join(pct(mean(cells[arm])) for arm in arms) + ' |')
print('\nUnanswerable kinds show complete-set recovery instead of Answer@3.')

print(f'\n### Per question, each arm against the one before (pool {args.pool}, {args.budget // 1024} KiB)\n')
print('| Change | Answer rank better | Answer rank worse | Complete set gained | Complete set lost |')
print('| --- | ---: | ---: | ---: | ---: |')
cell = {(r['question'], r['arm']): r['budgets'][str(args.budget)] for r in result['end_to_end'] if r['pool'] == args.pool}
for before, after in zip(arms, arms[1:]):
    better = worse = gained = lost = 0
    for q in labels:
        a, b = cell[(q, before)], cell[(q, after)]
        ra, rb = answer_rank(a), answer_rank(b)
        if 'answer_rr' in a:
            better += (rb is not None) and (ra is None or rb < ra)
            worse += (ra is not None) and (rb is None or rb > ra)
        gained += b['complete_set'] and not a['complete_set']
        lost += a['complete_set'] and not b['complete_set']
    print(f'| {before} → {after} | {better} | {worse} | {gained} | {lost} |')

print('\n### Fixed candidates (ordering only)\n')
print('| Ranker | Pool | Answer@1 | Answer@3 | Answer@10 | MRR | nDCG@10 | Direct P@5 |')
print('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
fixed = defaultdict(list)
for row in result['fixed']:
    fixed[(row['pool'], row['ranker'])].append(row)
for (pool, ranker), rows in sorted(fixed.items()):
    answered = [r for r in rows if 'answer_rr' in r]
    print(f"| {ranker} | {pool} | {pct(mean([r['answer_at_1'] for r in answered]))} "
          f"| {pct(mean([r['answer_at_3'] for r in answered]))} | {pct(mean([r['answer_at_10'] for r in answered]))} "
          f"| {num(mean([r['answer_rr'] for r in answered]))} | {num(mean([r['ndcg_10'] for r in rows]))} "
          f"| {pct(mean([r['direct_precision_5'] for r in rows]))} |")

print('\n### Cost\n')
print('| Stage | Median ms | p95 ms | n |')
print('| --- | ---: | ---: | ---: |')
for key, value in sorted(result['times'].items()):
    if value and key.endswith('_ms'):
        print(f"| {key[:-3]} | {value['median']:.1f} | {value['p95']:.1f} | {value['n']} |")
print(f"\nOne-time: {', '.join(f'{k[:-3]} {v:.0f} ms' for k, v in result['stage_ms'].items())}. "
      f"Peak worker RSS {result['memory']['VmHWM'] / 1e6:.0f} MB. Clipped pairs: {result['clipped_pairs']}.")
