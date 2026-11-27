"""Copy the wcatbench rules-trial results into this folder: per-check rows as CSV and the summary tables.

Run after the wcatbench commands in README.md as `uv run --with tiktoken python collect.py`, then
`npx biome format --write results/` (the repository formatter).
Synthetic data only, so every row is published.
"""

import csv
import json
import shutil
import sqlite3
import subprocess
from pathlib import Path

RUN = Path("/var/tmp/wcat-dapi/wcatbench-home/runs/e1")
PREFIX_RUN = Path("/var/tmp/wcat-dapi/wcatbench-home/runs/e1-prefix")
MB_RUN = Path("/home/leemour/.cache/wcat-dapi-mb/wcatbench-home/runs/e1")
GEMMA_RUN = Path("/home/leemour/.cache/wcat-dapi-gemma/wcatbench-home/runs/e1")
# The round config at the wcatbench commit that ran these rows, read from git, so no worktree has to exist.
WCATBENCH_REPO = Path("/home/leemour/Projects/AI/wcatbench")
ROUND_CONFIG_COMMIT = "92799243d9cde6291b220726ac207c21c93a0d0d"
ROUND_CONFIG_PATH = "configs/rounds/rules-trial.yml"
OUT = Path(__file__).resolve().parent / "results"

ROWS = {
    "e1-his.csv": RUN / "rows-his.jsonl",
    "e1-ours.csv": RUN / "rows-ours.jsonl",
    "e1-his-prefix.csv": PREFIX_RUN / "rows-his.jsonl",
    "e1-ours-prefix.csv": PREFIX_RUN / "rows-ours.jsonl",
    "e1-unrestricted.csv": RUN / "rows-unrestricted-his.jsonl",
    "e1-his-memory-bank.csv": MB_RUN / "rows-his.jsonl",
    "e1-unrestricted-memory-bank.csv": MB_RUN / "rows-unrestricted-his.jsonl",
    "e1-his-memo-embeddinggemma.csv": GEMMA_RUN / "rows-his.jsonl",
    "e1-ours-memo-embeddinggemma.csv": GEMMA_RUN / "rows-ours.jsonl",
    "e1-unrestricted-memo-embeddinggemma.csv": GEMMA_RUN / "rows-unrestricted-his.jsonl",
}
TABLES = {
    "e1-his.md": RUN / "summary-his.md",
    "e1-ours.md": RUN / "summary-ours.md",
    "e1-his-prefix.md": PREFIX_RUN / "summary-his.md",
    "e1-ours-prefix.md": PREFIX_RUN / "summary-ours.md",
    "e1-unrestricted.md": RUN / "summary-unrestricted-his.md",
    "e2.md": RUN / "e2" / "summary.md",
    "e3.md": RUN / "e3" / "summary.md",
    "e1-his-memory-bank.md": MB_RUN / "summary-his.md",
    "e1-unrestricted-memory-bank.md": MB_RUN / "summary-unrestricted-his.md",
    "e2-memory-bank.md": MB_RUN / "e2" / "summary.md",
    "e1-his-memo-embeddinggemma.md": GEMMA_RUN / "summary-his.md",
    "e1-ours-memo-embeddinggemma.md": GEMMA_RUN / "summary-ours.md",
    "e1-unrestricted-memo-embeddinggemma.md": GEMMA_RUN / "summary-unrestricted-his.md",
    "e2-memo-embeddinggemma.md": GEMMA_RUN / "e2" / "summary.md",
    "e3-memo-embeddinggemma.md": GEMMA_RUN / "e3" / "summary.md",
}
E3_RESULTS = RUN / "e3"
MEMORY_BANK = Path("/home/leemour/.cache/wcat-dapi-mb/src")
MEMORY_BANK_TRIALS = {
    "memory-bank": MB_RUN / "trials" / "memory-bank",
    "u-memory-bank": MB_RUN / "trials" / "u-memory-bank",
    "memory-bank-agent": MB_RUN / "e2" / "memory-bank-agent",
}


def to_csv(source: Path, target: Path) -> int:
    rows = [json.loads(line) for line in source.read_text().splitlines() if line.strip()]
    fields: list[str] = []
    for row in rows:
        fields.extend(key for key in row if key not in fields)
    with target.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: json.dumps(value) if isinstance(value, (list, dict)) else value for key, value in row.items()})
    return len(rows)


def opened(state: Path) -> list[str]:
    """Paths the session passed to read_file or search_files, in order."""
    db = sqlite3.connect(f"file:{state}?mode=ro", uri=True)
    try:
        calls = db.execute("SELECT coalesce(tool_calls, '') FROM messages WHERE role = 'assistant'").fetchall()
    finally:
        db.close()
    paths = []
    for (raw,) in calls:
        for item in json.loads(raw) if raw else []:
            function = item.get("function") or {}
            if function.get("name") not in ("read_file", "search_files"):
                continue
            arguments = json.loads(function.get("arguments") or "{}")
            path = str(arguments.get("path") or "")
            if path:
                paths.append(path.removeprefix("/work/"))
    return paths


def read_tokens(state: Path, encoding: object) -> dict[str, int]:
    """Tokens the read_file and search_files results returned, by what they were about: template, sources or other."""
    db = sqlite3.connect(f"file:{state}?mode=ro", uri=True)
    try:
        calls = db.execute("SELECT coalesce(tool_calls, '') FROM messages WHERE role = 'assistant'").fetchall()
        results = dict(db.execute("SELECT tool_call_id, coalesce(content, '') FROM messages WHERE role = 'tool'").fetchall())
    finally:
        db.close()
    totals = {"template": 0, "sources": 0, "other": 0}
    for (raw,) in calls:
        for item in json.loads(raw) if raw else []:
            function = item.get("function") or {}
            if function.get("name") not in ("read_file", "search_files"):
                continue
            path = str(json.loads(function.get("arguments") or "{}").get("path") or "").removeprefix("/work/")
            text = results.get(item.get("id"), "")
            if path.startswith("memory-bank/adr/ADR-") or path == "brownfield-intake-prd.md":
                kind = "sources"
            elif path.startswith("memory-bank/") and not path.rstrip("/").endswith("memory-bank/adr"):
                kind = "template"
            else:
                kind = "other"
            totals[kind] += len(encoding.encode(text))  # type: ignore[attr-defined]
    return totals


def memory_bank_cost() -> dict[str, object]:
    import tiktoken

    encoding = tiktoken.get_encoding("o200k_base")
    template = MEMORY_BANK / "template" / "memory-bank"
    markdown = [path for path in template.rglob("*.md")]
    text = "".join(path.read_text() for path in sorted(markdown))
    cost: dict[str, object] = {
        "template_files": sum(1 for path in template.rglob("*") if path.is_file()),
        "template_markdown_files": len(markdown),
        "template_markdown_words": len(text.split()),
        "template_markdown_tokens_o200k": len(encoding.encode(text)),
    }
    for variant, folder in MEMORY_BANK_TRIALS.items():
        sessions = []
        for state in sorted(folder.glob("**/hermes-home-after/state.db")):
            if ".aborted-" in str(state):
                continue
            paths = opened(state)
            files = {path for path in paths if path.startswith("memory-bank/") and path.endswith(".md")}
            sessions.append(
                {
                    "session": str(state.parent.parent.relative_to(folder)),
                    "template_files_read": len({path for path in files if not path.startswith("memory-bank/adr/ADR-")}),
                    "adr_files_read": len({path for path in files if path.startswith("memory-bank/adr/ADR-")}),
                    "intake_read": "brownfield-intake-prd.md" in paths,
                    "tool_result_tokens": read_tokens(state, encoding),
                }
            )
        cost[variant] = sessions
    return cost


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for name, source in ROWS.items():
        if source.exists():
            print(f"{name}: {to_csv(source, OUT / name)} rows")
    for name, source in TABLES.items():
        if source.exists():
            shutil.copyfile(source, OUT / name)
            print(f"{name}: copied")
    for result in sorted(E3_RESULTS.glob("*/result.json")):
        shutil.copyfile(result, OUT / f"e3-{result.parent.name}.json")
    if (GEMMA_RUN / "e3" / "memo" / "result.json").exists():
        shutil.copyfile(GEMMA_RUN / "e3" / "memo" / "result.json", OUT / "e3-memo-embeddinggemma.json")
    config = subprocess.run(
        ["git", "-C", str(WCATBENCH_REPO), "show", f"{ROUND_CONFIG_COMMIT}:{ROUND_CONFIG_PATH}"],
        capture_output=True, text=True, check=True,
    ).stdout
    (OUT / "round-config.yml").write_text(config)
    print(f"round-config.yml: wcatbench {ROUND_CONFIG_COMMIT}")
    if MEMORY_BANK.exists():
        (OUT / "memory-bank-cost.json").write_text(json.dumps(memory_bank_cost(), indent=2) + "\n")
        print("memory-bank-cost.json: written")
    print(f"results in {OUT}")


if __name__ == "__main__":
    main()
