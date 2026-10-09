"""Validate frozen weights and dev-only abstention on unseen synthetic failure cases."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
import numpy as np
from features import compute_features

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input',required=True,type=Path)
parser.add_argument('--small-cache',required=True,type=Path)
parser.add_argument('--current-cache',required=True,type=Path)
parser.add_argument('--output',required=True,type=Path)
parser.add_argument('--equivalence-only',action='store_true')
args=parser.parse_args()
area=Path(__file__).resolve().parent
matrix=area.parent/'matrix'
args.output.mkdir(parents=True,exist_ok=True)

def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

weights=json.loads((matrix/'results/pairwise.json').read_text())
coef=np.array(weights['coef'])/np.array(weights['scale'])
mean=np.array(weights['mean'])
intercept=weights['intercept']
raw=json.loads(args.input.read_text())
assert not any('intent' in row for row in raw['rows'])
frozen=dict(inputSha256=sha(args.input),modelSha256=sha(matrix/'results/pairwise.json'),
            runnerSha256=sha(Path(__file__)),featuresSha256=sha(area/'features.py'),
            fixtureSha256=sha(area/'fixture.json'),workerSha256=sha(matrix/'neural.py'),
            configs=['raw','reply-context'],rankers=['retrieval','bm25','frozen-feature','frozen-no-role-cues','tinybert','current-native'],
            policy='No weight fitting or holdout selection. Floors use calibration queries only. Context adds only eligible direct replies and parents. Scope controls remain strict.')
(args.output/'frozen-inputs.json').write_text(json.dumps(frozen,indent=2)+'\n')

if args.equivalence_only:
    f,_,_=compute_features(raw)
    original=json.loads((matrix/'results/report.json').read_text())['rankers']['pairwise-features']['rows']
    expected={row['id']:row['ids'] for row in original}
    for row in raw['rows']:
        scores=(f[row['id']]-mean)@coef+intercept
        order=np.argsort(-scores,kind='stable') if row['rerankable'] else np.arange(len(scores))
        ids=[row['candidates'][i]['id'] for i in order[:10]]
        assert ids==expected[row['id']],row['id']
    print(f'Feature extraction and exported weights reproduce all {len(raw["rows"])} historical rankings.')
    sys.exit(0)

messages={m['id']:m for m in raw['messages']}
assert len(messages)==len(raw['messages'])
for row in raw['rows']:
    assert set(c['id'] for c in row['candidates'])<=set(row['hardEligibleIds'])
    assert all(mid in messages for mid in row['relevant'])
children={}
for m in messages.values():
    if m.get('replyToId'):
        assert m['replyToId'] in messages
        assert messages[m['replyToId']]['chatId']==m['chatId']
        children.setdefault(m['replyToId'],[]).append(m['id'])

reports={}
for mode in ['raw','reply-context']:
    data=copy.deepcopy(raw)
    if mode=='reply-context':
        for row in data['rows']:
            if not row['rerankable'] or row['group']=='scope-control':continue
            eligible=set(row['hardEligibleIds'])
            found={c['id'] for c in row['candidates']}
            additions=[]
            for candidate in row['candidates']:
                for mid in children.get(candidate['id'],[]):
                    if mid in eligible and mid not in found:
                        additions.append(dict(id=mid,score=0,match='context'))
                        found.add(mid)
            assert len(additions)<=100,'bounded context expansion'
            row['candidates']=(row['candidates']+additions)[:300]
            assert set(c['id'] for c in row['candidates'])<=eligible
        used={c['id'] for row in data['rows'] for c in row['candidates']}
        for m in data['messages']:
            parent=m.get('replyToId')
            if parent and m['id'] in used:
                for row in data['rows']:
                    if any(c['id']==m['id'] for c in row['candidates']):
                        assert parent in row['hardEligibleIds'],'parent context is also eligible'
                m['text']=messages[parent]['text']+'\nReply: '+m['text']
                m['stems']=messages[parent]['stems']+m['stems']
    path=args.output/f'{mode}-candidates.json'
    path.write_text(json.dumps(data,indent=2)+'\n')
    feature_rows,feature_ms,lexical_ms=compute_features(data)
    scores={name:{} for name in ['retrieval','bm25','frozen-feature','frozen-no-role-cues']}
    elapsed={name:{} for name in scores}
    no_role=coef.copy();no_role[13:17]=0
    for row in data['rows']:
        mid=row['id'];f=feature_rows[mid]
        scores['retrieval'][mid]=np.arange(len(f),0,-1,dtype=float)
        scores['bm25'][mid]=f[:,0]
        scores['frozen-feature'][mid]=(f-mean)@coef+intercept
        scores['frozen-no-role-cues'][mid]=(f-mean)@no_role+intercept
        elapsed['retrieval'][mid]=0
        elapsed['bm25'][mid]=lexical_ms[mid]['bm25']
        elapsed['frozen-feature'][mid]=elapsed['frozen-no-role-cues'][mid]=feature_ms[mid]
    resources={}
    for name,cache,manifest in [('tinybert',args.small_cache,matrix/'models/tinybert.json'),
                                ('current-native',args.current_cache,area.parent/'message-search/reranker.json')]:
        target=args.output/f'{mode}-{name}-scores.json'
        command=[sys.executable,str(matrix/'neural.py'),'--input',str(path),'--cache',str(cache),
                 '--manifest',str(manifest),'--output',str(target)]
        if target.exists():
            previous=json.loads(target.read_text())
            assert previous['inputSha256']==sha(path) and previous['workerSha256']==sha(matrix/'neural.py')
            assert previous['model']==json.loads(manifest.read_text())
        else:subprocess.run(command,check=True)
        result=json.loads(target.read_text());resources[name]={k:v for k,v in result.items() if k!='rows'}
        by_id={r['id']:r for r in result['rows']}
        scores[name]={};elapsed[name]={}
        for row in data['rows']:
            r=by_id.get(row['id']);ids=[c['id'] for c in row['candidates']]
            if r:
                assert r['ids']==ids
                scores[name][row['id']]=np.array(r['scores']);elapsed[name][row['id']]=r['elapsedMs']
            else:scores[name][row['id']]=np.zeros(len(ids));elapsed[name][row['id']]=0
    results={}
    for name,values in scores.items():
        rankings=[]
        for row in data['rows']:
            ids=[c['id'] for c in row['candidates']]
            v=values[row['id']];assert len(v)==len(ids) and np.isfinite(v).all()
            order=np.argsort(-v,kind='stable') if row['rerankable'] else np.arange(len(ids))
            selected=[ids[i] for i in order]
            best=float(v[order[0]]) if len(order) else None
            rankings.append(dict(id=row['id'],split=row['split'],group=row['group'],topic=row['topic'],language=row['language'],
                                 category=row['category'],answerExpected=row['answerExpected'],relevant=row['relevant'],ids=selected[:10],
                                 candidateIds=ids,topScore=best,scoringMs=elapsed[name][row['id']],
                                 originalCandidateIds=[c['id'] for c in next(q for q in raw['rows'] if q['id']==row['id'])['candidates']]))
        floors={}
        for group in ['keyword','question-diagnostic']:
            dev=[r['topScore'] for r in rankings if r['split']=='calibration' and r['group']==group and not r['answerExpected'] and r['topScore'] is not None]
            floors[group]=max(dev)+1e-9 if dev else None
        for r in rankings:
            floor=floors.get(r['group'])
            r['predictsAnswer']=r['topScore'] is not None and (floor is None or r['topScore']>floor)
        results[name]=dict(calibrationFloors=floors,rows=rankings)
    reports[mode]=dict(rankers=results,resources=resources)


def aggregate(rows):
    answer=[r for r in rows if r['answerExpected']]
    missing=[r for r in rows if not r['answerExpected']]
    evidence=[r for r in rows if r['relevant']]
    def mean(vals):return float(np.mean(vals)) if vals else None
    def gain(ids,relevant):return sum((2**relevant.get(mid,0)-1)/np.log2(i+2) for i,mid in enumerate(ids[:10]))
    measured=[r['scoringMs'] for r in rows if r['candidateIds']]
    return dict(queries=len(rows),answerable=len(answer),unanswerable=len(missing),
        **{f'answerSuccessAt{k}':mean([float(any(r['relevant'].get(mid)==2 for mid in r['ids'][:k])) for r in answer]) for k in [1,3,10]},
        answerCandidateSuccess=mean([float(any(r['relevant'].get(mid)==2 for mid in r['candidateIds'])) for r in answer]),
        evidenceRecallAt10=mean([sum(mid in r['relevant'] for mid in r['ids'])/len(r['relevant']) for r in evidence]),
        ndcgAt10=mean([gain(r['ids'],r['relevant'])/sum((2**g-1)/np.log2(i+2) for i,g in enumerate(sorted(r['relevant'].values(),reverse=True)[:10])) for r in evidence]),
        rawMissingFactFalseHits=sum(len(r['ids']) for r in missing if not r['relevant']),
        calibrationAnswerRecall=mean([float(r['predictsAnswer']) for r in answer]),
        calibrationFalseAnswerRate=mean([float(r['predictsAnswer']) for r in missing]),
        calibratedActualAnswerAt1=mean([float(r['predictsAnswer'] and bool(r['ids']) and r['relevant'].get(r['ids'][0])==2) for r in answer]),
        p95ScoringMs=float(np.percentile(measured,95)) if measured else None)

for mode,report in reports.items():
    for name,result in report['rankers'].items():
        result['summary']={}
        for split in ['calibration','holdout']:
            result['summary'][split]={}
            for group in ['keyword','question-diagnostic','scope-control']:
                selected=[r for r in result['rows'] if r['split']==split and r['group']==group]
                result['summary'][split][group]=dict(all=aggregate(selected),
                    en=aggregate([r for r in selected if r['language']=='en']),ru=aggregate([r for r in selected if r['language']=='ru']),
                    categories={case:aggregate([r for r in selected if r['category']==case]) for case in sorted({r['category'] for r in selected})})
report=dict(schemaVersion=1,frozenInputs=frozen,modes=reports,
            notes='AnswerExpected is separate from useful evidence: unresolved conflicting documents are grade 1, not a direct answer. Floors classify answer availability; they do not hide useful context or alter raw rankings.')
(args.output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
for mode,data in reports.items():
    print(mode,{name:r['summary']['holdout']['question-diagnostic']['all'] for name,r in data['rankers'].items()})
