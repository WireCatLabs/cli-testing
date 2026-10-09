#!/usr/bin/env python3
"""Run the offline research harness against an explicitly selected cli-messaging build."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--messaging-root", required=True, type=Path,
                    help="cli-messaging checkout with dist/ and installed dependencies")
parser.add_argument("runner", choices=["run", "combined", "semantic", "resources", "typecheck"])
args, forwarded = parser.parse_known_args()
root = args.messaging_root.resolve()
for path in [root / "dist/services/messages.js", root / "dist/services/messages-combined.js",
             root / "node_modules"]:
    if not path.exists():
        parser.error(f"missing {path}; build the selected cli-messaging checkout first")
if args.runner == "typecheck" and forwarded:
    parser.error("typecheck accepts no additional arguments")
area = Path(__file__).resolve().parent
stage = Path(tempfile.mkdtemp(prefix="cli-testing-search-"))
(stage / "package.json").write_text(json.dumps({"type": "module"}) + "\n")
harness = stage / "bench/message-search-quality"
shutil.copytree(area / "message-search", harness)
(stage / "dist").symlink_to(root / "dist", target_is_directory=True)
(stage / "node_modules").symlink_to(root / "node_modules", target_is_directory=True)
command = (["pnpm", "exec", "tsc", "-p", str(harness / "tsconfig.json")]
           if args.runner == "typecheck"
           else ["node", str(harness / f"{args.runner}.ts"), *forwarded])
metadata = {"messagingRoot": str(root), "runner": args.runner,
            "command": command, "node": subprocess.check_output(["node", "--version"], text=True).strip(),
            "messagingPackage": json.loads((root / "package.json").read_text())["version"]}
for label, path in [("messagingCommit", root), ("testingCommit", area)]:
    metadata[label] = subprocess.check_output(["git", "-C", str(path), "rev-parse", "HEAD"], text=True).strip()
(stage / "launch.json").write_text(json.dumps(metadata, indent=2) + "\n")
print(f"Search harness and launch metadata retained at {stage}", file=sys.stderr)
sys.exit(subprocess.run(command, cwd=root, env=os.environ.copy()).returncode)
