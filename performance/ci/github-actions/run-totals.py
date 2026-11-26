# Runner seconds, wall clock and peak parallel jobs over one or more GitHub Actions runs of cli-core.
#   python3 run-totals.py [-v] <run id>...
import json, subprocess, sys
from datetime import datetime
def t(s): return datetime.fromisoformat(s.replace("Z","+00:00"))
allj=[]
verbose = "-v" in sys.argv
for rid in [a for a in sys.argv[1:] if a!="-v"]:
    out=subprocess.run(["gh","api","--paginate",f"repos/WireCatLabs/cli-core/actions/runs/{rid}/jobs?per_page=100","--jq",".jobs[]"],capture_output=True,text=True).stdout
    for line in out.splitlines():
        j=json.loads(line)
        if not j.get("started_at") or not j.get("completed_at") or j["conclusion"]=="skipped": continue
        d=(t(j["completed_at"])-t(j["started_at"])).total_seconds()
        if d<=0: continue
        allj.append((rid,j["name"],t(j["started_at"]),t(j["completed_at"]),d,j["conclusion"]))
tot=sum(j[4] for j in allj)
start=min(j[2] for j in allj); end=max(j[3] for j in allj)
ev=sorted([(j[2],1) for j in allj]+[(j[3],-1) for j in allj], key=lambda x:(x[0],x[1]))
c=p=0
for _,d in ev: c+=d; p=max(p,c)
if verbose:
    for j in sorted(allj,key=lambda j:-j[4]): print(f"{j[4]:6.0f}s {j[1]} [{j[5]}]")
print(f"jobs={len(allj)} runner_s={tot:.0f} ({tot/60:.1f} min) wall_s={(end-start).total_seconds():.0f} peak_parallel={p}")
