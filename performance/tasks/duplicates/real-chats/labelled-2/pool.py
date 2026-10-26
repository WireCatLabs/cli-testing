import json, collections
drafts={json.loads(l)["n"]:json.loads(l) for l in open("drafts.jsonl")}
res={r["n"]:r for r in json.load(open("results.json"))}
rel=json.load(open("related.json"))
key2n={r["key"]:r["n"] for r in rel if r.get("key")}
pool={}; asym=0
for r in rel:
    if not r.get("key"): continue
    for it in r["related"]["json"]["items"]:
        a,b=r["n"],key2n[it["key"]]
        k=(min(a,b),max(a,b))
        v=dict(score=it["score"],band=it["band"],levels=it["levels"],text=it["text"],found_by=it["found_by"],reasons=it["reasons"])
        if k in pool and pool[k]["score"]!=v["score"]: asym+=1; pool[k]["score2"]=v["score"]
        pool.setdefault(k,v)
print("pool",len(pool),"asym",asym)
print(collections.Counter(v["band"] for v in pool.values()))
flag=set()
for n,r in res.items():
    j=r["first"]["json"]
    if r["first"]["code"]!=0:
        for c in j["error"]["details"]["candidates"]:
            if c["key"] in key2n: flag.add((min(n,key2n[c["key"]]),max(n,key2n[c["key"]])))
print("flagged on add",len(flag), "in pool",len(flag&set(pool)))
lv=collections.Counter()
for v in pool.values():
    L=v["levels"]; t=v["text"]
    lv["trig_decides_mid+"]+= (t["trigrams"]>t["stems"] and L["text"]!="low")
    lv["person_same"]+= L["person"]=="same"
    lv["reply_yes"]+= L["reply"]=="yes"
    lv["text_mid+"]+= L["text"]!="low"
print(lv)
json.dump({f"{a}-{b}":v for (a,b),v in pool.items()},open("pool.json","w"),ensure_ascii=False)
json.dump(sorted(map(list,flag)),open("flag.json","w"))
