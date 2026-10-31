"""Compares Core's follow-ups (core/followups-agreement.mjs) with pipeline.py's followups(uid, 2, 3), unit by unit."""
import glob
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import snowballstemmer

root = Path(__file__).resolve().parent
stem = {'ru': snowballstemmer.stemmer('russian'), 'en': snowballstemmer.stemmer('english')}


def terms(text):
    words = re.findall(r'[^\W\d_]{3,}', text.casefold().replace('ё', 'е'))
    return {stem['ru' if re.search('[а-я]', word) else 'en'].stemWord(word) for word in words}


rows = {}
for split, core_path in zip(sys.argv[1::2], sys.argv[2::2]):
    units, project = {}, {}
    for path in sorted((root / 'corpus' / split).glob('*.json')):
        corpus = json.loads(path.read_text())
        for unit in corpus['units']:
            units[unit['id']], project[unit['id']] = unit, corpus['project']['id']
    links = {uid: terms((' › '.join(u['section']) + '\n' if u.get('section') else '') + u['text'])
             for uid, u in units.items()}
    frequency = Counter(term for found in links.values() for term in found)
    later = defaultdict(list)
    for uid in units:
        later[project[uid]].append(uid)
    for ids in later.values():
        ids.sort(key=lambda uid: (units[uid]['at'], uid), reverse=True)
    core = json.loads(Path(core_path).read_text())
    answers = {uid for path in glob.glob(str(root / 'questions' / split / '*.json')) for q in json.loads(Path(path).read_text())
               if q['kind'] == 'revoked' for uid, grade in q['grades'].items() if int(grade) == 3}
    counts = Counter()
    for uid, theirs in core['followups'].items():
        rare = {term for term in links[uid] if frequency[term] <= 3}
        ours = [other for other in later[project[uid]]
                if units[other]['at'] > units[uid]['at'] and links[other] & rare][:2]
        counts['units'] += 1
        counts['same follow-ups'] += ours == theirs
        counts['same set, other order'] += ours != theirs and set(ours) == set(theirs)
        counts['harness has some, Core none'] += bool(ours) and not theirs
        counts['Core has some, harness none'] += bool(theirs) and not ours
        counts['both have some, different'] += bool(ours) and bool(theirs) and set(ours) != set(theirs)
        counts['units with a follow-up (harness)'] += bool(ours)
        counts['a cancelling answer only the harness links'] += bool((set(ours) - set(theirs)) & answers)
        counts['a cancelling answer only Core links'] += bool((set(theirs) - set(ours)) & answers)
    counts['Core lookup ms'] = round(core['lookupMs'])
    rows[split] = counts
keys = list(next(iter(rows.values())))
print('| Split | ' + ' | '.join(keys) + ' |')
print('| --- |' + ' ---: |' * len(keys))
for split, counts in rows.items():
    print(f'| {split} | ' + ' | '.join(str(counts[key]) for key in keys) + ' |')
