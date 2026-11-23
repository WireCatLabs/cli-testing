#!/usr/bin/env python3
"""`tg` for the agent round: a released tg build on a store copy, always --offline, one tg call at a time.

Install it as an executable named `tg` in run.py's --wrapper-dir and set the four paths below through the environment:
ROUND_TG (dist/bin/tg.js), ROUND_STORE (state folder), ROUND_TG_CONFIG (TG_CONFIG_DIR), ROUND_LOCK (lock file).
run.py holds the lock for the whole session and sets ROUND_LOCK_HELD=1; any other caller takes the lock here.
"""
import fcntl, os, subprocess, sys, time

TG, STATE, CONFIG = os.environ["ROUND_TG"], os.environ["ROUND_STORE"], os.environ["ROUND_TG_CONFIG"]
LOCK = os.environ["ROUND_LOCK"]
LOG = os.environ.get("ROUND_TG_LOG", os.devnull)
env = {k: v for k, v in os.environ.items() if not k.startswith(("WIRECAT_EXP_", "TG_READ_ONLY"))}
env.update({"WIRECAT_STATE_DIR": STATE, "TG_CONFIG_DIR": CONFIG, "TG_OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY", ""),
            "TG_EMBEDDING_PROVIDER": "openai", "TG_EMBEDDING_MODEL": "text-embedding-3-small", "TG_EMBEDDING_DIMS": "768",
            "DBUS_SESSION_BUS_ADDRESS": "disabled:"})
args = sys.argv[1:]
if "--offline" not in args:
  args.append("--offline")
waited = 0.0
if os.environ.get("ROUND_LOCK_HELD") != "1":
  lock = open(LOCK, "w")
  t0 = time.monotonic()
  fcntl.flock(lock, fcntl.LOCK_EX)
  waited = time.monotonic() - t0
started = time.monotonic()
r = subprocess.run(["node", TG, *args], env=env, cwd="/var/tmp")
with open(LOG, "a") as f:
  f.write(f"{time.strftime('%H:%M:%S')}\t{round(time.monotonic() - started, 1)}\twait={round(waited, 1)}"
          f"\texit={r.returncode}\t{' '.join(args[:3])}\n")
sys.exit(r.returncode)
