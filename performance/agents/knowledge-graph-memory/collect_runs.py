"""Copy finished agent runs into runs/<round>/<setup>/ with a manifest, so a later run is compared, not repeated.

Kept: predictions, per-question rows, the runner's own summary, scores, and a manifest naming the dataset, the
setup's settings, versions, model and prompt hash. Left out: the corpus (rebuilt by run.py from its seed) and the
raw agent transcripts, which stay in the cache folder named in the manifest.

    python3 collect_runs.py --round 10k-2026-11-06 --run "OpenClaw + Mem0=~/.cache/wirecat-bench/runs/oc10k-mem0" ...
"""

import argparse
import hashlib
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
KEEP = ("predictions.json", "per-question.json", "per-query.json", "run.json", "results.json")


def slug(label: str) -> str:
    return "-".join(label.lower().replace("+", " ").split())


def score_folder(run: Path) -> Path:
    return run.with_name(run.name.removesuffix("-joined") + "-score")


def manifest(label: str, run: Path) -> dict:
    meta = {}
    for name in ("run.json", "results.json"):
        if (run / name).exists():
            meta = json.loads((run / name).read_text())
    scores = score_folder(run)
    fixture = json.loads((scores / "manifest.json").read_text())
    prompt = meta.get("prompt", "")
    return {
        "setup": label,
        "dataset": {key: fixture[key] for key in ("fixture_version", "seed", "records", "questions")},
        "corpus_sha256": hashlib.sha256((scores / "corpus.jsonl").read_bytes()).hexdigest(),
        "agent": meta.get("openclaw") or "Hermes 0.21.0",
        "model": meta.get("model"),
        "reasoning": meta.get("reasoning") or meta.get("thinking"),
        "store": meta.get("store") or meta.get("provider"),
        "plugin": meta.get("plugin"),
        "toolsets": meta.get("toolsets"),
        "prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest() if prompt else None,
        "scores": json.loads((scores / "scores.json").read_text()),
        "raw_transcripts": str(run / "raw").replace(str(Path.home()), "~"),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--round", required=True)
    parser.add_argument("--run", action="append", required=True, help="label=path of a run folder")
    args = parser.parse_args()
    for item in args.run:
        label, path = item.split("=", 1)
        run = Path(path).expanduser()
        out = HERE / "runs" / args.round / slug(label)
        out.mkdir(parents=True, exist_ok=True)
        for name in KEEP:
            if (run / name).exists():
                shutil.copy2(run / name, out / name)
        shutil.copy2(score_folder(run) / "scores.json", out / "scores.json")
        (out / "manifest.json").write_text(json.dumps(manifest(label, run), indent=2) + "\n")
        print(out.relative_to(HERE))


if __name__ == "__main__":
    main()
