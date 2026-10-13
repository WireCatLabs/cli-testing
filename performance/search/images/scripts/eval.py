import json, numpy as np
l=json.load(open("tg_list.json")); T=json.load(open("targets.json")); tv=json.load(open("text_vecs.json")); v=json.load(open("l3_vecs.json"))
N=len(l); sha=[e["sha"] for e in l]
gt=[[j for j in range(N) if sha[j]==sha[t[0]]] for t in T]
def sc(Q,D,mask=None):
    S=np.array(Q)@np.array(D).T
    if mask is not None: S[:,~np.array(mask)]=-9
    return S
lanes={
 "L0":sc(tv["q"],tv["e0"],tv["hasCap"]),
 "L1":sc(tv["q"],tv["e1"]),
 "L3-A":sc(v["qA"],v["imgA"]),
 "L3-A-en":sc(v["qAen"],v["imgA"]),
 "L3-B":sc(v["qB"],v["imgB"]),
 "L3-B-en":sc(v["qBen"],v["imgB"]),
}
def ranks(S): return np.argsort(-S,axis=1)
def rrf(*Ss,k=60):
    out=np.zeros_like(Ss[0])
    for S in Ss:
        r=np.argsort(np.argsort(-S,axis=1),axis=1)+1
        out+=1.0/(k+r)
    return out
lanes["L1+A"]=rrf(lanes["L1"],lanes["L3-A"]); lanes["L1+B"]=rrf(lanes["L1"],lanes["L3-B"]); lanes["L1+A+B"]=rrf(lanes["L1"],lanes["L3-A"],lanes["L3-B"])
lanes["L0+B"]=rrf(lanes["L0"],lanes["L3-B"]); lanes["L0+A"]=rrf(lanes["L0"],lanes["L3-A"])
def rank_of(S):
    o=ranks(S); res=[]
    for qi,g in enumerate(gt):
        pos=[int(np.where(o[qi]==j)[0][0])+1 for j in g]; res.append(min(pos))
    return res
tot={}; per={}
for k,S in lanes.items():
    r=rank_of(S); per[k]=r; n=len(r)
    tot[k]={"hit@1":round(sum(x==1 for x in r)/n,3),"hit@5":round(sum(x<=5 for x in r)/n,3),"hit@10":round(sum(x<=10 for x in r)/n,3),"mrr":round(sum(1/x for x in r)/n,3)}
# captioned vs not targets
cap=[l[t[0]]["caption"] for t in T]
sub={}
for k in ("L0","L1","L3-A","L3-B","L1+A","L1+B"):
    for name,sel in (("target_with_caption",[i for i,c in enumerate(cap) if c]),("target_no_caption",[i for i,c in enumerate(cap) if not c])):
        r=[per[k][i] for i in sel]
        if r: sub.setdefault(name,{"n":len(r)})[k]={"hit@1":round(sum(x==1 for x in r)/len(r),3),"hit@5":round(sum(x<=5 for x in r)/len(r),3),"mrr":round(sum(1/x for x in r)/len(r),3)}
json.dump({"n_queries":len(T),"n_images":N,"unique_images":len(set(sha)),"totals":tot,"subsets":sub},open("totals.json","w"),indent=1)
json.dump({"per_query":[{"query_ru":T[i][1],"query_en":T[i][2],"chat":l[T[i][0]]["chat"],"message":l[T[i][0]]["msg"],"target_has_caption":cap[i],"duplicates_of_target":len(gt[i]),**{k:per[k][i] for k in per}} for i in range(len(T))]},open("per_query.json","w"),ensure_ascii=False,indent=1)
print(json.dumps(tot,indent=0)); print(json.dumps(sub)); print("with caption targets",sum(cap),"/",len(cap), "dups", [len(g) for g in gt])
