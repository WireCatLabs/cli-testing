"""Export label-free pairs and evaluate a fixed twelve-result evidence supplement."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parent
EXPECTED_FIXTURE = 'c4649d96e8b7273cb7dbe8651791c7b5f85cdca4d5b177860117206960ffefc4'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')


def deliver(ids, docs, budget):
    records = []
    kept = []
    for mid in ids[:12]:
        record = dict(id=mid, text=docs[mid]['text'])
        if budget is not None and len(encoded(records + [record])) > budget:
            break
        records.append(record)
        kept.append(mid)
    return kept, len(encoded(records))


def supplement_order(pool, neural, language, stable=False):
    if language != 'en':
        return pool[:12]
    additions = [mid for mid in neural if mid not in pool[:10]][:2]
    if stable:
        additions.sort(key=pool.index)
    return pool[:10] + additions


def metrics(ids, q):
    relevant = q['relevant']
    answers = {mid for mid, grade in relevant.items() if grade == 2}
    dcg = lambda grades: sum((2 ** grade - 1) / math.log2(i + 2) for i, grade in enumerate(grades[:12]))
    ideal = dcg(sorted(relevant.values(), reverse=True))
    return dict(answer=float(bool(answers.intersection(ids))) if answers else None,
                evidenceRecall=len(set(ids).intersection(relevant)) / len(relevant) if relevant else None,
                ndcg=dcg([relevant.get(mid, 0) for mid in ids]) / ideal if ideal else None,
                partialHits=len(ids) if not answers else 0)


def aggregate(rows, key):
    values = [r[key] for r in rows if r[key] is not None]
    return statistics.mean(values) if values else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['export', 'evaluate'])
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--scores', type=Path)
    parser.add_argument('--stable', action='store_true', help='preserve baseline order among the two model selections')
    parser.add_argument('--fixture', choices=['fixture', 'boundary'], default='fixture')
    parser.add_argument('--tokenizer', type=Path)
    parser.add_argument('--max-tokens', type=int, default=512)
    args = parser.parse_args()
    fixture_path = ROOT / (args.fixture + '.json')
    expected = EXPECTED_FIXTURE if args.fixture == 'fixture' else 'ce1170132d7d6295f2f940953eef68f5872b1985bcfddafe45cf522ef28a113b'
    assert digest(fixture_path) == expected
    fixture = json.loads(fixture_path.read_text())
    baseline = json.loads(args.baseline.read_text())
    assert baseline['fixtureSha256'] == expected
    docs = {m['id']: m for m in fixture['messages']}
    queries = {q['id']: q for q in fixture['queries']}
    rows = [r for r in baseline['rows'] if r['mode'] == 'discover']
    assert len(rows) == len(queries) == (24 if args.fixture == 'fixture' else 5)
    assert all(len(r['candidateIds']) == len(set(r['candidateIds'])) <= 300 for r in rows)
    if args.action == 'export':
        assert args.tokenizer is not None
        from tokenizers import Tokenizer
        tokenizer = Tokenizer.from_file(str(args.tokenizer))
        tokenizer.no_truncation()
        tokenizer.no_padding()
        messages, inputs, shortlists, skipped = [], [], {}, {}
        for row in rows:
            pool = row['candidateIds']
            candidates = []
            for mid in pool:
                message = docs[mid]
                parent = docs.get(message.get('replyToId')) if message.get('replyToId') in pool else None
                if parent:
                    assert parent['chatId'] == message['chatId']
                key = row['id'] + '/' + mid
                messages.append(dict(id=key, text=(parent['text'] + '\n' if parent else '') + message['text']))
                candidates.append(dict(id=key))
            inputs.append(dict(id=row['id'], text=row['input'], rerankable=True, candidates=candidates))
            lengths = tokenizer.encode_batch([(row['input'], m['text']) for m in messages[-len(pool):]][:100])
            shortlists[row['id']] = [c['id'] for c, tokens in zip(candidates[:100], lengths) if len(tokens.ids) <= args.max_tokens]
            skipped[row['id']] = [c['id'] for c, tokens in zip(candidates[:100], lengths) if len(tokens.ids) > args.max_tokens]
            assert shortlists[row['id']], 'no eligible pairs; baseline-only routing required'
        args.output.mkdir(parents=True, exist_ok=True)
        (args.output / 'context.json').write_text(json.dumps(dict(messages=messages, rows=inputs), ensure_ascii=False) + '\n')
        (args.output / 'overlength.json').write_text(json.dumps(dict(maxTokens=args.max_tokens, tokenizerFile=str(args.tokenizer.name), checksumSha256=digest(args.tokenizer), excluded=skipped), indent=2) + '\n')
        (args.output / 'context-top100.json').write_text(json.dumps(shortlists) + '\n')
        print(f'{len(inputs)} label-free questions exported')
        return
    assert args.scores is not None
    worker = json.loads(args.scores.read_text())
    scores = {r['id']: r for r in worker['rows']}
    assert set(scores) == set(queries)
    traces, regressions, summary = [], [], []
    for budget in ([None, 4096, 8192, 16384] if args.fixture == 'fixture' else [None, 512, 1024, 4096]):
        budget_rows = []
        for row in rows:
            q = queries[row['id']]
            pool = row['candidateIds']
            score = scores[row['id']]
            assert all(math.isfinite(s) for s in score['scores'])
            mids = [mid.removeprefix(row['id'] + '/') for mid in score['ids']]
            assert len(mids) == len(set(mids)) and set(mids) <= set(pool)
            neural = [mids[i] for i in sorted(range(len(mids)), key=lambda i: (-score['scores'][i], i))]
            supplement = supplement_order(pool, neural, q['language'], args.stable)
            base_ids, base_bytes = deliver(pool, docs, budget)
            new_ids, new_bytes = deliver(supplement, docs, budget)
            base, new = metrics(base_ids, q), metrics(new_ids, q)
            lost = sorted(set(base_ids).intersection(q['relevant']) - set(new_ids))
            losses = [key for key in ['answer', 'evidenceRecall', 'ndcg'] if base[key] is not None and new[key] < base[key] - 1e-12]
            trace = dict(id=q['id'], language=q['language'], category=q['category'], budget=budget,
                         baselineIds=base_ids, supplementIds=new_ids, baselineBytes=base_bytes,
                         supplementBytes=new_bytes, baseline=base, supplement=new,
                         baselineEvidenceAt11Or12=[mid for mid in pool[10:12] if mid in q['relevant']],
                         lostEvidence=lost, losses=losses)
            traces.append(trace)
            budget_rows.append(trace)
            if losses or lost:
                regressions.append(dict(id=q['id'], budget=budget, losses=losses, lostEvidence=lost))
        for language in ['all', 'en', 'ru']:
            selected = [r for r in budget_rows if language == 'all' or r['language'] == language]
            if not selected:
                continue
            result = dict(budget=budget, language=language, queries=len(selected))
            for policy in ['baseline', 'supplement']:
                result[policy] = {key: aggregate([r[policy] for r in selected], key) for key in ['answer', 'evidenceRecall', 'ndcg']}
                result[policy]['partialHits'] = sum(r[policy]['partialHits'] for r in selected)
                result[policy]['meanDelivered'] = statistics.mean(len(r[policy + 'Ids']) for r in selected)
                result[policy]['meanBytes'] = statistics.mean(r[policy + 'Bytes'] for r in selected)
            summary.append(result)
    report = dict(selectionOrder='baseline' if args.stable else 'neural', fixtureSha256=expected, baselineSha256=digest(args.baseline), scoresSha256=digest(args.scores),
                  evaluatorSha256=digest(Path(__file__)), workerSha256=worker['workerSha256'], inputSha256=worker['inputSha256'],
                  model=worker['model'], loadMs=worker['loadMs'], peakWorkerBytes=worker['maxResidentBytes'],
                  scoringP50Ms=statistics.median(r['elapsedMs'] for r in worker['rows'] if queries[r['id']]['language'] == 'en'),
                  scoringP95Ms=sorted(r['elapsedMs'] for r in worker['rows'] if queries[r['id']]['language'] == 'en')[math.ceil(sum(queries[r['id']]['language'] == 'en' for r in worker['rows']) * 0.95) - 1],
                  passesMeasuredGates=not regressions, readyForIntegration=False, regressions=regressions, summary=summary, rows=traces)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(passes=not regressions, regressions=len(regressions), summary=summary), indent=2))


if __name__ == '__main__':
    main()
