#!/usr/bin/env python3
"""memo_baseline.py with each record's real sender, subject and note title instead of "Synthetic Sender" and rNNNN.

    python3 -I -B memo_clean.py --baseline <kg-10k>/memo_baseline.py --fixture <fixture> --output <new dir> --memo memo

memo_baseline.py names every mail and note rNNNN and signs every mail "Synthetic Sender", so it can map a hit back
by its title. memo embeds the title and sender with the text, and that shared noise alone took vector recall from
0.765 to 0.559 on the knowledge-graph v3 reworded set. Here a mail hit maps back by the message id in its ref and a
note by its file name, which is the record's own title. Everything else is memo_baseline.py unchanged.
"""

import argparse
import importlib.util
import os
import re
import sys
from datetime import UTC, datetime
from pathlib import Path

MESSAGE_BASE = 1_000_000_000_000_000


def load_baseline(path):
    spec = importlib.util.spec_from_file_location("memo_baseline", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def address(person):
    slug = re.sub(r"[^a-z0-9]+", ".", person["name"].casefold()).strip(".") or "unknown"
    return f"{person['name']} <{slug}@phone.example.test>"


def mbox_entry(index, record, name_of):
    when = datetime.fromisoformat(record["timestamp"]).astimezone(UTC)
    first = int(re.search(r"/thread-(\d+)/", record["id"]).group(1)) - 1
    reply = f"In-Reply-To: <{name_of(first)}@example.test>\n" if first != index else ""
    subject = record.get("title") or record["text"].split("\n", 1)[0][:80]
    return (f"From {MESSAGE_BASE + index}@xxx {when.strftime('%a %b %d %H:%M:%S +0000 %Y')}\n"
            f"X-GM-THRID: {2 * MESSAGE_BASE + first}\n"
            "X-Gmail-Labels: Inbox,Opened\n"
            f"Message-ID: <{name_of(index)}@example.test>\n{reply}"
            f"Date: {when.strftime('%a, %d %b %Y %H:%M:%S +0000')}\n"
            f"From: {address(record['sender'])}\n"
            f"To: {address(record['recipient'])}\n"
            f"Subject: {subject}\n"
            "Content-Type: text/plain; charset=utf-8\n\n"
            f"{record['text']}\n\n")


def file_name(title, taken):
    base = re.sub(r"[\\/:*?\"<>|\n]+", " ", title).strip()[:120] or "untitled"
    name, n = base, 2
    while name in taken:
        name, n = f"{base} ({n})", n + 1
    taken.add(name)
    return name


def install(baseline, limit=10):
    def write_sources(records, data):
        notes = data / "notes"
        notes.mkdir(parents=True)
        names, mbox, taken = {}, [], set()
        for index, record in enumerate(records):
            if record["kind"] == "mail":
                names[f"mail:{MESSAGE_BASE + index}"] = record["id"]
                mbox.append(mbox_entry(index, record, baseline.name_of))
                continue
            name = file_name(record.get("title") or baseline.name_of(index), taken)
            names[name] = record["id"]
            path = notes / f"{name}.md"
            path.write_text(record["text"] + "\n")
            stamp = datetime.fromisoformat(record["timestamp"]).timestamp()
            os.utime(path, (stamp, stamp))
        (data / "mail.mbox").write_text("".join(mbox))
        return names

    def hit_id(names, item):
        if item.get("kind") == "mail":
            return names.get(f"mail:{item.get('ref', '').rsplit('/', 1)[-1]}", f"unmapped:{item.get('ref')}")
        return names.get(item.get("title", ""), f"unmapped:{item.get('ref')}")

    def search(memo, names, query, extra, raw_path):
        reply, elapsed = memo.json("search", "all", query, "--limit", str(limit), *extra)
        raw_path.write_text(baseline.json.dumps(reply, ensure_ascii=False, indent=2) + "\n")
        return [hit_id(names, item) for item in reply["items"]], elapsed, reply["meta"].get("complete", True)

    baseline.write_sources, baseline.search = write_sources, search


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=10, help="hits per search; recall is scored on the first 10")
    known, rest = parser.parse_known_args()
    baseline = load_baseline(known.baseline)
    install(baseline, known.limit)
    sys.argv = [sys.argv[0], *rest]
    baseline.main()


if __name__ == "__main__":
    main()
