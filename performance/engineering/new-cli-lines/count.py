# cspell:words bitrix hubspot numstat
"""Count the TypeScript lines of a CLI's src at a git ref, split into source, tests, test helpers and generated code.

python3 count.py --repo hubspot=/path/to/hubspot-cli@<ref> --repo bitrix24=/path/to/bitrix24-cli@origin/main \
  --exclude 'bitrix24:src/calls/**' --since hubspot=<commit the template made>
"""

import argparse
import fnmatch
import json
import subprocess


def git(path, *args):
    return subprocess.run(["git", "-C", path, *args], check=True, capture_output=True, text=True).stdout


def kind_of(name):
    if name.startswith("src/generated/"):
        return "generated"
    if name.endswith(".test.ts"):
        return "tests"
    if name.startswith("src/testing/"):
        return "test_helpers"
    return "source"


def lines_at(path, ref, name):
    return git(path, "show", f"{ref}:{name}").count("\n")


def count(path, ref, excluded):
    files = [n for n in git(path, "ls-tree", "-r", "--name-only", ref, "src").splitlines() if n.endswith(".ts")]
    totals = {"source": 0, "tests": 0, "test_helpers": 0, "generated": 0, "excluded_source": 0}
    for name in files:
        lines = lines_at(path, ref, name)
        kind = kind_of(name)
        if kind == "source" and any(fnmatch.fnmatch(name, pattern) for pattern in excluded):
            totals["excluded_source"] += lines
        else:
            totals[kind] += lines
    return totals


def written_since(path, ref, start):
    added = {"source": 0, "tests": 0, "test_helpers": 0}
    for row in git(path, "diff", "--numstat", f"{start}..{ref}", "--", "src").splitlines():
        plus, _, name = row.split("\t")
        if plus == "-" or not name.endswith(".ts") or kind_of(name) == "generated":
            continue
        added[kind_of(name)] += int(plus)
    return added


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", action="append", required=True, help="name=path@ref")
    parser.add_argument("--exclude", action="append", default=[], help="name:glob of source left out")
    parser.add_argument("--since", action="append", default=[], help="name=commit the template made")
    args = parser.parse_args()
    since = dict(item.split("=", 1) for item in args.since)
    result = {}
    for item in args.repo:
        name, rest = item.split("=", 1)
        path, ref = rest.rsplit("@", 1)
        excluded = [glob.split(":", 1)[1] for glob in args.exclude if glob.startswith(f"{name}:")]
        entry = {"commit": git(path, "rev-parse", "--short", ref).strip(), **count(path, ref, excluded)}
        if name in since:
            entry["written_since_template"] = written_since(path, ref, since[name])
        result[name] = entry
    print(json.dumps(result, indent=2))


main()
