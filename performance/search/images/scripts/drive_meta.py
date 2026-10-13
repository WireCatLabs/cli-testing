import os
import json,subprocess,time
d=json.load(open(os.path.expanduser(f"~/.local/share/drive-cli/profiles/{os.environ['DRIVE_PROFILE']}/state.json")))
fs=[x['file'] for x in d['skipped'] if x['file']['mime'].startswith('image/')]
def call(params):
    r=subprocess.run(["drive",os.environ["DRIVE_PROFILE"],"api","call","drive.files.get","--params",json.dumps(params)],capture_output=True,text=True)
    return json.loads(r.stdout) if r.returncode==0 else None
pn={}; out=[]; fail=0
for f in fs:
    m=call({"fileId":f['id'],"fields":"id,name,parents,mimeType,createdTime,imageMediaMetadata(time,location,width,height)"})
    if m is None:
        fail+=1
        if fail>3: break
        continue
    path=[]
    p=(m.get("parents") or [None])[0]
    for _ in range(6):
        if not p: break
        if p not in pn:
            q=call({"fileId":p,"fields":"id,name,parents"}); pn[p]=q
            time.sleep(0.2)
        q=pn[p]
        if not q: break
        path.append(q["name"]); p=(q.get("parents") or [None])[0]
    m["path"]="/".join(reversed(path)); out.append(m); time.sleep(0.2)
json.dump(out,open("drive_meta.json","w"))
im=[m.get("imageMediaMetadata") or {} for m in out]
print("images",len(out),"fail",fail,"withTime",sum(1 for i in im if i.get("time")),"withLocation",sum(1 for i in im if i.get("location")),"withMeta",sum(1 for i in im if i))
