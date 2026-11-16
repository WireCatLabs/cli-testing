"""Builds answer sheets (main and each variant set) per contestant from session transcripts.

R4_DIR: the round folder. QUESTIONS (questions.txt), RUNS (run folders, the first found wins: "fix/run run"),
WHO (contestants) can be changed for a rerun round.
"""
import os
import json
import re
import sys

C = os.environ["R4_DIR"]
WHO = os.environ.get("WHO", "wf2 ws2 m eg e").split()
RUNS = os.environ.get("RUNS", "fix/run run").split()
questions = {}
for line in open(os.environ.get("QUESTIONS", f"{C}/questions.txt")):
    m = re.match(r"(\d+)([a-z]?)\. (.*)", line.strip())
    if m:
        questions[m.group(1) + m.group(2)] = m.group(3)


def blocks(path):
    out, cur = {}, None
    try:
        lines = open(path).read().split("\n")
    except FileNotFoundError:
        return out
    for line in lines:
        m = re.match(r"^(\d+[bc]?)\. (.*)", line)
        if m and m.group(1) in questions and m.group(1) not in out:
            cur = m.group(1)
            out[cur] = [m.group(2)]
        elif cur:
            out[cur].append(line)
    return {k: "\n".join(v).strip() for k, v in out.items()}


def from_transcript(w, q):
    """The session's own final answer: answers.md cannot be split back, an answer holds numbered lists of its own."""
    for base in (f"{C}/{r}" for r in RUNS):
        path = f"{base}/q{q}/{w}/transcript.jsonl"
        try:
            events = [json.loads(line) for line in open(path) if line.startswith("{")]
        except FileNotFoundError:
            continue
        results = [e for e in events if e.get("type") == "result"]
        return (results[-1].get("result") or "out of budget: no answer").strip() if results else "out of budget: no answer"
    return "out of budget: no answer"


def times(path):
    rows = {}
    try:
        for line in open(path).read().splitlines()[1:]:
            q, s, c, b = line.split("\t")
            rows[q] = (int(s), int(c), b)
    except FileNotFoundError:
        pass
    return rows


os.makedirs(f"{C}/sheets", exist_ok=True)
summary = []
for w in WHO:
    answers = {q: from_transcript(w, q) for q in questions}
    t = {}
    for r in reversed(RUNS):
        t.update(times(f"{C}/{r}/{w}/times.tsv"))
    suffixes = sorted({q.lstrip("0123456789") for q in questions})
    for suffix in suffixes:
        name = suffix or "main"
        ids = [q for q in questions if q.lstrip("0123456789") == suffix]
        num = lambda q: q.rstrip("abcdefghijklmnopqrstuvwxyz")
        if not any(q in t for q in ids):
            continue
        text = "## Questions\n" + "\n".join(f"{num(q)}. {questions[q]}" for q in ids)
        text += "\n\n## Answers\n" + "\n\n".join(f"{num(q)}. {answers.get(q, 'out of budget: no answer')}" for q in ids)
        with open(f"{C}/sheets/{w}-{name}.md", "w") as f:
            f.write(text + "\n")
    rows = [t[q] for q in questions if q in t]
    if not rows:
        continue
    out = sum(1 for r in rows if r[2] == "out")
    secs = sorted(r[0] for r in rows)
    summary.append(f"{w}\t{len(rows)}\t{out}\t{secs[len(secs) // 2]}\t{max(secs)}\t{sum(r[1] for r in rows) / len(rows):.1f}")
with open(f"{C}/sheets/times.tsv", "w") as f:
    f.write("who\tquestions\tout_of_budget\tmedian_s\tmax_s\tavg_calls\n" + "\n".join(summary) + "\n")
print("\n".join(summary))
