"""Table for pipeline.py --long on the sealed long split (PROTOCOL.md, "Cancelled decisions and long messages")."""
import argparse
from collections import defaultdict
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('run', type=Path)
args = parser.parse_args()
rows = json.loads(args.run.read_text())['rows']
by_arm = defaultdict(list)
for row in rows:
    by_arm[row['base']].append(row)
share = lambda values: f"{sum(values) / len(values):.0%}" if values else '—'
core = {row['question']: row for row in by_arm['mmarco mix, parent 300 chars, 512 tokens']}
print('| Arm | Answer@3 | MRR | Answer span in first 3 / 10 | Revoked Answer@3 | Control Answer@3 |'
      ' Won / lost vs Core | Pairs cut |')
print('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
for arm, group in by_arm.items():
    answerable = [row for row in group if 'answer_at_3' in row]
    won = sum(row['answer_at_3'] and not core[row['question']]['answer_at_3'] for row in answerable)
    lost = sum(core[row['question']]['answer_at_3'] and not row['answer_at_3'] for row in answerable)
    mrr = sum(row['answer_rr'] for row in answerable) / len(answerable)
    print(f"| {arm} | {share([r['answer_at_3'] for r in answerable])} | {mrr:.2f} | "
          f"{share([r['span_at_3'] for r in answerable])} / {share([r['span_at_10'] for r in answerable])} | "
          f"{share([r['answer_at_3'] for r in answerable if r['kind'] == 'revoked'])} | "
          f"{share([r['answer_at_3'] for r in answerable if r['control']])} | {won} / {lost} | "
          f"{sum(r.get('cut_pairs', 0) for r in group) or '—'} |")
answerable = [row for row in by_arm['A3'] if 'answer_at_3' in row]
print(f"\n{len(answerable)} answerable questions, "
      f"{sum(r['kind'] == 'revoked' for r in answerable)} revoked, {sum(r['control'] for r in answerable)} controls.")
