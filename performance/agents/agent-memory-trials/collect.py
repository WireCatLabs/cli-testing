"""Copy the wcatbench rules-trial results into this folder: per-check rows as CSV and the summary tables.

Run after the wcatbench commands in README.md, then `npx biome format --write results/` (the repository formatter).
Synthetic data only, so every row is published.
"""

import csv
import json
import shutil
from pathlib import Path

RUN = Path("/var/tmp/wcat-dapi/wcatbench-home/runs/e1")
PREFIX_RUN = Path("/var/tmp/wcat-dapi/wcatbench-home/runs/e1-prefix")
ROUND_CONFIG = Path("/home/leemour/Projects/AI/wcatbench-wt-rules-trial/configs/rounds/rules-trial.yml")
OUT = Path(__file__).resolve().parent / "results"

ROWS = {
    "e1-his.csv": RUN / "rows-his.jsonl",
    "e1-ours.csv": RUN / "rows-ours.jsonl",
    "e1-his-prefix.csv": PREFIX_RUN / "rows-his.jsonl",
    "e1-ours-prefix.csv": PREFIX_RUN / "rows-ours.jsonl",
    "e1-unrestricted.csv": RUN / "rows-unrestricted-his.jsonl",
}
TABLES = {
    "e1-his.md": RUN / "summary-his.md",
    "e1-ours.md": RUN / "summary-ours.md",
    "e1-his-prefix.md": PREFIX_RUN / "summary-his.md",
    "e1-ours-prefix.md": PREFIX_RUN / "summary-ours.md",
    "e1-unrestricted.md": RUN / "summary-unrestricted-his.md",
    "e2.md": RUN / "e2" / "summary.md",
    "e3.md": RUN / "e3" / "summary.md",
    "round-config.yml": ROUND_CONFIG,
}
E3_RESULTS = RUN / "e3"


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
    print(f"results in {OUT}")


if __name__ == "__main__":
    main()
