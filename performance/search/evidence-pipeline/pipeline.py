"""Evidence arms A0–A4 and the fixed-candidate comparison over one split. Synthetic inputs only."""
import argparse
from collections import Counter, defaultdict
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import platform
import re
import statistics
import sys
import time

import numpy as np
import onnxruntime as ort
import snowballstemmer
from tokenizers import Tokenizer

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--split')
parser.add_argument('--discovery', type=Path, help='core/discover.mjs output for this split')
parser.add_argument('--stdin', action='store_true',
                    help='units, questions and discovery rows as JSON on stdin; writes selections only, no text')
parser.add_argument('--models', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--pools', default='50,100,300')
parser.add_argument('--budgets', default='4096,8192,16384')
parser.add_argument('--mmr-lambda', type=float, default=.7)
parser.add_argument('--fixed-models', default='mmarco,bge-int8')
parser.add_argument('--threads', type=int, default=4)
parser.add_argument('--variants', default='', help='rerankers for the variant grid of PROTOCOL.md, e.g. mmarco,bge-int8')
parser.add_argument('--taus', default='', help='newest-first cosine thresholds, e.g. 0.88,0.92')
parser.add_argument('--cosines', action='store_true', help='print the E5 cosine spread among top hits and stop')
parser.add_argument('--floors', default='',
                    help='minimum E5 cosines for the meaning list before fusion, e.g. 0.80,0.84; scores them and stops')
parser.add_argument('--long', action='store_true',
                    help='score the long-message measures of PROTOCOL.md "Cancelled decisions and long messages", stop')
parser.add_argument('--followups', action='store_true',
                    help='score the follow-up grid of PROTOCOL.md "Cancelled decisions and long messages" and stop')
args = parser.parse_args()
assert not args.output.exists(), 'refuse to overwrite a run'
root = Path(__file__).resolve().parent
POOLS = [int(value) for value in args.pools.split(',')]
BUDGETS = [int(value) for value in args.budgets.split(',')]
RRF_K = 60


def sha(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def memory():
    return {line.split(':')[0]: int(line.split()[1]) * 1024
            for line in Path('/proc/self/status').read_text().splitlines() if line.startswith(('VmRSS:', 'VmHWM:'))}


if args.stdin:
    payload = json.load(sys.stdin)
    corpus_paths, question_paths, labels = [], [], []
    sources = {source['id']: source for source in payload['sources']}
    units = {unit['id']: unit for unit in payload['units']}
    questions = payload['questions']
    discovery = {row['id']: row for row in payload['discovery']}
else:
    corpus_paths = sorted((root / 'corpus' / args.split).glob('*.json'))
    question_paths = sorted((root / 'questions' / args.split).glob('*.json'))
    units, sources, project_of = {}, {}, {}
    for path in corpus_paths:
        corpus = json.loads(path.read_text())
        sources.update({source['id']: source for source in corpus['sources']})
        units.update({unit['id']: unit for unit in corpus['units']})
        project_of.update({unit['id']: corpus['project']['id'] for unit in corpus['units']})
    labels = [question for path in question_paths for question in json.loads(path.read_text())]
    questions = [{'id': question['id'], 'text': question['text']} for question in labels]
    discovery = {row['id']: row for row in json.loads(args.discovery.read_text())['rows']}
label_of = {label['id']: label for label in labels}
assert set(discovery) == {question['id'] for question in questions}, 'discovery run covers other questions'

text_of = {uid: (' › '.join(unit['section']) + '\n' if unit.get('section') else '') + unit['text']
           for uid, unit in units.items()}
children = defaultdict(list)
for uid, unit in units.items():
    if unit.get('reply_to'):
        children[unit['reply_to']].append(uid)
neighbours = {}
by_source = defaultdict(list)
for uid, unit in units.items():
    by_source[unit['source']].append(uid)
for source, ids in by_source.items():
    ids.sort(key=lambda uid: units[uid]['at'])
    if sources[source]['kind'] == 'meeting':
        for index, uid in enumerate(ids):
            neighbours[uid] = ids[max(0, index - 1):index] + ids[index + 1:index + 2]


def context_of(uid):
    """Native context: reply parent, two earliest direct replies, neighbouring transcript turns."""
    unit = units[uid]
    before = [unit['reply_to']] if unit.get('reply_to') in units else []
    before += [n for n in neighbours.get(uid, []) if units[n]['at'] < unit['at']]
    after = sorted(children.get(uid, []), key=lambda c: units[c]['at'])[:2]
    after += [n for n in neighbours.get(uid, []) if units[n]['at'] > unit['at']]
    return before, after


PASSAGE_BYTES = 1200
sentence_vectors = {}


def serialize(uid, text=None):
    unit = units[uid]
    return f"[{sources[unit['source']]['title']} · {unit['author']} · {unit['at']}]\n{text or text_of[uid]}"


def pair_input(uid, rich, parent_chars=None):
    before, _ = context_of(uid)
    if parent_chars:
        return '\n'.join(f"[{sources[units[u]['source']]['title']} · {units[u]['author']} · {units[u]['at'][:10]}] "
                         f"{text_of[u][:parent_chars] if u != uid else text_of[u]}" for u in before[:1] + [uid])
    if rich:
        return '\n'.join(f"[{sources[units[u]['source']]['title']} · {units[u]['author']} · {units[u]['at'][:10]}] "
                         f"{text_of[u]}" for u in before[:1] + [uid])
    return '\n'.join(text_of[u] for u in before[:1] + [uid])


def passage(uid, qv):
    """A long unit shrinks to its sentences closest to the query, in their original order."""
    text = text_of[uid]
    if len(text.encode()) <= PASSAGE_BYTES:
        return text
    sentences = [part.strip() for part in re.split(r'(?<=[.!?…])\s+|\n+', text) if part.strip()]
    if uid not in sentence_vectors:
        sentence_vectors[uid] = np.stack([e5.embed('passage: ' + sentence) for sentence in sentences])
    keep, size = set(), 0
    for index in np.argsort(-(sentence_vectors[uid] @ qv), kind='stable'):
        length = len(sentences[index].encode()) + 3
        if size + length <= PASSAGE_BYTES:
            keep.add(int(index))
            size += length
    return ' … '.join(sentence for index, sentence in enumerate(sentences) if index in keep)


def fingerprint(uid):
    return hashlib.sha1(' '.join(re.findall(r'\w+', units[uid]['text'].casefold())).encode()).hexdigest()


class Encoder:
    def __init__(self, name):
        catalog = json.loads((root / 'models.json').read_text())
        self.spec = next(model for model in catalog['models'] if model['id'] == name)
        cache = args.models / name
        for file in self.spec['files']:
            assert sha(cache / file['name']) == file['sha256'], file['name']
        self.tokenizer = Tokenizer.from_file(str(cache / 'tokenizer.json'))
        self.tokenizer.no_padding()
        self.tokenizer.no_truncation()
        options = ort.SessionOptions()
        options.intra_op_num_threads = args.threads
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        weights = next(file['name'] for file in self.spec['files'] if file['name'].endswith('.onnx'))
        self.session = ort.InferenceSession(str(cache / weights), sess_options=options,
                                            providers=['CPUExecutionProvider'])
        self.inputs = {item.name for item in self.session.get_inputs()}
        self.clipped = 0

    def feed(self, encoding, cap=None):
        ids = encoding.ids
        limit = min(cap or self.spec['max_tokens'], self.spec['max_tokens'])
        if len(ids) > limit:
            self.clipped += 1
            ids = ids[:limit - 1] + ids[-1:]
        values = {'input_ids': ids, 'attention_mask': [1] * len(ids),
                  'token_type_ids': (encoding.type_ids or [0] * len(ids))[:len(ids)]}
        return {key: np.array([values[key]], dtype=np.int64) for key in self.inputs}

    def embed(self, text):
        feed = self.feed(self.tokenizer.encode(text))
        hidden = self.session.run(None, feed)[0][0]
        vector = hidden.mean(axis=0)
        return vector / np.linalg.norm(vector)

    def pair(self, query, passage, cap=None):
        output = self.session.run(None, self.feed(self.tokenizer.encode(query, passage), cap))[0]
        assert output.size == 1 and np.isfinite(output).all()
        return float(output.reshape(-1)[0])


stage = Counter()
started = time.perf_counter()
e5 = Encoder('e5-small')
stage['e5_load_ms'] = (time.perf_counter() - started) * 1000
order = sorted(units)
started = time.perf_counter()
matrix = np.stack([e5.embed('passage: ' + text_of[uid]) for uid in order])
stage['e5_index_ms'] = (time.perf_counter() - started) * 1000
row_of = {uid: index for index, uid in enumerate(order)}

stemmers = {'ru': snowballstemmer.stemmer('russian'), 'en': snowballstemmer.stemmer('english')}


def terms(text):
    words = re.findall(r'\w+', text.casefold().replace('ё', 'е'))
    return [stemmers['ru' if re.search('[а-я]', word) else 'en'].stemWord(word) for word in words]


bags = {uid: Counter(terms(text_of[uid])) for uid in order}
lengths = {uid: sum(bag.values()) for uid, bag in bags.items()}
average_length = sum(lengths.values()) / len(lengths)
frequency = Counter(term for bag in bags.values() for term in bag)


def bm25(query, ids):
    query_terms = set(terms(query))
    scores = {}
    for uid in ids:
        score = 0
        for term in query_terms:
            count = bags[uid][term]
            if count:
                idf = math.log(1 + (len(bags) - frequency[term] + .5) / (frequency[term] + .5))
                score += idf * count * 2.2 / (count + 1.2 * (.25 + .75 * lengths[uid] / average_length))
        scores[uid] = score
    return scores


def ranked(scores):
    return sorted(scores, key=lambda uid: (-scores[uid], uid))


def rrf(*rankings):
    fused = Counter()
    for ranking in rankings:
        for rank, uid in enumerate(ranking):
            fused[uid] += 1 / (RRF_K + rank + 1)
    return fused


def mmr(items, relevance, lam):
    """items: hit ids in relevance order; diversity on the mean E5 vector of each hit with its context."""
    if not items:
        return []
    vectors = []
    for uid in items:
        before, after = context_of(uid)
        vector = matrix[[row_of[u] for u in before + [uid] + after]].mean(axis=0)
        vectors.append(vector / np.linalg.norm(vector))
    vectors = np.stack(vectors)
    values = np.array([relevance[uid] for uid in items])
    span = values.max() - values.min()
    norm = (values - values.min()) / span if span else np.ones(len(items))
    closest = np.zeros(len(items))
    open_ = np.ones(len(items), dtype=bool)
    chosen = []
    for _ in items:
        gain = np.where(open_, lam * norm - (1 - lam) * closest, -np.inf)
        best = int(np.argmax(gain))
        open_[best] = False
        chosen.append(items[best])
        closest = np.maximum(closest, vectors @ vectors[best])
    return chosen


def evidence(hits, with_context, dedupe, budget, qv=None, shown=None, follow=None):
    """Items in hit order while they fit the byte budget; an item that does not fit is skipped and counted.
    With a query vector, long units shrink to passages."""
    included, prints, items, texts, used = set(), set(), [], {}, 0
    extras = Counter()
    for uid in hits:
        before, after = context_of(uid) if with_context else ([], [])
        item = list(dict.fromkeys(u for u in before + [uid] + after + (follow or {}).get(uid, []) if u not in included))
        if dedupe:
            item = [u for u in item if fingerprint(u) not in prints]
        if uid in included or not item:
            continue
        rendered = {u: serialize(u, passage(u, qv) if qv is not None else None) for u in item}
        size = sum(len(text.encode()) + 2 for text in rendered.values())
        if used + size > budget:
            extras['skipped_items'] += 1
            continue
        for u in item:
            if fingerprint(u) in prints:
                extras['duplicate_bytes'] += len(rendered[u].encode()) + 2
            prints.add(fingerprint(u))
            extras['trimmed_units'] += rendered[u] != serialize(u)
        included.update(item)
        texts.update(rendered)
        items.append(item)
        if shown is not None:
            shown.append(uid)
        used += size
    return items, texts, used, extras


mmarco_tokens = Tokenizer.from_file(str(args.models / 'mmarco' / 'tokenizer.json'))


def score_items(label, items, texts, used, extras):
    grades = {uid: int(grade) for uid, grade in label['grades'].items()}
    flat = [u for item in items for u in item]
    item_grades = [max((grades.get(u, 0) for u in item), default=0) for item in items]
    first = next((index for index, grade in enumerate(item_grades) if grade == 3), None)
    dcg = lambda values: sum((2 ** g - 1) / math.log2(i + 2) for i, g in enumerate(values[:10]))
    ideal = dcg(sorted(grades.values(), reverse=True))
    text = '\n\n'.join(texts.get(u) or serialize(u) for u in flat)
    row = {
        'units': flat, 'items': len(items), 'bytes': used, 'tokens': len(mmarco_tokens.encode(text).ids),
        'ndcg_10': dcg([grades.get(u, 0) for u in flat]) / ideal if ideal else None,
        'direct_precision_5': sum(g == 3 for g in item_grades[:5]) / 5,
        'complete_set': any(set(s) <= set(flat) for s in label['evidence_sets'] if s),
        'all_conflict_sides': all(u in flat for u, g in grades.items() if g >= 2),
        **extras,
        'off_question_bytes': sum(len((texts.get(u) or serialize(u)).encode()) + 2 for u in flat if grades.get(u, 0) == 0),
    }
    if label['answerable'] and any(g == 3 for g in grades.values()):
        row.update({'answer_at_1': first == 0, 'answer_at_3': first is not None and first < 3,
                    'answer_at_10': first is not None and first < 10,
                    'answer_rr': 1 / (first + 1) if first is not None else 0})
    return row


def coverage(label, pool_units):
    grades = label['grades']
    useful = [u for u, g in grades.items() if g >= 1]
    return {'answer_in_pool': any(g == 3 and u in pool_units for u, g in grades.items()),
            'evidence_recall': sum(u in pool_units for u in useful) / len(useful) if useful else None}


mmarco = Encoder('mmarco')
end_to_end, times, asked = [], defaultdict(list), []
for question in questions:
    qid, text = question['id'], question['text']
    label = label_of.get(qid)
    t = time.perf_counter()
    qv = e5.embed('query: ' + text)
    similarity = matrix @ qv
    dense = [order[i] for i in np.argsort(-similarity, kind='stable')[:max(POOLS)]]
    times['dense_ms'].append((time.perf_counter() - t) * 1000)
    lexical = [uid for uid in discovery[qid]['ranked'] if uid in units]
    times['discovery_ms'].append(statistics.median(discovery[qid]['elapsed_ms']))
    t = time.perf_counter()
    pair_scores = {}
    fused_full = rrf(lexical[:max(POOLS)], dense)
    fused_order = ranked(fused_full)[:max(POOLS)]
    for uid in fused_order:
        pair_scores[uid] = mmarco.pair(text, pair_input(uid, False))
    times['mmarco_pairs_ms'].append((time.perf_counter() - t) * 1000)
    times['mmarco_pairs'].append(len(fused_order))
    asked.append((qid, text, label, qv, lexical, dense, pair_scores))
    for pool in POOLS:
        fused = rrf(lexical[:pool], dense[:pool])
        fused_hits = ranked(fused)[:pool]
        t = time.perf_counter()
        diverse = mmr(fused_hits, fused, args.mmr_lambda)
        times[f'mmr_{pool}_ms'].append((time.perf_counter() - t) * 1000)
        reranked_scores = {uid: pair_scores[uid] for uid in fused_hits}
        reranked = mmr(ranked(reranked_scores), reranked_scores, args.mmr_lambda)
        arms = {
            'A0': (lexical[:pool], False, False),
            'A1': (lexical[:pool], True, False),
            'A2': (fused_hits, True, False),
            'A3': (diverse, True, True),
            'A4': (reranked, True, True),
        }
        for arm, (hits, with_context, dedupe) in arms.items():
            trim = qv if arm in ('A3', 'A4') else None
            pool_units = set(hits)
            if with_context:
                for uid in hits:
                    before, after = context_of(uid)
                    pool_units.update(before + after)
            row = {'question': qid, 'arm': arm, 'pool': pool, 'budgets': {}}
            if label:
                row.update(coverage(label, pool_units))
            else:
                row['pool_units'] = sorted(pool_units)
            for budget in BUDGETS:
                items, texts, used, extras = evidence(hits, with_context, dedupe, budget, trim)
                row['budgets'][budget] = score_items(label, items, texts, used, extras) if label else {
                    'items': items, 'bytes': used, **extras}
            end_to_end.append(row)



def newest_first(hits, tau, window=30):
    """A hit moves just above an earlier, similar and older hit; each hit moves once."""
    hits, moved = list(hits), set()
    position = 0
    while position < min(window, len(hits)):
        anchor = hits[position]
        later = [u for u in hits[position + 1:window] if u not in moved and units[u]['at'] > units[anchor]['at']
                 and float(matrix[row_of[u]] @ matrix[row_of[anchor]]) >= tau]
        if later:
            newest = max(later, key=lambda u: units[u]['at'])
            hits.remove(newest)
            hits.insert(position, newest)
            moved.add(newest)
        else:
            position += 1
    return hits


def scaled(values):
    values = np.array(values, dtype=float)
    span = values.max() - values.min()
    return (values - values.min()) / span if span else np.ones(len(values))


if args.cosines:
    spread = defaultdict(list)
    for qid, text, label, qv, lexical, dense, _ in asked:
        top = ranked(rrf(lexical[:100], dense[:100]))[:30]
        vectors = matrix[[row_of[u] for u in top]]
        cos = vectors @ vectors.T
        values = cos[np.triu_indices(len(top), 1)]
        spread['all'].extend(values.tolist())
        if label:
            useful = [i for i, u in enumerate(top) if label['grades'].get(u, 0) >= 2]
            spread['graded'].extend(cos[i, j] for a, i in enumerate(useful) for j in useful[a + 1:])
    print(json.dumps({key: {str(q): round(float(np.quantile(v, q)), 3) for q in (.5, .9, .95, .99)} | {'n': len(v)}
                      for key, v in spread.items()}))
    sys.exit()

def plain_words(query):
    """Core's plainWords (src/services/pictures.ts): the text the meaning lane embeds instead of the raw question."""
    query = re.sub(r'\b(?:text|content|transcript|filename):("[^"]*"|\S+)', r'\1', query, flags=re.I)
    query = re.sub(r'\b[a-z_]+:("[^"]*"|\[[^\]]*\]|\{[^}]*\}|\([^)]*\)|\S+)', ' ', query, flags=re.I)
    query = re.sub(r'\b(?:AND|OR|NOT)\b', ' ', query)
    return re.sub(r'\s+', ' ', re.sub(r'[()"+\-~^*?\\[\]{}!|&]', ' ', query)).strip()


if args.floors:
    floors = [None] + [float(value) for value in args.floors.split(',')]
    rerankers = {'mmarco': mmarco, 'bge-int8': Encoder('bge-int8')}
    floor_rows, cosines = [], []
    for qid, text, label, qv, lexical, dense, _ in asked:
        similarity = matrix @ qv
        core_similarity = matrix @ e5.embed('query: ' + plain_words(text))
        words = lexical[:100]
        grades = {uid: int(grade) for uid, grade in label['grades'].items()}
        cosines.append({'question': qid, 'kind': label['kind'], 'answerable': label['answerable'],
                        'top1': float(similarity[row_of[dense[0]]]),
                        'top1_core_query': float(core_similarity.max()),
                        'graded': {uid: [grade, float(similarity[row_of[uid]])] for uid, grade in grades.items()
                                   if uid in row_of},
                        'ungraded_top100': [float(similarity[row_of[uid]]) for uid in dense[:100]
                                            if grades.get(uid, 0) == 0]})
        pairs = {name: {} for name in rerankers}
        for floor in floors:
            near = [uid for uid in dense[:100] if floor is None or similarity[row_of[uid]] >= floor]
            meaning_only = set(near) - set(words)
            fused = rrf(words, near)
            a2 = ranked(fused)[:100]
            base = mmr(a2, fused, args.mmr_lambda)
            orders = {'A2': (a2, False), 'A3': (base, True)}
            for name, encoder in rerankers.items():
                head = base[:50]
                for uid in head:
                    if uid not in pairs[name]:
                        pairs[name][uid] = encoder.pair(text, pair_input(uid, True))
                mixed = dict(zip(head, .3 * scaled([fused[u] for u in head]) + .7 * scaled([pairs[name][u] for u in head])))
                orders[f'{name} rich D=50 α=0.7'] = (mmr(ranked(mixed), mixed, args.mmr_lambda) + base[50:], True)
            for arm, (hits, dedupe) in orders.items():
                shown = []
                items, texts, used, extras = evidence(hits, True, dedupe, 8192, qv if dedupe else None, shown)
                scores = score_items(label, items, texts, used, extras)
                top5 = list(zip(shown[:5], items[:5]))
                floor_rows.append({
                    'question': qid, 'kind': label['kind'], 'answerable': label['answerable'], 'floor': floor,
                    'arm': arm, 'meaning_kept': len(near), 'meaning_only_kept': len(meaning_only),
                    'meaning_only_top5': sum(hit in meaning_only for hit, _ in top5),
                    'meaning_only_offtopic_top5': sum(hit in meaning_only and max(grades.get(u, 0) for u in item) == 0
                                                      for hit, item in top5),
                    'words_only': not meaning_only, 'empty': not hits,
                    **{key: value for key, value in scores.items() if key != 'units'}})
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({
        'purpose': 'Meaning floor before fusion; see PROTOCOL.md "Meaning floor"', 'split': args.split,
        'inputs': {str(path.relative_to(root)): sha(path) for path in corpus_paths + question_paths},
        'discovery_run': {'path': str(args.discovery), 'sha256': sha(args.discovery)},
        'worker_sha256': sha(Path(__file__)), 'settings': {'floors': floors, 'mmr_lambda': args.mmr_lambda,
                                                          'rrf_k': RRF_K, 'meaning_depth': 100, 'budget': 8192},
        'rows': floor_rows, 'cosines': cosines}, ensure_ascii=False, indent=1) + '\n')
    print(json.dumps({'split': args.split, 'rows': len(floor_rows)}))
    sys.exit()

def link_terms(text):
    words = re.findall(r'[^\W\d_]{3,}', text.casefold().replace('ё', 'е'))
    return {stemmers['ru' if re.search('[а-я]', word) else 'en'].stemWord(word) for word in words}


if args.followups or args.long:
    later_of = defaultdict(list)
    for uid in order:
        later_of[project_of[uid]].append(uid)
    for ids in later_of.values():
        ids.sort(key=lambda uid: (units[uid]['at'], uid), reverse=True)
    links = {uid: link_terms(text_of[uid]) for uid in order}
    document_frequency = Counter(term for found in links.values() for term in found)

    def followups(uid, m, t):
        rare = {term for term in links[uid] if document_frequency[term] <= t}
        return [later for later in later_of[project_of[uid]]
                if units[later]['at'] > units[uid]['at'] and links[later] & rare][:m]

    def row_of_long(qid, label, name, items, texts, used, extras, extra, span_at):
        scores = score_items(label, items, texts, used, extras)
        spans = {f'span_at_{n}': span_at(label, items, texts, n) for n in (3, 10)} if label['answerable'] else {}
        return {'question': qid, 'kind': label['kind'], 'answerable': label['answerable'],
                'control': bool(label.get('control')), 'base': name, 'k': None, **spans, **extra,
                **{key: value for key, value in scores.items() if key != 'units'}}

    def above(hits, follow):
        out = []
        for uid in hits:
            out += [later for later in follow.get(uid, []) if later not in out] + ([uid] if uid not in out else [])
        return out

    rows = []
    for qid, text, label, qv, lexical, dense, _ in ([] if args.long else asked):
        fused = rrf(lexical[:100], dense[:100])
        base = mmr(ranked(fused)[:100], fused, args.mmr_lambda)
        head = base[:50]
        pairs = {uid: mmarco.pair(text, pair_input(uid, True)) for uid in head}
        mixed = dict(zip(head, .3 * scaled([fused[u] for u in head]) + .7 * scaled([pairs[u] for u in head])))
        bases = {'A3': base, 'mmarco rich D=50 α=0.7': mmr(ranked(mixed), mixed, args.mmr_lambda) + base[50:]}
        grid = [(None, None, None, None)] + [(k, m, t, place) for k in (5, 10) for m in (1, 2) for t in (3, 5, 10)
                                             for place in ('ctx', 'above')]
        for name, hits in bases.items():
            for k, m, t, place in grid:
                follow = {uid: followups(uid, m, t) for uid in hits[:k]} if k else {}
                final = above(hits, follow) if place == 'above' else hits
                items, texts, used, extras = evidence(final, True, True, 8192, qv,
                                                      follow=follow if place == 'ctx' else None)
                scores = score_items(label, items, texts, used, extras)
                rows.append({'question': qid, 'kind': label['kind'], 'answerable': label['answerable'],
                             'control': bool(label.get('control')), 'base': name, 'k': k, 'm': m, 't': t,
                             'placement': place, 'followups': sum(map(len, follow.values())),
                             **{key: value for key, value in scores.items() if key != 'units'}})
    if args.long:
        def span_at(label, items, texts, n):
            quotes = [(span['unit'], span['quote']) for span in label.get('spans', [])]
            shown = {u: texts.get(u) or serialize(u) for item in items[:n] for u in item}
            return any(quote in shown.get(uid, '') for uid, quote in quotes)

        for qid, text, label, qv, lexical, dense, _ in asked:
            fused = rrf(lexical[:100], dense[:100])
            base = mmr(ranked(fused)[:100], fused, args.mmr_lambda)
            head = base[:50]
            arms = {'A3': (base, qv, {}), 'A3, no passages': (base, None, {})}
            for form, chars, cap in (('whole parent', None, None), ('parent 300 chars', 300, None),
                                     ('parent 300 chars', 300, 256), ('parent 300 chars', 300, 128)):
                before = mmarco.clipped
                pairs = {uid: mmarco.pair(text, pair_input(uid, True, chars), cap) for uid in head}
                mixed = dict(zip(head, .3 * scaled([fused[u] for u in head]) + .7 * scaled([pairs[u] for u in head])))
                name = f"mmarco mix, {form}, {cap or 512} tokens"
                arms[name] = (mmr(ranked(mixed), mixed, args.mmr_lambda) + base[50:], qv,
                              {'cut_pairs': mmarco.clipped - before})
            core = arms['mmarco mix, parent 300 chars, 512 tokens'][0]
            follow = {uid: followups(uid, 2, 3) for uid in core[:5]}
            for name, (hits, trim, extra) in arms.items():
                items, texts, used, extras = evidence(hits, True, True, 8192, trim)
                rows.append(row_of_long(qid, label, name, items, texts, used, extras, extra, span_at))
            items, texts, used, extras = evidence(core, True, True, 8192, qv, follow=follow)
            rows.append(row_of_long(qid, label, 'mmarco mix, parent 300 chars, 512 tokens + follow-ups K=5 M=2 T=3 ctx '
                                    '(exploratory, not chosen)', items, texts, used, extras, {}, span_at))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({
        'purpose': ('Long-message measures' if args.long else 'Follow-ups of a hit')
                   + '; see PROTOCOL.md "Cancelled decisions and long messages"', 'split': args.split,
        'inputs': {str(path.relative_to(root)): sha(path) for path in corpus_paths + question_paths},
        'discovery_run': {'path': str(args.discovery), 'sha256': sha(args.discovery)},
        'worker_sha256': sha(Path(__file__)), 'settings': {'mmr_lambda': args.mmr_lambda, 'rrf_k': RRF_K,
                                                          'pool': 100, 'budget': 8192},
        'rows': rows}, ensure_ascii=False, indent=1) + '\n')
    print(json.dumps({'split': args.split, 'rows': len(rows)}))
    sys.exit()

variants = []
variant_models = [name for name in args.variants.split(',') if name and labels]
taus = [None] + [float(value) for value in args.taus.split(',') if value]
reranker_of = {name: mmarco if name == 'mmarco' else Encoder(name) for name in variant_models}
for qid, text, label, qv, lexical, dense, plain_mmarco in asked:
    fused = rrf(lexical[:100], dense[:100])
    base = mmr(ranked(fused)[:100], fused, args.mmr_lambda)
    orders = {('none', '-', 0, 0): base}
    for name in variant_models:
        for rich in (False, True):
            t = time.perf_counter()
            pairs = {uid: plain_mmarco[uid] if name == 'mmarco' and not rich and uid in plain_mmarco
                     else reranker_of[name].pair(text, pair_input(uid, rich)) for uid in base}
            times[f'variant_{name}_{"rich" if rich else "plain"}_ms'].append((time.perf_counter() - t) * 1000)
            for depth in (20, 50, 100):
                head = base[:depth]
                fused_part, pair_part = scaled([fused[u] for u in head]), scaled([pairs[u] for u in head])
                for alpha in (.3, .5, .7, 1):
                    mixed = dict(zip(head, (1 - alpha) * fused_part + alpha * pair_part))
                    orders[(name, 'rich' if rich else 'plain', depth, alpha)] = (
                        mmr(ranked(mixed), mixed, args.mmr_lambda) + base[depth:])
    for (name, form, depth, alpha), hits in orders.items():
        for tau in taus:
            final = newest_first(hits, tau) if tau else hits
            items, texts, used, extras = evidence(final, True, True, 8192, qv)
            scores = score_items(label, items, texts, used, extras)
            variants.append({'question': qid, 'reranker': name, 'input': form, 'depth': depth, 'alpha': alpha,
                             'tau': tau, **{key: value for key, value in scores.items() if key != 'units'}})

fixed, fixed_models = [], [name for name in args.fixed_models.split(',') if name and labels]
pair_models = {'mmarco': mmarco, **{name: Encoder(name) for name in fixed_models if name != 'mmarco'}}
fixed_times = defaultdict(list)
for label in labels:
    qid, text = label['id'], label['text']
    graded = sorted(label['grades'])
    all_bm25 = ranked(bm25(text, order))
    qv = e5.embed('query: ' + text)
    all_dense = [order[i] for i in np.argsort(-(matrix @ qv), kind='stable')]
    for pool in POOLS:
        candidates = list(dict.fromkeys(graded))
        for a, b in zip(all_bm25, all_dense):
            for uid in (a, b):
                if len(candidates) < pool and uid not in candidates:
                    candidates.append(uid)
        lexical_scores = bm25(text, candidates)
        dense_scores = {uid: float(matrix[row_of[uid]] @ qv) for uid in candidates}
        rankings = {'bm25': ranked(lexical_scores), 'e5': ranked(dense_scores)}
        rankings['rrf'] = ranked(rrf(rankings['bm25'], rankings['e5']))
        for name in fixed_models:
            t = time.perf_counter()
            scores = {uid: pair_models[name].pair(text, text_of[uid]) for uid in candidates}
            fixed_times[f'{name}_{pool}_ms'].append((time.perf_counter() - t) * 1000)
            rankings[name] = ranked(scores)
        for name, ranking in rankings.items():
            items = [[uid] for uid in ranking]
            row = score_items(label, items, {}, 0, {})
            fixed.append({'question': qid, 'ranker': name, 'pool': pool, 'candidates': len(candidates),
                          **{k: v for k, v in row.items() if k not in ('units', 'bytes', 'tokens')}})


def summary(values):
    values = sorted(values)
    return {'median': statistics.median(values), 'p95': values[min(len(values) - 1, int(.95 * len(values)))],
            'n': len(values)} if values else None


result = {
    'purpose': 'Synthetic evidence-selection benchmark; see PROTOCOL.md',
    'split': args.split,
    'inputs': {str(path.relative_to(root)): sha(path) for path in corpus_paths + question_paths},
    'discovery_run': {'path': str(args.discovery), 'sha256': sha(args.discovery)} if args.discovery else 'stdin',
    'worker_sha256': sha(Path(__file__)), 'catalog_sha256': sha(root / 'models.json'),
    'python': platform.python_version(), 'platform': platform.platform(),
    'versions': {name: importlib.metadata.version(name)
                 for name in ['numpy', 'onnxruntime', 'tokenizers', 'snowballstemmer']},
    'settings': {'pools': POOLS, 'budgets': BUDGETS, 'mmr_lambda': args.mmr_lambda, 'rrf_k': RRF_K,
                 'threads': args.threads, 'batch_size': 1},
    'units': len(units), 'questions': len(questions), 'stage_ms': dict(stage),
    'times': {key: summary(values) for key, values in {**times, **fixed_times}.items()},
    'clipped_pairs': {name: encoder.clipped for name, encoder in {'e5-small': e5, **pair_models}.items()},
    'memory': memory(), 'end_to_end': end_to_end, 'fixed': fixed, 'variants': variants,
}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(result, ensure_ascii=False, indent=1) + '\n')
print(json.dumps({key: result[key] for key in ('split', 'units', 'questions', 'stage_ms', 'memory')}))
