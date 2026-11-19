import os
"""Show the words around grep matches that tg misses, for one pattern (private, local)."""
import collections, re, sys
pattern, nocase = sys.argv[1], sys.argv[2] == "i"
sys.argv = ["x"]
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "parity.py")).read()
exec(src.split("rows = []")[0].replace("PATTERNS = [", "_P = ["))
flags = re.I if nocase else 0
grep = {(c, i): t for c, i, t in messages if re.search(pattern, t, flags)}
found, _ = tg(" OR ".join(pattern.split("|")))
miss = [t for k, t in grep.items() if k not in found]
words = collections.Counter(w.lower() for t in miss for w in re.findall(rf"\w*(?:{pattern})\w*", t, flags))
print(len(miss), "missed; matched words:", words.most_common(15))
