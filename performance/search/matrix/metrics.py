"""Graded ranking metrics with explicit answer and support thresholds."""
import math
import numpy as np

def query_metrics(ids,relevant,pool):
    grades=list(relevant.values())
    def success(k,answer=False): return float(any(relevant.get(mid,0)>=(2 if answer else 1) for mid in ids[:k]))
    def rr(answer=False): return next((1/(i+1) for i,mid in enumerate(ids[:10]) if relevant.get(mid,0)>=(2 if answer else 1)),0)
    def dcg(values): return sum((2**grade-1)/math.log2(i+2) for i,grade in enumerate(values[:10]))
    if not grades:
        return dict(answerable=False,falseHits=len(ids[:10]),noAnswerHit=float(bool(ids)))
    return dict(answerable=True,recallAt10=sum(mid in relevant for mid in ids[:10])/len(grades),
                mrrAt10=rr(),answerMrrAt10=rr(True),ndcgAt10=dcg([relevant.get(mid,0) for mid in ids[:10]])/dcg(sorted(grades,reverse=True)),
                candidateRecall=sum(mid in relevant for mid in pool)/len(grades),
                answerCandidateSuccess=float(any(relevant.get(mid)==2 for mid in pool)),
                recallAt40=sum(mid in relevant for mid in ids[:40])/len(grades),
                **{f'successAt{k}':success(k) for k in [1,3,10]},
                **{f'answerSuccessAt{k}':success(k,True) for k in [1,3,10]})

def aggregate(results):
    answered=[r for r in results if r['metrics']['answerable']]
    negatives=[r for r in results if not r['metrics']['answerable']]
    keys=['recallAt10','mrrAt10','answerMrrAt10','ndcgAt10','candidateRecall','answerCandidateSuccess','recallAt40',
          'successAt1','successAt3','successAt10','answerSuccessAt1','answerSuccessAt3','answerSuccessAt10']
    measured=[r for r in results if r['rerankable'] and r['candidateCount']]
    return dict(queries=len(results),answerable=len(answered),noAnswerQueries=len(negatives),
                **{key:float(np.mean([r['metrics'][key] for r in answered])) if answered else None for key in keys},
                noAnswerFalseHits=sum(r['metrics']['falseHits'] for r in negatives),
                noAnswerHitRate=float(np.mean([r['metrics']['noAnswerHit'] for r in negatives])) if negatives else None,
                rerankedQueryCount=len(measured),
                rerankP50Ms=float(np.percentile([r['scoringMs'] for r in measured],50)) if measured else None,
                rerankP95Ms=float(np.percentile([r['scoringMs'] for r in measured],95)) if measured else None,
                lookupAndRankP95Ms=float(np.percentile([r['scoringMs']+r['retrievalMs'] for r in measured],95)) if measured else None)
