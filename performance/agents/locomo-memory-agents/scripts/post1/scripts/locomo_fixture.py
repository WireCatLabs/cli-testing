"""LoCoMo conversations as the knowledge-graph-memory fixture format: one fixture per conversation, one record per
session (r0001 = session 1), with the session's date in the text and in `timestamp`."""
import argparse
import json
import re
from datetime import UTC, datetime
from pathlib import Path

SOURCE = Path("/var/tmp/locomo-bench/locomo-src/locomo10.json")
QUESTIONS = Path("/var/tmp/locomo-bench/questions.json")
FIXTURES = Path("/var/tmp/locomo-bench/fixtures")


def session_date(text):
    return datetime.strptime(text.strip(), "%I:%M %p on %d %B, %Y").replace(tzinfo=UTC)


def turn_text(turn):
    # LoCoMo's own prompts render a shared photo as its BLIP caption (task_eval/gpt_utils.py).
    text = f"{turn['speaker']}: {turn['text']}"
    if turn.get("blip_caption"):
        text += f" [shares a photo: {turn['blip_caption']}]"
    return text


def build(sample, questions):
    conv = sample["conversation"]
    numbers = sorted(int(m.group(1)) for k in conv if (m := re.fullmatch(r"session_(\d+)", k)))
    records = []
    for number in numbers:
        when = session_date(conv[f"session_{number}_date_time"])
        header = (f"Conversation between {conv['speaker_a']} and {conv['speaker_b']}, session {number}, "
                  f"{conv[f'session_{number}_date_time']}")
        body = "\n".join(turn_text(turn) for turn in conv[f"session_{number}"])
        records.append({"id": f"locomo:{sample['sample_id']}:S{number}", "kind": "note",
                        "timestamp": when.isoformat(), "session": number, "text": f"{header}\n\n{body}"})
    asked = [q for q in questions if q["conversation"] == sample["sample_id"]]
    return records, asked


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("conversations", nargs="*", help="sample ids, all ten when none")
    args = parser.parse_args()
    questions = json.loads(QUESTIONS.read_text())["questions"]
    for sample in json.loads(SOURCE.read_text()):
        if args.conversations and sample["sample_id"] not in args.conversations:
            continue
        records, asked = build(sample, questions)
        folder = FIXTURES / sample["sample_id"]
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "corpus.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records))
        (folder / "queries.json").write_text(json.dumps([{"id": q["id"], "question": q["question"],
                                                          "as_of": q["as_of"]} for q in asked], indent=2) + "\n")
        oracle = [{"id": q["id"], "answer": q["answer"], "category": q["category_name"],
                   "required_citations": sorted({f"locomo:{sample['sample_id']}:S{e.split(':')[0].lstrip('D')}"
                                                 for e in q["evidence"] if re.fullmatch(r"D\d+:\d+", e)})}
                  for q in asked]
        (folder / "oracle.json").write_text(json.dumps(oracle, indent=2, ensure_ascii=False) + "\n")
        speakers = {"a": sample["conversation"]["speaker_a"], "b": sample["conversation"]["speaker_b"]}
        (folder / "manifest.json").write_text(json.dumps({"conversation": sample["sample_id"], "speakers": speakers,
                                                          "sessions": len(records)}, indent=2) + "\n")
        chars = sum(len(r["text"]) for r in records)
        print(f"{sample['sample_id']}: {len(records)} sessions, {chars} chars, {len(asked)} questions")


if __name__ == "__main__":
    main()
