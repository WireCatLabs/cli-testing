"""Blind scoring for layer 2. Builds one answer sheet per (model, arm) from rows-v2.jsonl for the ids given, gives each
sheet a random letter, and scores every sheet in its own folder (key + that sheet only) with Sonnet 5.5 through the
claude-clean copy, on the round-14 agent rubric (r14/score-rules.txt). The letter key goes to <out>/blind-key.json,
outside every scorer folder. Usage: python3 -I score.py <out-name> [--arms a,b,...] <H-id>..."""
import json, os, random, re, shutil, string, subprocess, sys, time
EXP = os.environ.get("EXP") or os.path.expanduser("~/.cache/wirecat-experiment-b")  # the private run folder

C = EXP
L2 = f"{C}/p2/layer2"
CLEAN = f"{L2}/claude-clean"
KEY = f"{C}/r14/key.md"
RULES = f"{C}/r14/score-rules.txt"
QUESTIONS = f"{C}/r13/held/questions.json"
ROWS = os.environ.get("L2_ROWS", f"{L2}/rows-v2.jsonl")
out, ids = f"{L2}/scoring/{sys.argv[1]}", sys.argv[2:]
arms = None
if ids[:1] == ["--arms"]:
  arms, ids = set(ids[1].split(",")), ids[2:]
questions = {t["t"]: t["q"] for t in json.load(open(QUESTIONS))}
rows = {}
for line in open(ROWS):
  r = json.loads(line)
  rows[r["id"]] = r
pairs = sorted({(r["model"], r["arm"]) for r in rows.values()})
pairs = [p for p in pairs if (arms is None or p[1] in arms) and all(f"{p[0]}:{p[1]}:{t}" in rows for t in ids)]
os.makedirs(out, exist_ok=True)
letters = random.sample([c for c in string.ascii_uppercase if c not in "AB"], len(pairs))
blind = {l: f"{m}:{a}" for l, (m, a) in zip(letters, pairs)}
json.dump(blind, open(f"{out}/blind-key.json", "w"), indent=1)

# The key: only the sections of the ids scored, renumbered as the sheet numbers them (H<n> -> <n>).
key = open(KEY).read()
head, *sections = re.split(r"(?m)^## ", key)
keep = [s for s in sections if s.split("\n", 1)[0].strip() in {str(int(t[1:])) for t in ids}]
rules = open(RULES).read().replace("The key has 20 sections, one per question id (1-20); the sheet answers them by the "
                                   "same ids.", f"The key has {len(keep)} sections, one per question id; the sheet "
                                   "answers them by the same ids.").replace("(out of 20)", f"(out of {len(keep)})")
for letter, who in blind.items():
  model, arm = who.split(":")
  d = f"{out}/scorer-{letter}"
  os.makedirs(d, exist_ok=True)
  open(f"{d}/key.md", "w").write(head + "".join("## " + s for s in keep))
  text = "## Questions\n" + "\n".join(f"{int(t[1:])}. {questions[t]}" for t in ids)
  answer = lambda r: (r["result"] or "no answer").strip() if r["budget"] == "in" else "out of budget: no answer"
  text += "\n\n## Answers\n" + "\n\n".join(f"{int(t[1:])}. {answer(rows[f'{who}:{t}'])}" for t in ids)
  open(f"{d}/answers-{letter}.md", "w").write(text + "\n")
  prompt = (f"You are a blind scorer. Read only key.md and answers-{letter}.md in this folder; do not try to find out who "
            f"wrote the sheet. Score the sheet against the key.\n{rules}\nEnd with one line exactly like: "
            "TOTAL <score> CW <count> SCORES <id>=<score>,<id>=<score>,... (CW ids marked with a star, like 4=0*).")
  t0 = time.monotonic()
  r = subprocess.run(["bash", CLEAN, "--tools", "Read", "--model", "claude-sonnet-5-5", "--allow", f"Read(/{d}/**)",
                      "--out", f"{d}/transcript.jsonl", "--", prompt], cwd=d, stdin=subprocess.DEVNULL,
                     env={k: v for k, v in os.environ.items() if k != "OPENAI_API_KEY"})
  ev = [json.loads(l) for l in open(f"{d}/transcript.jsonl") if l.startswith("{")]
  res = next((e for e in reversed(ev) if e.get("type") == "result"), {})
  open(f"{out}/scores-{letter}.md", "w").write(res.get("result") or "")
  print(f"scored {letter} in {time.monotonic() - t0:.0f} s, cost {res.get('total_cost_usd')}", flush=True)
