"""Convert retained synthetic candidate pools to label-free text-pair inputs."""
import argparse
import hashlib
import json
from pathlib import Path
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
area = Path(__file__).resolve().parents[1]
selected = [('original', 'fixture.json', 'fixed-original.json'), ('fresh', 'fresh.json', 'fixed-fresh.json'), ('frozen', 'ranking-frozen.json', 'fixed-frozen.json')]
args.output.mkdir(parents=True, exist_ok=True)
provenance = []
for context in [False, True]:
    messages = []
    rows = []
    for dataset, fixture_name, report_name in selected:
        fixture_path = area / 'model-free' / fixture_name
        report_path = area / 'model-free/results/ranking-2026-10-11' / report_name
        fixture = json.loads(fixture_path.read_text())
        report = json.loads(report_path.read_text())
        digest = hashlib.sha256(fixture_path.read_bytes()).hexdigest()
        assert report['fixtureSha256'] == digest
        docs = {m['id']: m for m in fixture['messages']}
        assert len(docs) == len(fixture['messages'])
        provenance.append(dict(dataset=dataset, fixtureSha256=digest, reportSha256=hashlib.sha256(report_path.read_bytes()).hexdigest()))
        for row in report['rows']:
            if row['mode'] != 'discover':
                continue
            pool = row['candidateIds']
            assert len(pool) == len(set(pool)) and len(pool) <= 300
            query_id = f"{dataset}/{row['id']}"
            candidates = []
            for mid in pool:
                m = docs[mid]
                parent = docs.get(m.get('replyToId')) if context and m.get('replyToId') in pool else None
                if parent:
                    assert parent['chatId'] == m['chatId']
                key = f'{query_id}/{mid}'
                text = (parent['text'] + '\n' if parent else '') + m['text']
                messages.append(dict(id=key, text=text))
                candidates.append(dict(id=key))
            rows.append(dict(id=query_id, text=row['input'], rerankable=True, candidates=candidates))
        assert set(docs).issuperset((mid for r in report['rows'] if r['mode'] == 'discover' for mid in r['candidateIds']))
    name = 'context' if context else 'body'
    (args.output / (name + '.json')).write_text(json.dumps(dict(messages=messages, rows=rows), ensure_ascii=False) + '\n')
    (args.output / (name + '-top100.json')).write_text(json.dumps({r['id']: [c['id'] for c in r['candidates'][:100]] for r in rows}) + '\n')
(args.output / 'provenance.json').write_text(json.dumps(dict(sourceHashes=provenance[:len(selected)], exporterSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), protocol='Frozen pretrained models; body/context; batch1/16; full300/top100; no relevance labels in inference inputs.'), indent=2) + '\n')
print(f'{len(rows)} questions exported to {args.output}')
