import os
"""Free check: can rare query words pick the chat, as the export agent does? Counts from the export, no tg."""
import json, math, re, glob, collections
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "retrieval.py")).read().split("def search")[0])
EXPORT = "/home/leemour/.cache/wirecat-experiment-b/e/export"
WORD = re.compile(r"[\w&]+", re.U)
def text(m):
    t = m.get("text", "")
    return "".join(p if isinstance(p, str) else p.get("text", "") for p in t) if isinstance(t, list) else t
chats = {}
for f in glob.glob(f"{EXPORT}/ChatExport_*/result.json"):
    cid = f.split("ChatExport_")[1].split("/")[0]
    msgs = [text(m).lower() for m in json.load(open(f)).get("messages", [])]
    chats[cid] = [set(WORD.findall(t)) for t in msgs if t]
total = sum(len(v) for v in chats.values())
vocab = {c: collections.Counter(w for s in v for w in s) for c, v in chats.items()}
stop = {"что", "как", "это", "был", "была", "было", "мне", "там", "the", "and", "for", "which", "was", "who", "какой",
        "какая", "какие", "кто", "где", "когда", "сколько", "почему", "про", "посмотри", "короче", "ну", "вот", "with"}
def count(c, word):  # messages in chat c holding a word starting with `word`
    return sum(n for w, n in vocab[c].items() if w.startswith(word))
key = key_items(); res = collections.Counter(); n = 0
for line in open(QUESTIONS):
    m = re.match(r"(\d+)([a-z]?)\.\s*(.*)", line.strip())
    if not m or int(m[1]) in NO_ANSWER: continue
    gold = key[int(m[1])][0]; n += 1
    words = [w[:max(4, len(w) - 2)] for w in WORD.findall(m[3].lower()) if len(w) >= 3 and w not in stop]
    df = {w: sum(count(c, w) for c in chats) for w in words}
    for name, score in {
        "idf_count": lambda c: sum(math.log(1 + count(c, w)) * math.log(total / (1 + df[w])) for w in words),
        "idf_share": lambda c: sum(count(c, w) / len(chats[c]) * math.log(total / (1 + df[w])) for w in words),
        "rarest": lambda c: max([count(c, w) * math.log(total / (1 + df[w])) for w in words] or [0]),
    }.items():
        order = sorted(chats, key=lambda c: -score(c))
        for k in (1, 2, 3):
            res[(name, k)] += any(c in gold for c in order[:k])
for name in ("idf_count", "idf_share", "rarest"):
    print(f"{name:10} gold chat in top 1/2/3: {res[(name,1)]}/{res[(name,2)]}/{res[(name,3)]} of {n}")
