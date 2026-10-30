"""Applies the follow-up choice rule of PROTOCOL.md ("Cancelled decisions and long messages") and prints a table."""
import argparse
from collections import defaultdict
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('runs', nargs='+', type=Path, help='arms.json files from pipeline.py --followups')
parser.add_argument('--frozen', help='score only this variant, as the table names it, plus the bases')
args = parser.parse_args()
rows = [row for path in args.runs for row in json.loads(path.read_text())['rows']]
name = lambda r: 'none' if r['k'] is None else f"K={r['k']} M={r['m']} T={r['t']} {r['placement']}"
base_of = {(r['question'], r['base']): r for r in rows if r['k'] is None}
groups = defaultdict(list)
for row in rows:
    groups[(row['base'], name(row))].append(row)


def judge(group):
    won = lost = revoked_won = control_lost = sides_lost = 0
    other_rr, other_base_rr, added = [], [], 0
    for row in group:
        base = base_of[(row['question'], row['base'])]
        added += row['bytes'] - base['bytes']
        if row['kind'] in ('conflict', 'revoked') and base['all_conflict_sides'] and not row['all_conflict_sides']:
            sides_lost += 1
        if 'answer_at_3' not in row:
            continue
        better, worse = row['answer_at_3'] and not base['answer_at_3'], base['answer_at_3'] and not row['answer_at_3']
        won, lost = won + better, lost + worse
        revoked_won += better and row['kind'] == 'revoked'
        control_lost += worse and row['control']
        if row['kind'] != 'revoked':
            other_rr.append(row['answer_rr'])
            other_base_rr.append(base['answer_rr'])
    answerable = [row for row in group if 'answer_at_3' in row]
    mrr_drop = (sum(other_base_rr) - sum(other_rr)) / len(other_rr) if other_rr else 0
    return {'answer_at_3': sum(r['answer_at_3'] for r in answerable) / len(answerable),
            'mrr': sum(r['answer_rr'] for r in answerable) / len(answerable), 'won': won, 'lost': lost,
            'revoked_won': revoked_won, 'control_lost': control_lost, 'sides_lost': sides_lost,
            'mrr_drop': mrr_drop, 'added_bytes': added / len(group),
            'passes': lost == 0 and sides_lost == 0 and mrr_drop <= .01}


tie = lambda variant: tuple(r for r in (variant[1].split() if variant[1] != 'none' else []))
results = {key: judge(group) for key, group in groups.items()}
print('| Base | Variant | Answer@3 | MRR | Won | Lost | Revoked won | Control lost | Sides lost | MRR drop, others |'
      ' Added bytes | Passes |')
print('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |')
for base in dict.fromkeys(key[0] for key in results):
    keys = [key for key in results if key[0] == base and (not args.frozen or key[1] in ('none', args.frozen))]
    order = lambda key: (key[1] != 'none', -results[key]['revoked_won'], results[key]['added_bytes'])
    for key in sorted(keys, key=order)[:12 if not args.frozen else None]:
        r = results[key]
        print(f"| {base} | {key[1]} | {r['answer_at_3']:.0%} | {r['mrr']:.2f} | {r['won']} | {r['lost']} | "
              f"{r['revoked_won']} | {r['control_lost']} | {r['sides_lost']} | {r['mrr_drop']:.3f} | "
              f"{r['added_bytes']:.0f} | {'yes' if r['passes'] else 'no'} |")
    if args.frozen:
        continue
    passing = [key for key in keys if key[1] != 'none' and results[key]['passes']]
    sort_key = lambda key: (-results[key]['revoked_won'],
                            [int(part.split('=')[1]) for part in key[1].split()[:3]], key[1].split()[3] != 'ctx')
    chosen = min(passing, key=sort_key) if passing else None
    verdict = chosen[1] if chosen and results[chosen]['revoked_won'] >= 2 else 'no change'
    print(f"\n{base}: chosen **{verdict}**"
          f"{f' ({results[chosen]["revoked_won"]} revoked won)' if chosen else ''}\n")
