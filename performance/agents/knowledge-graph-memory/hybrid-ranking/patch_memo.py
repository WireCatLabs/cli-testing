"""Copy an installed memo package and patch its bundled cli-core: `--debug` dumps each source's words and meaning
lists (for capture.py), `--fix` applies the ranking change of cli-core fix/hybrid-ranking-paraphrase.

    python3 patch_memo.py ~/.nvm/versions/node/v24.19.0/lib/node_modules/@wirecat/cli-memo /tmp/memo-fix --fix

Written against memo 0.131.47 (cli-core 0.599.0 bundled); each replacement must match exactly once or it stops.
"""

import argparse
import shutil
from pathlib import Path

DEBUG = [
    ("    const fused2 = /* @__PURE__ */ new Map();\n",
     ('    if (process.env.HYB_DEBUG) (await import("node:fs")).appendFileSync(process.env.HYB_DEBUG, JSON.stringify({ '
     "q: request.text, kind, discovers, words: byWords.map((i) => i.ref), near: near2.map((h) => [h.locator, "
     'Number(h.cosine.toFixed(4))]), ranked: lane.ranked.length }) + "\\n");\n'
     "    const fused2 = /* @__PURE__ */ new Map();\n")),
    ("  const ranked = /* @__PURE__ */ new Map();\n  const add = /* @__PURE__ */ __name((list3, by) =>",
     ('  if (process.env.HYB_DEBUG) (await import("node:fs")).appendFileSync(process.env.HYB_DEBUG, JSON.stringify({ '
     'q: query, kind: "notes", discovers: lookup2 !== void 0, tier: tier.map((t) => t.note.title), words: '
     "matched.items.map((t) => t.note.title), near: (meaning ?? []).map((t) => [t.note.title, cosines.get(t.ref)]) "
     '}) + "\\n");\n'
     "  const ranked = /* @__PURE__ */ new Map();\n  const add = /* @__PURE__ */ __name((list3, by) =>")),
]

FIX = [
    ("""      if (held && discovers)
        return;
      fused2.set(hit.locator, {
        item: held?.item ?? itemOf3(hit, ["meaning"]),
        score: (held?.score ?? 0) + 1 / (RRF_K3 + rank + 1)
      });""",
     """      const vote = 1 / (RRF_K3 + rank + 1);
      if (held && discovers)
        held.score = Math.max(held.score, vote);
      else
        fused2.set(hit.locator, { item: held?.item ?? itemOf3(hit, ["meaning"]), score: (held?.score ?? 0) + vote });\
"""),
    ("""    if (by === "meaning" && lookup2 !== void 0 && held.foundBy.includes("words"))
      return;
    held.score += 1 / (RRF_K3 + rank + 1);""",
     """    const vote = 1 / (RRF_K3 + rank + 1);
    if (by === "meaning" && lookup2 !== void 0 && held.foundBy.includes("words"))
      held.score = Math.max(held.score, vote);
    else
      held.score += vote;"""),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("package", type=Path, help="the installed @wirecat/cli-memo folder")
    parser.add_argument("output", type=Path, help="new folder for the patched copy")
    parser.add_argument("--debug", action="store_true")
    parser.add_argument("--fix", action="store_true")
    args = parser.parse_args()
    shutil.copytree(args.package, args.output, symlinks=True)
    chunks = [p for p in (args.output / "dist/bundle").glob("*.js") if "held && discovers" in p.read_text()]
    if len(chunks) != 1:
        raise SystemExit(f"expected one bundle chunk with the fusion, found {len(chunks)}")
    text = chunks[0].read_text()
    for old, new in (DEBUG if args.debug else []) + (FIX if args.fix else []):
        if text.count(old) != 1:
            raise SystemExit(f"no single match for: {old[:60]!r}")
        text = text.replace(old, new)
    chunks[0].write_text(text)
    print(args.output / "dist/bin/memo.js")


if __name__ == "__main__":
    main()
