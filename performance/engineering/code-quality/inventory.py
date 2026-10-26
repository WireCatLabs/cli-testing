import argparse
import collections
import json
import os
import pathlib
import re
import subprocess


def inventory(root):
    files = list((root / "src").rglob("*.ts"))
    tests = [path for path in files if path.name.endswith(".test.ts")]
    source = [
        path
        for path in files
        if path not in tests
        and not path.name.endswith(".generated.ts")
        and not {"testing", "generated", "snowball"}.intersection(path.relative_to(root).parts)
    ]
    texts = {path: path.read_text() for path in source}
    imports = {path: set() for path in source}
    for path, text in texts.items():
        for target in re.findall(r'(?:from\s*|import\s*)["\']([^"\']+)["\']', text):
            if not target.startswith("."):
                continue
            resolved = pathlib.Path(os.path.normpath(path.parent / target)).with_suffix(".ts")
            if resolved in imports:
                imports[path].add(resolved)
    incoming = collections.Counter(target for targets in imports.values() for target in targets)
    lengths = {path: len(text.splitlines()) for path, text in texts.items()}
    package = json.loads((root / "package.json").read_text())
    return {
        "package": package["name"],
        "version": package["version"],
        "commit": subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip(),
        "source_files": len(source),
        "source_lines": sum(lengths.values()),
        "source_test_files": len(tests),
        "files_over_400_lines": sum(size > 400 for size in lengths.values()),
        "files_over_800_lines": sum(size > 800 for size in lengths.values()),
        "largest": [(str(path.relative_to(root)), size) for path, size in sorted(lengths.items(), key=lambda item: item[1], reverse=True)[:10]],
        "most_imported_including_types": [(str(path.relative_to(root)), count) for path, count in incoming.most_common(10)],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", action="append", required=True, metavar="NAME=PATH")
    args = parser.parse_args()
    results = {}
    for value in args.repo:
        name, separator, path = value.partition("=")
        if not name or not separator or not path:
            parser.error("each --repo must contain NAME=PATH")
        results[name] = inventory(pathlib.Path(path).resolve())
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
