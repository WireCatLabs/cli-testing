"""Compare fixed, lightweight rankers on frozen production candidate pools."""
import argparse
from collections import Counter
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import re
import resource
import subprocess
import sys
import time
import unicodedata

os.environ['TOKENIZERS_PARALLELISM'] = 'false'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['OPENBLAS_NUM_THREADS'] = '1'
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from lightgbm import LGBMRanker
from nltk.stem.snowball import SnowballStemmer
from metrics import query_metrics, aggregate

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, required=True)
parser.add_argument('--models', type=Path, required=True)
parser.add_argument('--current-model', type=Path, required=True)
parser.add_argument('--embedding-cache', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
area = Path(__file__).resolve().parent

def sha(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()

versions = {name: importlib.metadata.version(name) for name in ['numpy','scikit-learn','lightgbm','onnxruntime','tokenizers','nltk']}
frozen = dict(inputSha256=sha(args.input), runnerSha256=sha(Path(__file__)), neuralWorkerSha256=sha(area/'neural.py'), metricsSha256=sha(area/'metrics.py'),
              freshSha256=sha(area/'fresh.json'), versions=versions, python=sys.version,
              policy='Fixed configs; fit supervised rankers only on original dev; no fresh-label selection. Explicit syntax stays strict. No score-floor calibration in this matrix.',
              models={key: sha(args.models/key/'manifest.json') for key in ['tinybert','minilm-l6']})
(args.output/'frozen-inputs.json').write_text(json.dumps(frozen,indent=2)+'\n')
data = json.loads(args.input.read_text())
rows = data['rows']
assert not any('intent' in row for row in rows)
assert len({row['id'] for row in rows}) == len(rows)
messages = data['messages']
index = {m['id']: i for i,m in enumerate(messages)}
texts = [m['text'] for m in messages]
assert len(index) == len(messages)
for row in rows:
    ids = [c['id'] for c in row['candidates']]
    assert len(ids) <= 300 and len(set(ids)) == len(ids)
    assert all(mid in index for mid in ids)
    assert all(mid in index and grade in [1,2] for mid,grade in row['relevant'].items())

stem_en, stem_ru = SnowballStemmer('english'), SnowballStemmer('russian')
def tokens(text):
    folded = ''.join(c for c in unicodedata.normalize('NFKD', text.lower()) if not unicodedata.combining(c))
    return re.findall(r'[^\W_]+',folded, flags=re.UNICODE)

def stem(word):
    return (stem_ru if re.search('[а-яё]',word) else stem_en).stem(word)

raw_tokens = [tokens(t) for t in texts]
raw_counts = [Counter(t) for t in raw_tokens]
stem_counts = [Counter(m['stems']) for m in messages]
vocabulary = set(word for counts in raw_counts for word in counts)

def idf_for(counts):
    df = Counter(word for c in counts for word in c)
    return {word: math.log(1+(len(counts)-count+.5)/(count+.5)) for word,count in df.items()}

raw_idf, stem_idf = idf_for(raw_counts), idf_for(stem_counts)
raw_average = np.mean([sum(c.values()) for c in raw_counts])
stem_average = np.mean([sum(c.values()) for c in stem_counts])
prep_start = time.perf_counter()
word_vectorizer = TfidfVectorizer(tokenizer=tokens, token_pattern=None, lowercase=False)
word_vectors = word_vectorizer.fit_transform(texts)
char_vectorizer = TfidfVectorizer(analyzer='char_wb', ngram_range=(3,5), max_features=30000)
char_vectors = char_vectorizer.fit_transform(texts)
vector_index_ms = (time.perf_counter()-prep_start)*1000

positive_role = {}
for row in rows:
    if row['split']=='dev' and row['group']=='keyword':
        for mid, grade in row['relevant'].items():
            positive_role[mid] = max(positive_role.get(mid,0),grade)
dev_message_ids = sorted({c['id'] for row in rows if row['split']=='dev' and row['group']=='keyword' for c in row['candidates']})
assert all(messages[index[mid]]['chatId'] not in ['201','202','203','204','205','206'] for mid in dev_message_ids)
role_texts = [messages[index[mid]]['text'] for mid in dev_message_ids]
role_labels = [positive_role.get(mid,0) for mid in dev_message_ids]
assert set(role_labels)=={0,1,2}
role_nb = make_pipeline(CountVectorizer(ngram_range=(1,2), max_features=12000), MultinomialNB(class_prior=[1/3]*3))
role_logistic = make_pipeline(TfidfVectorizer(analyzer='char_wb', ngram_range=(3,5),max_features=12000),
                              LogisticRegression(C=1, class_weight='balanced',max_iter=500,random_state=0))
role_start = time.perf_counter()
role_nb.fit(role_texts,role_labels)
role_logistic.fit(role_texts,role_labels)
role_training_ms = (time.perf_counter()-role_start)*1000

feature_names = ['bm25','stemBm25','tfidf','charTfidf','coverage','fuzzyCoverage','phrase','proximity',
                 'inverseLength','wordsSource','prefixSource','correctedSource','retrievalRank',
                 'negativeCue','proposalCue','decisionCue','supportCue','queryOwner','queryQuestion']

def edit_distance(a,b):
    previous = list(range(len(b)+1))
    for i,ca in enumerate(a,1):
        current = [i]
        for j,cb in enumerate(b,1):
            current.append(min(current[-1]+1,previous[j]+1,previous[j-1]+(ca!=cb)))
        previous=current
    return previous[-1]

def bm25(counts, terms, stats, average):
    length=sum(counts.values())
    return sum(stats.get(t,0)*counts[t]*2.2/(counts[t]+1.2*(.25+.75*length/average)) for t in terms if counts[t])

def normalise(a):
    a=np.asarray(a,dtype=float)
    return a/max(float(np.max(a)),1e-12) if len(a) else a

feature_rows, feature_times, lexical_times = {}, {}, {}
rule_scores, nb_scores, log_scores = {}, {}, {}
for number,row in enumerate(rows):
    start=time.perf_counter()
    ids=[c['id'] for c in row['candidates']]
    if not ids:
        feature_rows[row['id']]=np.zeros((0,len(feature_names)))
        feature_times[row['id']]=0
        lexical_times[row['id']]={name:0 for name in ['bm25','stem-bm25','word-tfidf','character-tfidf']}
        rule_scores[row['id']]=nb_scores[row['id']]=log_scores[row['id']]=np.zeros(0)
        continue
    positions=[index[mid] for mid in ids]
    query_terms=tokens(row['text']) if row['group']=='question-diagnostic' else tokens(' '.join(row['terms']))
    fixes={c['from']: c['to'] for c in row.get('corrections',[])}
    query_terms=[fixes.get(term,[term])[0] for term in query_terms]
    qtext=' '.join(query_terms)
    if row['group']=='keyword' and not fixes:
        stem_terms=row['stemTerms']
    else:
        stem_terms=[stem(term) for term in query_terms]
    lexical_start=time.perf_counter()
    raw=np.array([bm25(raw_counts[p],query_terms,raw_idf,raw_average) for p in positions])
    raw_ms=(time.perf_counter()-lexical_start)*1000
    lexical_start=time.perf_counter()
    st=np.array([bm25(stem_counts[p],stem_terms,stem_idf,stem_average) for p in positions])
    stem_ms=(time.perf_counter()-lexical_start)*1000
    lexical_start=time.perf_counter()
    tf=(word_vectors[positions] @ word_vectorizer.transform([qtext]).T).toarray().reshape(-1)
    tf_ms=(time.perf_counter()-lexical_start)*1000
    lexical_start=time.perf_counter()
    ch=(char_vectors[positions] @ char_vectorizer.transform([qtext]).T).toarray().reshape(-1)
    char_ms=(time.perf_counter()-lexical_start)*1000
    lexical_times[row['id']]={'bm25':raw_ms,'stem-bm25':stem_ms,'word-tfidf':tf_ms,'character-tfidf':char_ms}
    near={term:{word: (1 if word.startswith(term) else max(0,1-edit_distance(term,word)/max(len(term),len(word))))
                for word in vocabulary if word.isalpha()} for term in set(query_terms) if term.isalpha()}
    matrix=[]
    for lexical_rank,(candidate,p) in enumerate(zip(row['candidates'],positions)):
        words=raw_tokens[p]
        document=texts[p].lower()
        coverage=sum(any(word==term or word.startswith(term) for word in words) for term in query_terms)/max(len(query_terms),1)
        fuzzy=sum(max((near.get(term,{}).get(word,0) for word in words),default=0) for term in query_terms)/max(len(query_terms),1)
        matched=[i for i,word in enumerate(words) if any(word.startswith(term) for term in query_terms)]
        proximity=(len(matched)/(max(matched)-min(matched)+1)) if matched else 0
        negative=float(bool(re.search(r'\b(no|not|rejected|cancelled|unknown)\b|\b(нет|не|отмен|неизвест)',document)))
        proposal=float(bool(re.search(r'\?|\b(proposal|agenda|meeting|template|checklist)\b',document)))
        decision=float(bool(re.search(r'\b(decision|approved|agreed)\b|установлен',document)))
        support=float(bool(re.search(r'\b(owner|confirmation)\b|владелец|проверен',document)))
        matrix.append([raw[lexical_rank],st[lexical_rank],tf[lexical_rank],ch[lexical_rank],coverage,fuzzy,
                       float(qtext in ' '.join(words)),proximity,1/math.sqrt(max(len(words),1)),
                       float(candidate.get('match')=='words'),float(candidate.get('match')=='beginnings'),
                       float(candidate.get('match')=='corrected'),1/(lexical_rank+1),negative,proposal,decision,support,
                       float(bool(re.search(r'\b(owner|who|responsible)\b|кто|владел',row['text'].lower()))),
                       float(row['group']=='question-diagnostic')])
    features=np.asarray(matrix,dtype=float)
    features[:,0]=normalise(raw)
    features[:,1]=normalise(st)
    feature_rows[row['id']]=features
    feature_times[row['id']]=(time.perf_counter()-start)*1000
    rule_scores[row['id']]=features[:,0]+features[:,15]*2+features[:,16]*.5-features[:,13]*3-features[:,14]
    # Classifier text-vector inference is measured as query work, without caching the probabilities.
    start=time.perf_counter()
    pnb=role_nb.predict_proba([texts[p] for p in positions])
    nb_scores[row['id']]=features[:,0]+pnb[:,2]+.3*pnb[:,1]
    nb_ms=(time.perf_counter()-start)*1000
    start=time.perf_counter()
    plog=role_logistic.predict_proba([texts[p] for p in positions])
    log_scores[row['id']]=features[:,0]+plog[:,2]+.3*plog[:,1]
    row['_nbMs']=nb_ms
    row['_logMs']=(time.perf_counter()-start)*1000

train=[row for row in rows if row['split']=='dev' and row['rerankable'] and row['candidates']]
X=np.vstack([feature_rows[row['id']] for row in train])
y=np.concatenate([[row['relevant'].get(c['id'],0) for c in row['candidates']] for row in train])
groups=[len(row['candidates']) for row in train]
linear=make_pipeline(StandardScaler(),Ridge(alpha=10))
start=time.perf_counter();linear.fit(X,y);linear_ms=(time.perf_counter()-start)*1000
pair_x,pair_y=[],[]
for row in train:
    f=feature_rows[row['id']]
    grades=np.array([row['relevant'].get(c['id'],0) for c in row['candidates']])
    positive=np.flatnonzero(grades>0)
    negative=np.flatnonzero(grades==0)
    negative=negative[np.linspace(0,len(negative)-1,min(len(negative),32),dtype=int)] if len(negative) else negative
    for i in positive:
        for j in np.concatenate([negative,positive[grades[positive]<grades[i]]]):
            pair_x.extend([f[i]-f[j],f[j]-f[i]])
            pair_y.extend([1,0])
pairwise=make_pipeline(StandardScaler(with_mean=False),LogisticRegression(C=1,fit_intercept=False,max_iter=500,random_state=0))
start=time.perf_counter();pairwise.fit(np.array(pair_x),np.array(pair_y));pair_ms=(time.perf_counter()-start)*1000
lambdamart=LGBMRanker(objective='lambdarank',n_estimators=60,num_leaves=7,max_depth=3,min_child_samples=20,
                     learning_rate=.08,n_jobs=1,random_state=0,verbosity=-1,deterministic=True,force_col_wise=True)
start=time.perf_counter();lambdamart.fit(X,y,group=groups);lambda_ms=(time.perf_counter()-start)*1000
lambdamart.booster_.save_model(str(args.output/'lambdamart.txt'))
for name,model in [('linear',linear),('pairwise',pairwise)]:
    scaler, estimator=model.steps[0][1],model.steps[1][1]
    payload=dict(features=feature_names,scale=scaler.scale_.tolist(),
                 mean=scaler.mean_.tolist() if scaler.with_mean else [0]*len(feature_names),
                 coef=estimator.coef_.reshape(-1).tolist(),intercept=float(np.asarray(estimator.intercept_).reshape(-1)[0]))
    expected=model.predict(X) if name=='linear' else model.decision_function(X)
    actual=((X-np.array(payload['mean']))/np.array(payload['scale'])) @ np.array(payload['coef']) + payload['intercept']
    assert np.allclose(expected,actual,rtol=1e-10,atol=1e-10), 'exported scorer equivalence'
    (args.output/f'{name}.json').write_text(json.dumps(payload,indent=2)+'\n')

scores, times, metadata = {}, {}, {}
def add(name, category, values, elapsed=None, **extra):
    scores[name]=values
    times[name]=elapsed or {row['id']:feature_times[row['id']] for row in rows}
    metadata[name]=dict(category=category,**extra)

def column(i):
    return {row['id']:feature_rows[row['id']][:,i] for row in rows}

add('retrieval-order','baseline',{row['id']:np.arange(len(row['candidates']),0,-1) for row in rows},
    {row['id']:0 for row in rows})
add('bm25','lexical',column(0),{row['id']:lexical_times[row['id']]['bm25'] for row in rows})
add('stem-bm25','lexical',column(1),{row['id']:lexical_times[row['id']]['stem-bm25'] for row in rows})
add('word-tfidf','lexical',column(2),{row['id']:lexical_times[row['id']]['word-tfidf'] for row in rows})
add('character-tfidf','matching',column(3),{row['id']:lexical_times[row['id']]['character-tfidf'] for row in rows})
add('fuzzy-proximity','matching',{row['id']:(f:=feature_rows[row['id']])[:,5]+.3*f[:,7]+.2*f[:,6] for row in rows})
add('bucket-rules','matching',{row['id']:(f:=feature_rows[row['id']])[:,4]*10000+f[:,5]*100+f[:,7]*10+f[:,6] for row in rows},
    inspiration='Meilisearch-style priority ordering; not an implementation of Meilisearch')
for name,model,training in [('linear-features',linear,linear_ms),('pairwise-features',pairwise,pair_ms),('lambdamart',lambdamart,lambda_ms)]:
    values,elapsed={},{}
    for row in rows:
        start=time.perf_counter();f=feature_rows[row['id']]
        values[row['id']]=(model.decision_function(f) if name=='pairwise-features' else (model.booster_.predict(f) if name=='lambdamart' else model.predict(f))) if len(f) else np.zeros(0)
        elapsed[row['id']]=feature_times[row['id']]+(time.perf_counter()-start)*1000
    add(name,'learning-to-rank',values,elapsed,trainingMs=training,
        supervised='original dev only; dev metrics are training-set diagnostics')
add('role-rules','nlp',rule_scores)
add('role-naive-bayes','nlp',nb_scores,{row['id']:feature_times[row['id']]+row.get('_nbMs',0) for row in rows},trainingMs=role_training_ms)
add('role-logistic','nlp',log_scores,{row['id']:feature_times[row['id']]+row.get('_logMs',0) for row in rows},trainingMs=role_training_ms)

# A shortlist must use a label-free score and be frozen before neural scoring.
shortlist={row['id']:[row['candidates'][i]['id'] for i in np.argsort(-scores['bm25'][row['id']],kind='stable')[:40]] for row in rows}
shortlist_path=args.output/'bm25-shortlist-40.json'
shortlist_path.write_text(json.dumps(shortlist,indent=2)+'\n')

current_manifest=area.parent/'message-search/reranker.json'
embedding_manifest=args.output/'e5-manifest.json'
embedding_manifest.write_text(json.dumps(data['embeddingModel'],indent=2)+'\n')
worker_reports={}
worker_configs=[('tinybert',args.models/'tinybert',args.models/'tinybert/manifest.json',False,None),
                ('minilm-l6',args.models/'minilm-l6',args.models/'minilm-l6/manifest.json',False,None),
                ('current-native',args.current_model,current_manifest,False,None),
                ('tinybert-shortlist40',args.models/'tinybert',args.models/'tinybert/manifest.json',False,shortlist_path),
                ('e5',args.embedding_cache,embedding_manifest,True,None),
                ('tinybert-single',args.models/'tinybert',args.models/'tinybert/manifest.json',False,None),
                ('minilm-l6-single',args.models/'minilm-l6',args.models/'minilm-l6/manifest.json',False,None),
                ('current-native-single',args.current_model,current_manifest,False,None)]
for key,cache,manifest,embedding,shortlists in worker_configs:
    output=args.output/f'{key}-scores.json'
    command=[sys.executable,str(area/'neural.py'),'--input',str(args.input),'--cache',str(cache),
             '--manifest',str(manifest),'--output',str(output)]
    if key.endswith('-single'): command.extend(['--batch-size','1'])
    if embedding: command.append('--embedding')
    if shortlists: command.extend(['--shortlists',str(shortlists)])
    # Reuse a completed run only when every input, implementation and model pin still matches.
    if output.exists():
        existing=json.loads(output.read_text())
        assert existing['inputSha256']==sha(args.input) and existing['workerSha256']==sha(area/'neural.py')
        assert existing['model']==json.loads(manifest.read_text())
        print(f'Reusing verified worker {key}',file=sys.stderr,flush=True)
    else:
        print(f'Running isolated worker {key}',file=sys.stderr,flush=True)
        subprocess.run(command,check=True)
    report=json.loads(output.read_text());worker_reports[key]=report
    by_id={r['id']:r for r in report['rows']}
    values,elapsed={},{}
    for row in rows:
        full_ids=[c['id'] for c in row['candidates']]
        r=by_id.get(row['id'])
        if r:
            assert len(set(r['ids']))==len(r['ids']) and set(r['ids'])<=set(full_ids)
            by_mid=dict(zip(r['ids'],r['scores']))
            values[row['id']]=np.array([by_mid.get(mid,-1e9) for mid in full_ids])
            elapsed[row['id']]=r['elapsedMs']+(feature_times[row['id']] if shortlists else 0)
        else:
            values[row['id']]=np.zeros(len(full_ids));elapsed[row['id']]=0
    if embedding:
        add('e5-cosine','dense',values,elapsed,worker=key)
        hybrid={}
        blend={}
        for row in rows:
            mid=row['id'];n=len(row['candidates'])
            if n:
                lexical_rank=np.argsort(np.argsort(-scores['bm25'][mid],kind='stable'),kind='stable')+1
                dense_rank=np.argsort(np.argsort(-values[mid],kind='stable'),kind='stable')+1
                hybrid[mid]=1/(60+lexical_rank)+1/(60+dense_rank)
                blend[mid]=.5*scores['bm25'][mid]+.5*values[mid]
            else: hybrid[mid]=blend[mid]=np.zeros(0)
        hybrid_times={row['id']:elapsed[row['id']]+feature_times[row['id']] for row in rows}
        add('e5-lexical-rrf','dense',hybrid,hybrid_times,worker=key)
        add('e5-lexical-blend','dense',blend,hybrid_times,worker=key)
    else:
        add(key,'neural',values,elapsed,worker=key)
        if key=='tinybert':
            blended={}
            for row in rows:
                mid=row['id'];n=len(row['candidates'])
                rank=np.arange(1,n+1)
                weights=np.where(rank<=3,.75,np.where(rank<=10,.60,.40))
                sigmoid=1/(1+np.exp(-np.clip(values[mid],-30,30)))
                blended[mid]=weights/np.maximum(rank,1)+(1-weights)*sigmoid
            add('tinybert-position-blend','neural',blended,elapsed,worker=key,
                inspiration='QMD position-aware blending heuristic applied to sigmoid logits; not calibrated probability or QMD execution')


reports={}
for name,values in scores.items():
    results=[]
    for row in rows:
        candidates=[c['id'] for c in row['candidates']]
        if row['rerankable']:
            score=np.asarray(values[row['id']]);assert len(score)==len(candidates) and np.isfinite(score).all()
            start=time.perf_counter();order=np.argsort(-score,kind='stable');sort_ms=(time.perf_counter()-start)*1000
            ids=[candidates[i] for i in order]
        else:
            ids=candidates;sort_ms=0
        displayed=[mid for mid in ids if not (name=='tinybert-shortlist40' and mid not in shortlist[row['id']])] if row['rerankable'] else ids
        assert len(set(ids))==len(ids) and set(ids)==set(candidates)
        if not row['rerankable']: assert ids==candidates
        results.append(dict(id=row['id'],split=row['split'],group=row['group'],language=row['language'],category=row['category'],
                            rerankable=row['rerankable'],candidateCount=len(candidates),
                            ids=displayed[:10],shortlistRecall=(sum(mid in row['relevant'] for mid in shortlist[row['id']])/max(len(row['relevant']),1)) if row['relevant'] else None,
                            metrics=query_metrics(displayed,row['relevant'],candidates),
                            scoringMs=(times[name][row['id']]+sort_ms) if row['rerankable'] else 0,
                            retrievalMs=row['retrievalMs']))
    summary={}
    for split in ['dev','fresh']:
        summary[split]={}
        for group in ['keyword','question-diagnostic']:
            selected=[r for r in results if r['split']==split and r['group']==group]
            summary[split][group]=dict(all=aggregate(selected),
                                      en=aggregate([r for r in selected if r['language']=='en']),
                                      ru=aggregate([r for r in selected if r['language']=='ru']),
                                      implicit=aggregate([r for r in selected if r['rerankable']]))
    reports[name]=dict(**metadata[name],summary=summary,rows=results)
output=dict(schemaVersion=1,frozenInputs=frozen,platform=platform.platform(),cpu=platform.processor(),
            fixtureMessages=len(messages),queryGroups=len(rows),candidateDepth=300,vectorIndexMs=vector_index_ms,
            featureNames=feature_names,supervisedDevQueries=len(train),roleTrainingMessages=len(role_texts),
            trainingAssetBytes={p.name:p.stat().st_size for p in [args.output/'linear.json',args.output/'pairwise.json',args.output/'lambdamart.txt']},
            processPeakBytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024,
            workerResources={key:{k:v for k,v in r.items() if k!='rows'} for key,r in worker_reports.items()},rankers=reports)
(args.output/'report.json').write_text(json.dumps(output,indent=2)+'\n')
print(json.dumps({name:report['summary']['fresh']['keyword']['all'] for name,report in reports.items()},indent=2))
