"""Checks a split against CORPUS.md and prints only counts and hashes, so a sealed split stays unread."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

KINDS = {'fact', 'negative', 'conditional', 'approval', 'unresolved', 'conflict', 'revoked', 'same-name', 'missing',
         'premise'}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('split')
args = parser.parse_args()
root = Path(__file__).resolve().parent
errors, report, seen = [], {}, set()
units = {}
for path in sorted((root / 'corpus' / args.split).glob('*.json')):
    corpus = json.loads(path.read_text())
    source_ids = {source['id'] for source in corpus['sources']}
    last = {}
    for unit in corpus['units']:
        if unit['id'] in seen:
            errors.append(f'duplicate unit id in {path.name}')
        seen.add(unit['id'])
        units[unit['id']] = unit
        if unit['source'] not in source_ids:
            errors.append(f'{path.name}: unknown source')
        if len(unit['text'].encode()) > 1200:
            errors.append(f'{path.name}: unit over 1,200 bytes')
        if unit['at'] < last.get(unit['source'], ''):
            errors.append(f'{path.name}: units out of time order')
        last[unit['source']] = unit['at']
    for unit in corpus['units']:
        parent = units.get(unit.get('reply_to')) if unit.get('reply_to') else None
        if unit.get('reply_to') and (parent is None or parent['source'] != unit['source']):
            errors.append(f'{path.name}: reply_to outside its source')
    report[path.name] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'units': len(corpus['units']),
                         'sources': Counter(source['kind'] for source in corpus['sources'])}
kinds, languages, answerable = Counter(), Counter(), Counter()
for path in sorted((root / 'questions' / args.split).glob('*.json')):
    questions = json.loads(path.read_text())
    for question in questions:
        kinds[question['kind']] += 1
        languages[question['language']] += 1
        answerable[question['answerable']] += 1
        if question['kind'] not in KINDS:
            errors.append(f'{path.name}: unknown kind')
        if any(uid not in units for uid in question['grades']):
            errors.append(f'{path.name}: graded unit missing')
        if any(int(grade) not in (1, 2, 3) for grade in question['grades'].values()):
            errors.append(f'{path.name}: grade outside 1–3')
        if any(uid not in question['grades'] for s in question['evidence_sets'] for uid in s):
            errors.append(f'{path.name}: evidence set uses an ungraded unit')
        if question['answerable'] and not any(int(g) == 3 for g in question['grades'].values()):
            errors.append(f'{path.name}: answerable question without a grade-3 unit')
    report[path.name] = {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'questions': len(questions)}
print(json.dumps({'split': args.split, 'files': report, 'kinds': kinds, 'languages': languages,
                  'answerable': {str(k): v for k, v in answerable.items()}, 'errors': sorted(set(errors))},
                 ensure_ascii=False, indent=1))
raise SystemExit(1 if errors else 0)
