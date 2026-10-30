"""Pass or fail for the follow-up variant on the blind split (PROTOCOL.md, "Blind re-test of follow-ups")."""
import argparse
import json
from pathlib import Path

CORE = 'mmarco mix, parent 300 chars, 512 tokens'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('run', type=Path)
args = parser.parse_args()
rows = json.loads(args.run.read_text())['rows']
core = {row['question']: row for row in rows if row['base'] == CORE}
variant = {row['question']: row for row in rows if row['base'].startswith(CORE + ' + follow-ups')}
answerable = [q for q, row in core.items() if 'answer_at_3' in row]
won = [q for q in answerable if variant[q]['answer_at_3'] and not core[q]['answer_at_3']]
lost = [q for q in answerable if core[q]['answer_at_3'] and not variant[q]['answer_at_3']]
sides_lost = [q for q, row in core.items() if row['kind'] in ('conflict', 'revoked')
              and row['all_conflict_sides'] and not variant[q]['all_conflict_sides']]
others = [q for q in answerable if core[q]['kind'] != 'revoked']
mrr = lambda table: sum(table[q]['answer_rr'] for q in others) / len(others)
revoked_won = [q for q in won if core[q]['kind'] == 'revoked']
checks = {'revoked questions won (needs 2+)': len(revoked_won),
          'answerable questions lost (needs 0)': len(lost),
          'conflict/revoked "all sides" lost (needs 0)': len(sides_lost),
          'MRR drop on other answerable questions (needs <= 0.01)': round(mrr(core) - mrr(variant), 4)}
passed = len(revoked_won) >= 2 and not lost and not sides_lost and mrr(core) - mrr(variant) <= .01
print(json.dumps({'checks': checks, 'controls lost': [q for q in lost if core[q]['control']],
                  'verdict': 'pass' if passed else 'fail'}, indent=1))
