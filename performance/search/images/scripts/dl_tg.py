import os
import json,subprocess,os,time,hashlib,sys
l=json.load(open("tg_list.json")); out=[]; fails=0
for i,e in enumerate(l):
    d=f"images/tg/{i:03d}"; os.makedirs(d,exist_ok=True)
    r=subprocess.run(["tg",os.environ["TG_PROFILE"],"messages","download",e['chat'],e['msg'],"--output-dir",d],capture_output=True,text=True)
    if r.returncode!=0:
        fails+=1; print("fail",i,r.stderr[:100].replace(e['chat'],"<c>")); 
        if fails>=3: break
        time.sleep(5); continue
    items=json.loads(r.stdout)["items"]
    p=items[0]["path"]; b=open(p,"rb").read()
    e["file"]=p; e["sha"]=hashlib.sha256(b).hexdigest(); e["bytes"]=len(b); e["sizeOk"]=(e["size"] in (None,len(b)))
    time.sleep(1.2)
json.dump(l,open("tg_list.json","w"))
print("done",sum(1 for e in l if "file" in e),"fails",fails,"sizeMismatch",sum(1 for e in l if "file" in e and not e["sizeOk"]))
