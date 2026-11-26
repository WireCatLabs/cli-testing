"""Shared: the 65 keyed questions and their answers, loaded with r13/held/batch.py's own code (same keys as earlier rounds)."""
import json, re, sqlite3
import os
EXP = os.environ.get("EXP") or os.path.expanduser("~/.cache/wirecat-experiment-b")  # the private run folder
SRC = f"{EXP}/r13/held/batch.py"
P2 = f"{EXP}/p2"
_g = {"__name__": "prelude"}
exec(open(SRC).read().split("def mem_free_gb")[0], _g)
tests, answers, db = _g["tests"], _g["answers"], _g["db"]
in_chunk, in_range, bound = _g["in_chunk"], _g["in_range"], _g["bound"]
SET = {"dev": "old30", "held": "old30", "new8": "old30", "fresh": "fresh15"}
def set_of(tid):
  g = tests[tid]["group"]
  return "held20" if g == "held" and tid.startswith("H") else SET[g]
