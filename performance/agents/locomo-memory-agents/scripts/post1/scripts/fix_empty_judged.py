"""One-off (2026-11-25): mark empty answers WRONG in existing judged.json files, as judge.py now does."""
import glob
import json

for path in glob.glob("/var/tmp/locomo-bench/runs/**/judged.json", recursive=True) + \
        glob.glob("/var/tmp/locomo-bench-p3/runs/**/judged.json", recursive=True):
  data = json.load(open(path))
  changed = 0
  for row in data["rows"]:
    if not str(row["answer"]).strip() and row["correct"]:
      row.update(label="WRONG", correct=0, judge_reply="empty answer; was " + row["judge_reply"])
      changed += 1
  if changed:
    open(path, "w").write(json.dumps(data, indent=2) + "\n")
    print(changed, path)
