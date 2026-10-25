"""Ranks the reranker variants of PROTOCOL.md on the tuning splits and applies the choice rule."""
import argparse
from collections import defaultdict
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('runs', nargs='+', type=Path, help='arms.json files of runs with --variants')
parser.add_argument('--frozen', type=Path, help='freeze file: show only its variants, A3 and A4, and choose nothing')
args = parser.parse_args()
root = Path(__file__).resolve().parent

rows, kinds = [], {}
for path in args.runs:
    run = json.loads(path.read_text())
    rows += run['variants']
    for questions in (root / 'questions' / run['split']).glob('*.json'):
        kinds.update({q['id']: q['kind'] for q in json.loads(questions.read_text())})

key = lambda row: (row['reranker'], row['input'], row['depth'], row['alpha'], row['tau'])
by_variant = defaultdict(dict)
for row in rows:
    by_variant[key(row)][row['question']] = row
baseline = by_variant[('none', '-', 0, 0, None)]
cost = {'none': 0, 'mmarco': 1, 'bge-int8': 2}

table = []
for variant, answers in by_variant.items():
    answerable = [q for q, row in answers.items() if 'answer_at_3' in row]
    at3 = sum(answers[q]['answer_at_3'] for q in answerable) / len(answerable)
    mrr = sum(answers[q]['answer_rr'] for q in answerable) / len(answerable)
    lost = [q for q in answerable if baseline[q]['answer_at_3'] and not answers[q]['answer_at_3']]
    won = [q for q in answerable if not baseline[q]['answer_at_3'] and answers[q]['answer_at_3']]
    sides_lost = [q for q, row in answers.items() if kinds[q] in ('conflict', 'revoked')
                  and baseline[q]['all_conflict_sides'] and not row['all_conflict_sides']]
    gate_lost = sorted({q for q in lost if kinds[q] in ('conflict', 'revoked')} | set(sides_lost))
    table.append({'variant': variant, 'answer_at_3': at3, 'mrr': mrr, 'score': (at3 + mrr) / 2,
                  'won': len(won), 'lost': len(lost), 'gate_lost': gate_lost,
                  'passes': not gate_lost and len(lost) <= 1, 'questions': len(answerable)})

table.sort(key=lambda r: (-r['score'], cost[r['variant'][0]], r['variant'][2], r['variant'][1] != 'plain'))
passing = [r for r in table if r['passes']]
name = lambda v: 'A3, no reranker' + (f', newest-first τ {v[4]}' if v[4] else '') if v[0] == 'none' else (
    f'{v[0]} {v[1]} D={v[2]} α={v[3]}' + (f' τ={v[4]}' if v[4] else ''))
print(f'Tuning set: {table[0]["questions"]} answerable questions; {len(table)} variants.\n')
print('| Variant | Answer@3 | MRR | Won vs A3 | Lost vs A3 | Conflict/revoked lost | Passes |')
print('| --- | ---: | ---: | ---: | ---: | --- | --- |')
shown = table[:25] + [r for r in table[25:] if r['variant'][0] == 'none' or r['variant'][1:4] == ('plain', 100, 1)]
if args.frozen:
    frozen = set(json.loads(args.frozen.read_text())['variants']) | {'A3, no reranker', 'mmarco plain D=100 α=1'}
    shown = [r for r in table if name(r['variant']) in frozen]
for r in shown:
    print(f"| {name(r['variant'])} | {r['answer_at_3']:.0%} | {r['mrr']:.2f} | {r['won']} | {r['lost']} | "
          f"{', '.join(r['gate_lost']) or '—'} | {'yes' if r['passes'] else 'no'} |")
if args.frozen:
    raise SystemExit
print(f"\nChosen: {name(passing[0]['variant']) if passing else 'no reranker'}")
cheapest = next((r for r in passing if r['variant'][0] == 'mmarco'), None)
print(f"Best passing mMARCO variant: {name(cheapest['variant']) if cheapest else 'none'}")
