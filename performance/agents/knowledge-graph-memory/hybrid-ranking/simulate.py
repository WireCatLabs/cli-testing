"""Replay memo's `search all` ranking from captured per-source lists, then try fusion variants on the same lists."""
import json
import sys
from pathlib import Path

K = 60
NEG = float("-inf")


def fuse(words, near, discovers, rule, limit=None):
    """One source's words and meaning lists as one, best first; `rule` decides a hit both lists hold."""
    score, cos = {}, {}
    for rank, ref in enumerate(words):
        score.setdefault(ref, 1 / (K + rank + 1))
    for rank, (ref, c) in enumerate(near):
        cos[ref] = c
        vote = 1 / (K + rank + 1)
        if ref in score:
            if rule == "current" and discovers:
                continue
            if rule == "best" or (rule == "best-q" and discovers):
                score[ref] = max(score[ref], vote)
                continue
            score[ref] += vote
        else:
            score[ref] = vote
    order = sorted(score, key=lambda r: -score[r])
    return order[:limit] if limit else order, cos


def one_list(lists, cosines):
    place = {}
    for lst in lists:
        for rank, ref in enumerate(lst):
            if ref not in place or rank < place[ref]:
                place[ref] = rank
    return sorted(place, key=lambda r: (place[r], -cosines.get(r, NEG) if cosines.get(r) is not None else float("inf")))


def rank_query(row, rule, cross="rank"):
    lists, cosines = [], {}
    for one in row["lists"]:
        if one["kind"] == "notes":
            order, cos = fuse(one["words"], one["near"], one["discovers"], rule)
            order = [r for r in one["tier"]] + [r for r in order if r not in set(one["tier"])]
            lists.append(order[:10])
            cosines.update({r: c for r, c in cos.items() if r in order[:10] and c is not None})
        else:
            order, cos = fuse(one["words"], one["near"], one["discovers"], rule)
            lists.append(order)
            cosines.update(cos)
    if cross == "rank":
        return one_list(lists, cosines)[:10]
    raise ValueError(cross)


def recall(rows, rule, cross="rank", only=None):
    picked = [r for r in rows if only is None or r["reworded"] == only]
    out = {}
    for k in (1, 5, 10):
        out[k] = sum(len(set(r["sources"]) & set(rank_query(r, rule, cross)[:k])) / len(r["sources"])
                     for r in picked) / len(picked)
    return out, len(picked)


if __name__ == "__main__":
    for path in sys.argv[1:]:
        rows = json.loads(Path(path).read_text())
        same = sum(rank_query(r, "current") == r["final"] for r in rows)
        print(f"{Path(path).parent.name}/{Path(path).name}: replay matches memo on {same}/{len(rows)}")
        for rule in ("current", "sum", "best", "best-q"):
            for only in (None, True) if any(r["reworded"] for r in rows) else (None,):
                rec, n = recall(rows, rule, only=only)
                label = "reworded" if only else "all"
                print(f"  {rule:8} {label:8} n={n:2} @1={rec[1]:.2f} @5={rec[5]:.2f} @10={rec[10]:.2f}")
