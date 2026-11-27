"""What fills the 45 top-5 slots (3 tasks x 3 wordings x 5 hits) of every engine in experiment 1.

Each hit is counted by its first source id: `needed` is a source the task's checks rest on, `old_on` an older version
of a rule this task needs, `old_off` an older version of another task's rule, `lite` and `sapsan` the look-alike
projects, `company` the company-wide notes, `other_target` a target-project source no check of this task needs.
Run: `python3 slots.py` after collect.py. Writes results/slots.md and results/slots.json.
"""

import collections
import json
from pathlib import Path

DATASET = Path("/var/tmp/wcat-dapi/wcatbench-home/datasets/rules-trial-36-7f6c06a7")
CONTEXTS = Path("/var/tmp/wcat-dapi/wcatbench-home/runs/e1/contexts")
GEMMA_CONTEXTS = Path("/home/leemour/.cache/wcat-dapi-gemma/wcatbench-home/runs/e1/contexts")
OUT = Path(__file__).resolve().parent / "results"

ENGINES = {
    "files-top5": CONTEXTS / "files-top5",
    "memo, EmbeddingGemma (default)": GEMMA_CONTEXTS / "memo",
    "memo, e5-small (not default)": CONTEXTS / "memo",
    "agentmemory": CONTEXTS / "agentmemory",
    "mem0-oss": CONTEXTS / "mem0-oss",
    "hindsight-slim": CONTEXTS / "hindsight-slim",
    "openviking-evo-off": CONTEXTS / "openviking-evo-off",
    "openviking-evo-on": CONTEXTS / "openviking-evo-on",
}
OLD = {"s01", "s05", "s07", "s10", "s13"}
ON_TASK = {"t1": {"s01", "s05"}, "t2": {"s07", "s10"}, "t3": {"s01", "s05", "s13"}}
KINDS = ("needed", "old_on", "old_off", "other_target", "lite", "sapsan", "company")
PROJECTS = {"Сокол-Лайт": "lite", "Сапсан": "sapsan", "Компания": "company"}


def kind(source: str, question: str, corpus: dict, key: dict) -> str:
    if source in key[question]:
        return "needed"
    if source in OLD:
        return "old_on" if source in ON_TASK[question[:2]] else "old_off"
    return PROJECTS.get(corpus[source]["metadata"].get("project"), "other_target")


def main() -> None:
    corpus = {row["id"]: row for row in map(json.loads, (DATASET / "corpus.jsonl").read_text().splitlines())}
    key = {item["question_id"]: set(item["sources"]) for item in json.loads((DATASET / "key.json").read_text())}
    result = {}
    for engine, folder in ENGINES.items():
        counts = {wording: collections.Counter() for wording in ("p0", "p1", "p2")}
        for wording, counter in counts.items():
            for task in ("t1", "t2", "t3"):
                question = f"{task}.{wording}"
                for hit in json.loads((folder / f"{question}.json").read_text())["hits"][:5]:
                    sources = hit.get("sources") or []
                    counter[kind(sources[0], question, corpus, key) if sources else "no_source"] += 1
        result[engine] = {wording: dict(counter) for wording, counter in counts.items()}
    (OUT / "slots.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    lines = [
        "| Engine | " + " | ".join(KINDS) + " | needed by wording (p0, p1, p2) |",
        "|---|" + "---:|" * len(KINDS) + "---|",
    ]
    for engine, counts in result.items():
        total = sum((collections.Counter(c) for c in counts.values()), collections.Counter())
        by_wording = ", ".join(str(counts[w].get("needed", 0)) for w in ("p0", "p1", "p2"))
        lines.append(f"| {engine} | " + " | ".join(str(total[k]) for k in KINDS) + f" | {by_wording} |")
    (OUT / "slots.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
