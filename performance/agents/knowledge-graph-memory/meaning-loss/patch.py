"""Instrument the copied memo 0.131.50 bundle: trace each lane to SPIKE_TRACE, and env toggles for the experiments."""
from pathlib import Path

F = Path(__file__).resolve().parent / "memo-pkg/node_modules/@wirecat/cli-memo/dist/bundle/chunk-4VQPPX47.js"
src = F.read_text()
T = 'process.getBuiltinModule("node:fs").appendFileSync(process.env.SPIKE_TRACE, JSON.stringify(%s) + "\\n")'


def sub(old, new, count=1):
    global src
    assert src.count(old) == count, (old, src.count(old))
    src = src.replace(old, new)


# mail lane: words list, meaning list, fused list
sub('    const byWords = found.items.map((hit) => itemOf3(hit, ["words"]));\n',
    '    const byWords = found.items.map((hit) => itemOf3(hit, ["words"]));\n'
    '    if (process.env.SPIKE_TRACE) ' + T % '{ lane: kind, step: "words", discovers, list: byWords.map((i) => i.title) }' + ';\n')
sub('    const near2 = await nearEligible(store, account, query, messenger, lane.ranked, filters ? { text: filters } : {});\n',
    '    const near2 = (await nearEligible(store, account, query, messenger, lane.ranked, filters ? { text: filters } : {}))'
    '.slice(0, Number(process.env.SPIKE_MAIL_DEPTH ?? Infinity));\n'
    '    if (process.env.SPIKE_TRACE) ' + T % '{ lane: kind, step: "meaning", list: near2.map((h) => [h.chatTitle, h.cosine]), ranked: lane.ranked.length }' + ';\n')
sub('      if (held && discovers)\n        held.score = Math.max(held.score, vote);\n      else\n        fused2.set(',
    '      if (held && discovers && !process.env.SPIKE_SUM)\n        held.score = Math.max(held.score, vote);\n      else\n        fused2.set(')
sub('    return [...fused2.values()].sort((a, b) => b.score - a.score).map(({ item: item2 }) => item2);\n',
    '    const fusedOut = [...fused2.values()].sort((a, b) => b.score - a.score).map(({ item: item2 }) => item2);\n'
    '    if (process.env.SPIKE_TRACE) ' + T % '{ lane: kind, step: "fused", list: fusedOut.map((i) => i.title) }' + ';\n'
    '    return fusedOut;\n')
# notes lane: floor toggle, words, meaning, fused
sub('  return nearest.filter(({ score }) => score > floor);\n}, "nearestNotes");',
    '  return nearest.filter(({ score }) => score > Number(process.env.SPIKE_FLOOR ?? floor));\n}, "nearestNotes");')
sub('    if (by === "meaning" && lookup2 !== void 0 && held.foundBy.includes("words"))\n',
    '    if (by === "meaning" && lookup2 !== void 0 && held.foundBy.includes("words") && !process.env.SPIKE_SUM)\n')
sub('  const page = slice ? ordered : ordered.slice(offset, window3);\n',
    '  if (process.env.SPIKE_TRACE) ' + T % '{ lane: "notes", step: "words", list: matched.items.map((i) => i.note.title) }' + ';\n'
    '  if (process.env.SPIKE_TRACE) ' + T % '{ lane: "notes", step: "meaning", list: (meaning ?? []).map((i) => [i.note.title, cosines.get(i.ref)]), skipped: meaningSkipped ?? null, tier: tier.length }' + ';\n'
    '  if (process.env.SPIKE_TRACE) ' + T % '{ lane: "notes", step: "fused", list: ordered.map(([, v]) => v.note.title) }' + ';\n'
    '  const page = slice ? ordered : ordered.slice(offset, window3);\n')
# mail lane query text: the question as typed instead of the picture-search word cleaner
sub('  const words4 = plainWords(question);\n',
    '  const notesWords = () => { try { return meaningWords(parsedQuery(questionLookup(question) === void 0 ? question : questionText(question), false)); } catch { return plainWords(question); } };\n'
    '  const words4 = process.env.SPIKE_MAILQ === "notes" ? notesWords() : process.env.SPIKE_MAILQ ? question.trim() : plainWords(question);\n')
# the merge across sources
sub('  const ordered = oneList(lists, cosines);\n',
    '  const ordered = (process.env.SPIKE_MERGE === "cosine" ? byCosine : oneList)(lists, cosines);\n')
sub('var oneList = /* @__PURE__ */ __name((lists, cosines) => {',
    '''var byCosine = (lists, cosines) => {
  const place = new Map();
  const given = new Map();
  for (const list3 of lists) {
    const known = list3.map((item2) => cosines.get(item2.ref));
    list3.forEach((item2, rank) => {
      let c = known[rank];
      if (c === void 0 && process.env.SPIKE_WORDS === "above") for (let r = rank - 1; r >= 0 && c === void 0; r--) c = known[r];
      if (c === void 0 && process.env.SPIKE_WORDS === "below") for (let r = rank + 1; r < known.length && c === void 0; r++) c = known[r];
      const held = place.get(item2.ref);
      if (!held || rank < held.rank) { place.set(item2.ref, { item: item2, rank }); if (c !== void 0) given.set(item2.ref, c); }
    });
  }
  const head = Number(process.env.SPIKE_HEAD ?? 0);
  const cos = (ref) => given.get(ref) ?? Number.NEGATIVE_INFINITY;
  const tier = (x) => Math.min(x.rank, head);
  return [...place.values()].sort((a, b) => tier(a) - tier(b) || cos(b.item.ref) - cos(a.item.ref) || a.rank - b.rank).map(({ item: item2 }) => item2);
};
var oneList = /* @__PURE__ */ __name((lists, cosines) => {''')
F.write_text(src)
print("patched")
