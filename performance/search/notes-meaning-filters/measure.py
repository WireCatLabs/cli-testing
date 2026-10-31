#!/usr/bin/env python3
"""Counts, per query, how many hits of the default search (words and meaning) break the query's field terms.

Usage: measure.py <label> -- <command words up to and including the search verb>
  e.g. measure.py memo -- memo search notes  (a label starting with drive adds --offline)
       measure.py drive -- drive personal search
Prints totals only, as JSON lines: no titles, refs or text.
"""
import datetime as dt
import json
import subprocess
import sys
from zoneinfo import ZoneInfo

# Each query, and the fields alone: what every hit must match, words or meaning.
QUERIES = {
    "date:today": "date:today",
    "tag:work": "tag:work",
    "date>=30d": "date>=30d",
    "budget date>=30d": "date>=30d",
    "plan tag:work": "tag:work",
}
ZONE = ZoneInfo("Europe/Madrid")


def run(command, query, *extra):
    out = subprocess.run([*command, query, "--json", "--no-record", *extra], capture_output=True, text=True)
    if out.returncode != 0:
        return None, out.stdout.strip() or out.stderr.strip()
    data = json.loads(out.stdout)
    if "items" in data:
        return data["items"], data.get("page", {}).get("has_more", False)
    return data["item"]["hits"], data["item"]["has_more"]


def exact_refs(command, query, offline):
    refs, page = set(), 1
    while page <= 50:
        hits, more = run(command, query, "--exact", "--limit", "100", "--page", str(page), *offline)
        if hits is None:
            return None
        refs.update(hit["ref"] for hit in hits)
        if not more:
            break
        page += 1
    return refs


def in_range(query, shown):
    at = dt.datetime.fromisoformat(shown.replace("Z", "+00:00"))
    now = dt.datetime.now(ZONE)
    if "date:today" in query:
        return at.astimezone(ZONE).date() == now.date()
    if "date>=30d" in query:
        return at >= now - dt.timedelta(days=30)
    return None


def main():
    label, command = sys.argv[1], sys.argv[sys.argv.index("--") + 1 :]
    offline = ["--offline"] if label.startswith("drive") else []
    for query, fields in QUERIES.items():
        hits, more = run(command, query, *offline)
        if hits is None:
            print(json.dumps({"tool": label, "query": query, "error": more[:200]}))
            continue
        exact = exact_refs(command, fields, offline)
        dated = [in_range(query, hit["updated_at"]) for hit in hits]
        print(
            json.dumps(
                {
                    "tool": label,
                    "query": query,
                    "hits": len(hits),
                    "by_meaning_only": sum(hit["found_by"] == ["meaning"] for hit in hits),
                    "outside_filter": None if exact is None else sum(hit["ref"] not in exact for hit in hits),
                    "field_matches": None if exact is None else len(exact),
                    "shown_date_in_range": None if dated[:1] == [None] or not dated else sum(dated),
                }
            )
        )


main()
