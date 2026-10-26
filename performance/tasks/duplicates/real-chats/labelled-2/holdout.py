import sys, json, math, copy
sys.path.insert(0,"."); from analyze import *
old,newall,newl=load()
O=[p for p in old if p["label"] in ("same","different")]; N=[p for p in newl if p["label"] in ("same","different")]
def fit(ps):
    ns=sum(p["label"]=="same" for p in ps); nd=len(ps)-ns; w=copy.deepcopy(W0)
    for f in W0:
        for lv in W0[f]:
            s=sum(1 for p in ps if p["label"]=="same" and score(p)[1][f]==lv); d=sum(1 for p in ps if p["label"]=="different" and score(p)[1][f]==lv)
            w[f][lv]=round(math.log2(((s+.5)/(ns+1))/((d+.5)/(nd+1))),1)
    return w
def auc(ps,**kw):
    S=[score(p,**kw)[0] for p in ps if p["label"]=="same"]; D=[score(p,**kw)[0] for p in ps if p["label"]=="different"]
    return sum((s>d)+.5*(s==d) for s in S for d in D)/(len(S)*len(D))
def W(**ch):
    w=copy.deepcopy(W0)
    for k,v in ch.items(): f,l=k.split("__"); w[f][l]=v
    return w
cand={"current":{}, "reply +2":dict(W=W(reply__yes=2)), "person same 0":dict(W=W(person__same=0)),
      "reply +2, person same 0":dict(W=W(reply__yes=2,person__same=0)),
      "reply 0, person same 0":dict(W=W(reply__yes=0,person__same=0)),
      "reply +2, person 0, trigram floor":dict(W=W(reply__yes=2,person__same=0),text="floor"),
      "fit on new":dict(W=fit(N)), "fit on old":dict(W=fit(O))}
for n,kw in cand.items(): print(f"{n:38s} AUC old {auc(O,**kw):.2f}  new {auc(N,**kw):.2f}")
print("fit on new:",json.dumps(fit(N))); print("fit on old:",json.dumps(fit(O)))
