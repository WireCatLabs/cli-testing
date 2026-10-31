"""Per split: how often the cancelling unit of a `revoked` question is a follow-up (M 2, T 3) of the decision it cancels, and from which source."""
import json, re, sys
from collections import Counter, defaultdict
from pathlib import Path
import snowballstemmer
root = Path(__file__).resolve().parent
stem = {'ru': snowballstemmer.stemmer('russian'), 'en': snowballstemmer.stemmer('english')}
def terms(t):
    return {stem['ru' if re.search('[а-я]', w) else 'en'].stemWord(w) for w in re.findall(r'[^\W\d_]{3,}', t.casefold().replace('ё', 'е'))}
for split in sys.argv[1:]:
    units, proj = {}, {}
    for p in sorted((root / 'corpus' / split).glob('*.json')):
        c = json.loads(p.read_text())
        for u in c['units']:
            units[u['id']] = u; proj[u['id']] = c['project']['id']
    text = lambda u: (' › '.join(u['section']) + '\n' if u.get('section') else '') + u['text']
    links = {k: terms(text(u)) for k, u in units.items()}
    df = Counter(t for s in links.values() for t in s)
    later = defaultdict(list)
    for k in units: later[proj[k]].append(k)
    for v in later.values(): v.sort(key=lambda k: (units[k]['at'], k), reverse=True)
    def follow(k, m=2, t=3, same=False):
        rare = {x for x in links[k] if df[x] <= t}
        return [l for l in later[proj[k]] if units[l]['at'] > units[k]['at'] and links[l] & rare
                and (not same or units[l]['source'] == units[k]['source'])][:m]
    stats = Counter()
    for p in sorted((root / 'questions' / split).glob('*.json')):
        for q in json.loads(p.read_text()):
            if q['kind'] != 'revoked' or not q['answerable']: continue
            g3 = {u for u, g in q['grades'].items() if int(g) == 3}
            g2 = [u for u, g in q['grades'].items() if int(g) == 2]
            stats['revoked'] += 1
            linked = [(d, g) for d in g2 for g in follow(d) if g in g3]
            stats['G3 is a follow-up of a G2'] += bool(linked)
            stats['  ...from the same source'] += any(units[d]['source'] == units[g]['source'] for d, g in linked)
            stats['G3 follow-up of G2, same-source rule'] += any(g in g3 for d in g2 for g in follow(d, same=True))
            stats['G3 is a native reply to a G2'] += any(units[g].get('reply_to') in g2 for g in g3)
            stats['G3 in same source as some G2'] += any(units[g]['source'] == units[d]['source'] for g in g3 for d in g2)
    print(split, dict(stats))
