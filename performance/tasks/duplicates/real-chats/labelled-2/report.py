import json, math, sys, copy
sys.path.insert(0,".")
from analyze import *
old,newall,newl=load()
lab=lambda ps:[p for p in ps if p["label"] in ("same","different")]
sets={"old":lab(old),"new":lab(newl),"new-random":lab([p for p in newl if "random" in p["strata"]]),"all":lab(old)+lab(newl)}
print("labels new:",{l:sum(1 for p in newl if p["label"]==l) for l in ("same","different","unsure")})
print("strata new:",{s:sum(1 for p in newl if s in p["strata"]) for s in ("flagged","reply","trigram","person","random")})
def sig_table(ps):
    ns=sum(p["label"]=="same" for p in ps); nd=len(ps)-ns; out={}
    for sg in ("trigram","person","reply"):
        fs=sum(1 for p in ps if p["label"]=="same" and signals(p)[sg]); fd=sum(1 for p in ps if p["label"]=="different" and signals(p)[sg])
        m=(fs+.5)/(ns+1); u=(fd+.5)/(nd+1)
        out[sg]=dict(same=fs,diff=fd,precision=round(fs/(fs+fd),2) if fs+fd else None,m=round(m,2),u=round(u,2),w=round(math.log2(m/u),1))
    return ns,nd,out
for name,ps in sets.items():
    ns,nd,t=sig_table(ps); print(f"\n{name}: same {ns} diff {nd}")
    for k,v in t.items(): print("  ",k,v)
def bands(ps, **kw):
    r={}
    ns=sum(p["label"]=="same" for p in ps)
    for th,nm in ((10,"likely"),(5,"maybe+")):
        tp=sum(1 for p in ps if score(p,**kw)[0]>=th and p["label"]=="same"); fp=sum(1 for p in ps if score(p,**kw)[0]>=th and p["label"]=="different")
        r[nm]=f"{tp}/{tp+fp} right, finds {tp}/{ns}"
    return r
labelled={p["k"] for p in newl}
def unl(**kw):
    return sum(1 for p in newall if p["k"] not in labelled and score(p,**kw)[0]>=5)
def W(**ch):
    w=copy.deepcopy(W0)
    for k,v in ch.items():
        f,l=k.split("__"); w[f][l]=v
    return w
variants={
 "current":{},
 "person 0 in a dialog":dict(dialog_person=0),
 "reply +6 -> +2":dict(W=W(reply__yes=2)),
 "text: stems only":dict(text="stems"),
 "text: trigrams only when stems>=0.2":dict(text="floor",floor=0.2),
 "text: trigrams without the first word":dict(text="rest"),
 "text middle +5 -> +3":dict(W=W(text__middle=3)),
 "combo A: person0 dialog + reply+2 + trigram floor 0.2":dict(dialog_person=0,W=W(reply__yes=2),text="floor",floor=0.2),
 "combo B: person0 dialog + reply+2 + stems only":dict(dialog_person=0,W=W(reply__yes=2),text="stems"),
 "combo C: person0 dialog + reply+2 + trigrams w/o first word":dict(dialog_person=0,W=W(reply__yes=2),text="rest"),
}
print()
for vn,kw in variants.items():
    print(vn, "| old", bands(sets["old"],**kw), "| new", bands(sets["new"],**kw), "| all", bands(sets["all"],**kw), "| new unlabelled now >=5:", unl(**kw))
