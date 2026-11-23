"""Answer sheets from the agent round's transcripts: the last result of each session, numbered like the key.

Usage: python3 -I sheets.py RUN_DIR OUT_DIR COUNT   (RUN_DIR is run.py's OUT/run; writes OUT_DIR/<contestant>-sheet.md)
"""
import json, re, sys

RUN, OUT, COUNT = sys.argv[1], sys.argv[2], int(sys.argv[3])
for who in ("wf2", "eg"):
  lines = []
  for n in range(1, COUNT + 1):
    try:
      res = [json.loads(x) for x in open(f"{RUN}/qH{n}/{who}/transcript.jsonl") if '"type":"result"' in x]
    except FileNotFoundError:
      res = []
    ans = ((res[-1].get("result") if res else None) or "out of budget: no answer").split("📍")[0].strip()
    ans = re.sub(rf"^\**(Answer\s+)?{n}[.:]?\**:?\s*", "", ans)
    lines.append(f"{n}. {ans}\n")
  open(f"{OUT}/{who}-sheet.md", "w").write("\n".join(lines))
  print(f"{OUT}/{who}-sheet.md", len(lines))
