import json, math, sys, glob, os
W0={"text":{"high":5,"middle":5,"low":-2},"person":{"same":1,"different":-3,"unknown":0},
    "amount":{"equal":6,"different":-4,"missing":0},"category":{"same":1,"different":-1,"unknown":0},
    "due":{"near":4,"far":-1,"missing":0},"reply":{"yes":6,"no":0},"time":{"near":2,"weeks":-2,"far":-3}}

def textlevel(v): return "high" if v>=0.6 else "middle" if v>=0.3 else "low"

def score(p, W=W0, text="max", dialog_person=None, floor=0.2):
    best=None
    for c in p["combos"]:
        L=dict(c["levels"])
        tri=c["trigrams"]
        if text=="stems": v=c["stems"]
        elif text=="rest": v=max(c["stems"],p["trigramsRest"])
        elif text=="floor": v=max(c["stems"], tri if c["stems"]>=floor else 0)
        else: v=max(c["stems"],tri)
        L["text"]=textlevel(v)
        s=sum(W[f][L[f]] for f in W)
        if dialog_person is not None and p["dialog"] and L["person"]=="same": s+=dialog_person-W["person"]["same"]
        if best is None or s>best[0]: best=(s,L,c,v)
    return best

def signals(p):
    s,L,c,v=score(p)
    return {"trigram": L["text"]!="low" and c["trigrams"]>c["stems"],
            "person": L["person"]=="same",
            "reply": L["reply"]=="yes"}

def load():
    old=json.load(open("old-feat.json")); oldp={x["n"]:x for x in json.load(open("old-pairs.json"))}
    for p in old: p["label"]={"S":"same","D":"different"}[oldp[p["n"]]["label"]]; p["set"]="old"; p["strata"]=["old"]
    new=json.load(open("new-feat.json")); samp={x["k"]:x for x in json.load(open("sample.json"))}
    lab={}
    for f in glob.glob("labels/*.json"):
        lab[os.path.basename(f)[:-5]]=json.load(open(f))
    newl=[]
    for p in new:
        if p["k"] in samp and p["k"] in lab:
            p["label"]=lab[p["k"]]["label"]; p["set"]="new"; p["strata"]=samp[p["k"]]["strata"]; newl.append(p)
    return old,new,newl
