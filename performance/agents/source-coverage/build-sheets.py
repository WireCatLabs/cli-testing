"""Builds round 4 answer sheets (main, b, c) per contestant; a rerun answer in fix/ replaces the failed one."""
import os
import json
import re
import sys

C = os.environ["R4_DIR"]
WHO = ["wf2", "ws2", "m", "eg", "e"]
questions = {}
for line in open(f"{C}/questions.txt"):
    m = re.match(r"(\d+)([bc]?)\. (.*)", line.strip())
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
    for base in (f"{C}/fix/run", f"{C}/run"):
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


summary = []
for w in WHO:
    answers = {q: from_transcript(w, q) for q in questions}
    t = times(f"{C}/run/{w}/times.tsv")
    t.update(times(f"{C}/fix/run/{w}/times.tsv"))
    for name, keep in [("main", lambda q: q.isdigit()), ("b", lambda q: q.endswith("b")), ("c", lambda q: q.endswith("c"))]:
        ids = [q for q in questions if keep(q)]
        num = lambda q: q.rstrip("bc")
        text = "## Questions\n" + "\n".join(f"{num(q)}. {questions[q]}" for q in ids)
        text += "\n\n## Answers\n" + "\n\n".join(f"{num(q)}. {answers.get(q, 'out of budget: no answer')}" for q in ids)
        with open(f"{C}/sheets/{w}-{name}.md", "w") as f:
            f.write(text + "\n")
    rows = [t[q] for q in questions if q in t]
    out = sum(1 for r in rows if r[2] == "out")
    secs = sorted(r[0] for r in rows)
    summary.append(f"{w}\t{len(rows)}\t{out}\t{secs[len(secs) // 2]}\t{max(secs)}\t{sum(r[1] for r in rows) / len(rows):.1f}")
with open(f"{C}/sheets/times.tsv", "w") as f:
    f.write("who\tquestions\tout_of_budget\tmedian_s\tmax_s\tavg_calls\n" + "\n".join(summary) + "\n")
print("\n".join(summary))
