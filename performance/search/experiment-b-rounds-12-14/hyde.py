"""Blind made-up replies: the model sees only the question text, never a message. Fills `hyde` in a questions file.

Usage: OPENAI_API_KEY=... python3 -I hyde.py QUESTIONS COST_JSON
"""
import json, os, sys, urllib.request

QUESTIONS, COST = sys.argv[1], sys.argv[2]
MODEL = "gpt-5-nano"
PRICE_IN, PRICE_OUT = 0.05e-6, 0.40e-6
PROMPT = ("The user searches their own Telegram chats with this question. Write the one chat message that would answer "
          "it, as a person in the chat would write it: 1-3 short sentences, the question's language, concrete invented "
          "details (names of products, numbers, dates, places). Reply with the message text only.")

qs = json.load(open(QUESTIONS))
tokens = {"in": 0, "out": 0}
for t in qs:
  if t.get("hyde"):
    continue
  body = {"model": MODEL, "reasoning_effort": "minimal",
          "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": t["q"]}]}
  req = urllib.request.Request("https://api.openai.com/v1/chat/completions", method="POST", data=json.dumps(body).encode(),
                               headers={"Authorization": "Bearer " + os.environ["OPENAI_API_KEY"],
                                        "Content-Type": "application/json"})
  with urllib.request.urlopen(req, timeout=120) as r:
    out = json.load(r)
  t["hyde"] = out["choices"][0]["message"]["content"].strip()
  tokens["in"] += out["usage"]["prompt_tokens"]
  tokens["out"] += out["usage"]["completion_tokens"]
  print(t["t"], "chars", len(t["hyde"]), flush=True)
json.dump(qs, open(QUESTIONS, "w"), ensure_ascii=False, indent=1)
tokens["usd"] = round(tokens["in"] * PRICE_IN + tokens["out"] * PRICE_OUT, 5)
json.dump(tokens, open(COST, "w"))
print(tokens)
