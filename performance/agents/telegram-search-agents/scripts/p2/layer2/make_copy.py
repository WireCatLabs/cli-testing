"""Throwaway copy of the r9 store for the layer-2 tg arm (SQLite backup API, r9 opened read-only, under r12/tg.lock)."""
import fcntl, sqlite3, time
import os
EXP = os.environ.get("EXP") or os.path.expanduser("~/.cache/wirecat-experiment-b")  # the private run folder
SRC = f"file:{EXP}/r9/state/wirecat.db?mode=ro"
DST = f"{EXP}/p2/layer2/tgstate/wirecat.db"
LOCK = f"{EXP}/r12/tg.lock"
with open(LOCK, "w") as lock:
  fcntl.flock(lock, fcntl.LOCK_EX)
  t = time.time()
  src, dst = sqlite3.connect(SRC, uri=True), sqlite3.connect(DST)
  src.backup(dst, pages=65536)
  dst.close(); src.close()
print(f"copied in {time.time() - t:.0f} s")
