"""Compare the stable supplement on three exposed controls using retained scores."""
import argparse
import hashlib
import json
from pathlib import Path
from validate import aggregate, deliver, metrics, supplement_order

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--scores', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
area = Path(__file__).resolve().parents[1]
worker = json.loads(args.scores.read_text())
scores = {row['id']: row for row in worker['rows']}
summary, traces, regressions, provenance = [], [], [], {}
for dataset, filename, reportname in [('original', 'fixture.json', 'fixed-original.json'), ('fresh', 'fresh.json', 'fixed-fresh.json'), ('frozen', 'ranking-frozen.json', 'fixed-frozen.json')]:
    fixture_path = area / 'model-free' / filename
    report_path = area / 'model-free/results/ranking-2026-10-11' / reportname
    fixture = json.loads(fixture_path.read_text())
    baseline = json.loads(report_path.read_text())
    sha = hashlib.sha256(fixture_path.read_bytes()).hexdigest()
    assert baseline['fixtureSha256'] == sha
    provenance[dataset] = dict(fixtureSha256=sha, baselineSha256=hashlib.sha256(report_path.read_bytes()).hexdigest())
    docs = {m['id']: m for m in fixture['messages']}
    queries = {q['id']: q for q in fixture['queries']}
    for budget in [None, 512, 1024, 4096, 8192, 16384]:
        rows = []
        for base in baseline['rows']:
            if base['mode'] != 'discover':
                continue
            qid = dataset + '/' + base['id']
            q = queries[base['id']]
            score = scores[qid]
            pool = base['candidateIds']
            mids = [mid.removeprefix(qid + '/') for mid in score['ids']]
            assert set(mids) <= set(pool) and len(mids) == len(set(mids))
            neural = [mids[i] for i in sorted(range(len(mids)), key=lambda i: (-score['scores'][i], i))]
            new = supplement_order(pool, neural, q['language'], stable=True)
            base_ids, base_bytes = deliver(pool, docs, budget)
            new_ids, new_bytes = deliver(new, docs, budget)
            bm, nm = metrics(base_ids, q), metrics(new_ids, q)
            lost = sorted(set(base_ids).intersection(q['relevant']) - set(new_ids))
            losses = [key for key in ['answer', 'evidenceRecall', 'ndcg'] if bm[key] is not None and nm[key] < bm[key] - 1e-12]
            row = dict(id=qid, budget=budget, baseline=bm, supplement=nm, baselineIds=base_ids,
                       supplementIds=new_ids, baselineBytes=base_bytes, supplementBytes=new_bytes,
                       lostEvidence=lost, losses=losses)
            rows.append(row)
            traces.append(row)
            if losses or lost:
                regressions.append(dict(id=qid, budget=budget, lostEvidence=lost, losses=losses))
        summary.append(dict(dataset=dataset, budget=budget, queries=len(rows), baseline={k: aggregate([r['baseline'] for r in rows], k) for k in ['answer', 'evidenceRecall', 'ndcg']}, supplement={k: aggregate([r['supplement'] for r in rows], k) for k in ['answer', 'evidenceRecall', 'ndcg']}))
report = dict(provenance=provenance, scoresSha256=hashlib.sha256(args.scores.read_bytes()).hexdigest(), workerSha256=worker['workerSha256'], evaluatorSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), mergeSha256=hashlib.sha256(Path(__file__).with_name('validate.py').read_bytes()).hexdigest(), passesRegressionGates=not regressions, regressions=regressions, summary=summary, rows=traces)
args.output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(dict(regressions=regressions, summary=summary), indent=2))
