# python3 parse-labels.py — labout/<pair>.json from label-one.sh → labels/<pair>.json. Reviewed labels are kept.
import collections, glob, json, os, re

os.makedirs("labels", exist_ok=True)
count = collections.Counter()
for path in glob.glob("labout/*.json"):
    target = "labels/" + os.path.basename(path)
    if os.path.exists(target) and json.load(open(target)).get("reviewed"):
        count[json.load(open(target))["label"]] += 1
        continue
    label = json.loads(re.search(r"\{.*\}", open(path).read(), re.S).group(0))
    json.dump(label, open(target, "w"), ensure_ascii=False)
    count[label["label"]] += 1
print(dict(count))
