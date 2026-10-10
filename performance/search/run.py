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

runners = {
    "run": ("message-search", "run"), "combined": ("message-search", "combined"),
    "semantic": ("message-search", "semantic"), "resources": ("message-search", "resources"),
    "typecheck": ("message-search", "typecheck"), "candidates": ("matrix", "export"),
    "matrix-typecheck": ("matrix", "typecheck"), "validation-candidates": ("validation", "export"),
    "validation-typecheck": ("validation", "typecheck"), "path": ("model-free", "run"),
    "path-typecheck": ("model-free", "typecheck"), "path-tests": ("model-free", "tests"),
}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--messaging-root", required=True, type=Path,
                    help="cli-messaging checkout with dist/ and installed dependencies")
parser.add_argument("runner", choices=runners)
args, forwarded = parser.parse_known_args()
root = args.messaging_root.resolve()
for path in [root / "dist/services/messages.js", root / "dist/services/messages-combined.js",
             root / "node_modules"]:
    if not path.exists():
        parser.error(f"missing {path}; build the selected cli-messaging checkout first")
if args.runner.endswith("typecheck") and forwarded:
    parser.error("typecheck accepts no additional arguments")
area = Path(__file__).resolve().parent
stage = Path(tempfile.mkdtemp(prefix="cli-testing-search-"))
(stage / "package.json").write_text(json.dumps({"type": "module"}) + "\n")
folder, selected_script = runners[args.runner]
stage_folder = "message-search-quality" if folder == "message-search" else folder
selected_harness = stage / "bench" / stage_folder
ignored = shutil.ignore_patterns("results", "__pycache__", "*-dev.json", "baseline.json", "augmented-baseline.json", "resources.json")
shutil.copytree(area / folder, selected_harness, ignore=ignored)
if folder == "matrix":
    shutil.copytree(area / "message-search", stage / "bench/message-search-quality", ignore=ignored)
(stage / "dist").symlink_to(root / "dist", target_is_directory=True)
(stage / "node_modules").symlink_to(root / "node_modules", target_is_directory=True)
command = (["pnpm", "exec", "tsc", "-p", str(selected_harness / "tsconfig.json")]
           if selected_script == "typecheck"
           else ["node", str(selected_harness / f"{selected_script}.ts"), *forwarded])
metadata = {"messagingRoot": str(root), "runner": args.runner,
            "command": command, "node": subprocess.check_output(["node", "--version"], text=True).strip(),
            "messagingPackage": json.loads((root / "package.json").read_text())["version"]}
for label, path in [("messagingCommit", root), ("testingCommit", area)]:
    metadata[label] = subprocess.check_output(["git", "-C", str(path), "rev-parse", "HEAD"], text=True).strip()
(stage / "launch.json").write_text(json.dumps(metadata, indent=2) + "\n")
print(f"Search harness and launch metadata retained at {stage}", file=sys.stderr)
sys.exit(subprocess.run(command, cwd=root, env=os.environ.copy()).returncode)
