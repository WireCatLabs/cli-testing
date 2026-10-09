"""Reuse the first matrix's feature definitions without retraining or importing its executable."""
from collections import Counter
import math
import re
import time
import unicodedata
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from nltk.stem.snowball import SnowballStemmer
stem_en, stem_ru = SnowballStemmer('english'), SnowballStemmer('russian')
def tokens(text):
    folded = ''.join(c for c in unicodedata.normalize('NFKD', text.lower()) if not unicodedata.combining(c))
    return re.findall(r'[^\W_]+',folded, flags=re.UNICODE)

def stem(word):
    return (stem_ru if re.search('[а-яё]',word) else stem_en).stem(word)

def idf_for(counts):
    df = Counter(word for c in counts for word in c)
    return {word: math.log(1+(len(counts)-count+.5)/(count+.5)) for word,count in df.items()}

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


feature_names = ['bm25','stemBm25','tfidf','charTfidf','coverage','fuzzyCoverage','phrase','proximity',
                 'inverseLength','wordsSource','prefixSource','correctedSource','retrievalRank',
                 'negativeCue','proposalCue','decisionCue','supportCue','queryOwner','queryQuestion']


def compute_features(data):
    messages=data["messages"]
    rows=data["rows"]
    index={m["id"]:i for i,m in enumerate(messages)}
    texts=[m["text"] for m in messages]
    raw_tokens = [tokens(t) for t in texts]
    raw_counts = [Counter(t) for t in raw_tokens]
    stem_counts = [Counter(m['stems']) for m in messages]
    vocabulary = set(word for counts in raw_counts for word in counts)
    
    raw_idf, stem_idf = idf_for(raw_counts), idf_for(stem_counts)
    raw_average = np.mean([sum(c.values()) for c in raw_counts])
    stem_average = np.mean([sum(c.values()) for c in stem_counts])
    prep_start = time.perf_counter()
    word_vectorizer = TfidfVectorizer(tokenizer=tokens, token_pattern=None, lowercase=False)
    word_vectors = word_vectorizer.fit_transform(texts)
    char_vectorizer = TfidfVectorizer(analyzer='char_wb', ngram_range=(3,5), max_features=30000)
    char_vectors = char_vectorizer.fit_transform(texts)
    vector_index_ms = (time.perf_counter()-prep_start)*1000
    
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
    return feature_rows,feature_times,lexical_times
