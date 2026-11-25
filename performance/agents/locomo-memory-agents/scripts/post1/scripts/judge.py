"""Score answers.json files with Mem0's LoCoMo judge: ACCURACY_PROMPT verbatim from mem0ai/mem0
evaluation/metrics/llm_judge.py at b3ede5b7, gpt-4o-mini, temperature 0, JSON label. Writes judged.json beside."""
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

PROMPT_SOURCE = Path("/var/tmp/locomo-bench/mem0-eval/llm_judge.py")
ACCURACY_PROMPT = re.search(r'ACCURACY_PROMPT = """(.*?)"""', PROMPT_SOURCE.read_text(), re.S).group(1)
PRICE = {"input": 0.15 / 1e6, "output": 0.60 / 1e6}


def judge(question, gold, generated):
    body = {"model": "gpt-4o-mini", "temperature": 0.0, "response_format": {"type": "json_object"},
            "messages": [{"role": "user", "content": ACCURACY_PROMPT.format(
                question=question, gold_answer=gold, generated_answer=generated)}]}
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"],
                                          "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as reply:
        data = json.load(reply)
    text = data["choices"][0]["message"]["content"]
    label = json.loads(text[text.find("{"):text.rfind("}") + 1]).get("label", "")
    usage = data["usage"]
    return label, text, usage["prompt_tokens"] * PRICE["input"] + usage["completion_tokens"] * PRICE["output"]


for path in map(Path, sys.argv[1:]):
    rows = json.loads((path / "answers.json").read_text())
    out, cost = [], 0.0
    for row in rows:
        # gpt-4o-mini labels an empty answer CORRECT about 7 times in 10.
        if not str(row["answer"]).strip():
            label, text, spent = "WRONG", "empty answer, not sent to the judge", 0.0
        else:
            label, text, spent = judge(row["question"], row["gold"], row["answer"])
        cost += spent
        out.append({"id": row["id"], "gold": row["gold"], "answer": row["answer"], "label": label,
                    "correct": int(label == "CORRECT"), "judge_reply": text})
    (path / "judged.json").write_text(json.dumps({"rows": out, "judge_cost_usd": cost}, indent=2) + "\n")
    print(path.name, [r["label"] for r in out], f"${cost:.5f}")
