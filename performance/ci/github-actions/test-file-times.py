# Test time per file in two Vitest JSON reports of the same files, before and after a change.
#   vitest run --reporter=json --outputFile.json=<report> ...
#   python3 test-file-times.py <before.json> <after.json>
# A file's time is its endTime - startTime: the tests alone, without its imports and setup.
import json, re, statistics, sys


def times(path):
    report = json.load(open(path))
    return {re.sub(r"^.*?/(?=(src|scripts)/)", "", f["name"]): f["endTime"] - f["startTime"] for f in report["testResults"]}


before, after = times(sys.argv[1]), times(sys.argv[2])
common = sorted(set(before) & set(after))
deltas = sorted(((before[k] - after[k], k) for k in common), reverse=True)
total_before = sum(before[k] for k in common) / 1000
total_after = sum(after[k] for k in common) / 1000
print(f"files={len(common)} before_s={total_before:.0f} after_s={total_after:.0f} "
      f"saved={100 * (1 - total_after / total_before):.0f}% median_saved_ms={statistics.median(d for d, _ in deltas):.0f}")
for delta, name in deltas[:10]:
    print(f"{delta:8.0f} ms  {before[name]:7.0f} -> {after[name]:7.0f}  {name}")
