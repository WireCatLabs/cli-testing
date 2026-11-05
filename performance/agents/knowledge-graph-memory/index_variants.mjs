// node index_variants.mjs <@wirecat/cli-core package folder> <run.py fixture folder> <new output folder> [facts.json]
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { cpus, platform, release, totalmem } from "node:os"
import { dirname, join } from "node:path"
import { performance } from "node:perf_hooks"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath, pathToFileURL } from "node:url"

const [pkg, fixture, output, factsPath] = process.argv.slice(2)
if (!pkg || !fixture || !output) throw new Error("usage: node index_variants.mjs <cli-core package> <fixture> <output>")
mkdirSync(output)
const here = dirname(fileURLToPath(import.meta.url))
const load = (path) => import(pathToFileURL(join(pkg, "dist", path)).href)
const { downloadTextModel } = await load("services/model-downloads.js")
const { openEmbedder } = await load("embeddings/embed.js")
const { meaningFloor, textModel, vectorModelKey } = await load("embeddings/models.js")
const { onnxRuntime } = await load("embeddings/onnx-runtime.js")
const tokenizers = await import(createRequire(join(pkg, "package.json")).resolve("@huggingface/tokenizers"))
const { Tokenizer } = tokenizers.default ?? tokenizers

// The keyword rewrite and the scorer are memo_baseline.py's own functions, so these rows compare with its rows.
const python = (code, input) => {
  const done = spawnSync("python3", ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(here)})\n${code}`], {
    input: JSON.stringify(input),
    encoding: "utf8",
  })
  if (done.status !== 0) throw new Error(done.stderr)
  return JSON.parse(done.stdout)
}

const corpusText = readFileSync(join(fixture, "corpus.jsonl"), "utf8")
const records = corpusText
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line))
const queries = JSON.parse(readFileSync(join(fixture, "queries.json"), "utf8"))
const oracle = JSON.parse(readFileSync(join(fixture, "oracle.json"), "utf8"))
const keywords = python(
  "import json, memo_baseline as m; print(json.dumps([m.or_query(q) for q in json.load(sys.stdin)]))",
  queries.map((q) => q.question),
)
const asked = { typed: queries.map((q) => q.question), keywords }

// A project's eight records form one group, as a thread would; the archive filler is cut into runs of eight.
const GROUP_SIZE = 8
const projects = python("import json, run; print(json.dumps(run.PROJECTS))", null)
const groups = []
const byProject = new Map()
let filler = []
for (const [index, record] of records.entries()) {
  const project = projects.find((name) => record.text.includes(name))
  if (project) byProject.set(project, [...(byProject.get(project) ?? []), index])
  else {
    filler.push(index)
    if (filler.length === GROUP_SIZE) {
      groups.push(filler)
      filler = []
    }
  }
}
if (filler.length) groups.push(filler)
groups.push(...byProject.values())
if (byProject.size !== 10 || [...byProject.values()].some((members) => members.length !== GROUP_SIZE))
  throw new Error("expected ten projects of eight records each")
for (const members of groups) members.sort((a, b) => a - b)
const groupText = (members) => members.map((index) => records[index].text).join("\n")

const timings = {}
const timed = async (name, work) => {
  const started = performance.now()
  const value = await work()
  timings[name] = (performance.now() - started) / 1000
  return value
}

const fts = await timed("bm25_build_s", () => {
  const db = new DatabaseSync(":memory:")
  db.exec("CREATE VIRTUAL TABLE r USING fts5(text)")
  const insert = db.prepare("INSERT INTO r(rowid, text) VALUES (?, ?)")
  for (const [index, record] of records.entries()) insert.run(index + 1, record.text)
  return db
})
const wordQuery = fts.prepare("SELECT rowid FROM r WHERE r MATCH ? ORDER BY bm25(r), rowid")
const wordRanks = keywords.map((query) => wordQuery.all(query).map((row) => Number(row.rowid) - 1))

// Arm 5: extract_facts.mjs's cache. Each fact keeps its record; a hit on a fact counts as its record, once.
const extracted = factsPath ? JSON.parse(readFileSync(factsPath, "utf8")) : null
const recordOf = new Map(records.map((record, index) => [record.id, index]))
const facts = extracted
  ? Object.entries(extracted.facts).flatMap(([id, texts]) => texts.map((text) => ({ record: recordOf.get(id), text })))
  : []
if (extracted && new Set(facts.map((fact) => fact.record)).size !== records.length)
  throw new Error("the facts file must cover every record of this fixture")
const toRecords = (factIndexes) => [...new Set(factIndexes.map((index) => facts[index].record))]
const factWordRanks = extracted
  ? await timed("facts_bm25_build_s", () => {
      const db = new DatabaseSync(":memory:")
      db.exec("CREATE VIRTUAL TABLE f USING fts5(text)")
      const insert = db.prepare("INSERT INTO f(rowid, text) VALUES (?, ?)")
      for (const [index, fact] of facts.entries()) insert.run(index + 1, fact.text)
      const query = db.prepare("SELECT rowid FROM f WHERE f MATCH ? ORDER BY bm25(f), rowid")
      return keywords.map((words) => toRecords(query.all(words).map((row) => Number(row.rowid) - 1)))
    })
  : []

const dot = (a, b) => {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}
const ranked = (vector, vectors) =>
  vectors
    .map((other, index) => ({ index, score: dot(vector, other) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
const fuse = (...lists) => {
  const score = new Map()
  for (const list of lists)
    for (const [rank, index] of list.entries()) score.set(index, (score.get(index) ?? 0) + 1 / (60 + rank + 1))
  return [...score.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([index]) => index)
}
const expand = (hits) => [...new Set(hits.flatMap(({ index }) => groups[index]))]

const runs = {}
const add = (label, list) => {
  runs[label] = list.map((hits, i) => ({
    id: queries[i].id,
    query: label.endsWith("keywords") ? keywords[i] : queries[i].question,
    hits: hits.slice(0, 10).map((index) => records[index].id),
    seconds: 0,
    complete: true,
  }))
}
add("BM25 alone, keywords", wordRanks)

const models = {}
for (const id of ["e5-small", "embeddinggemma"]) {
  const model = textModel(id)
  // Same as `memo models download embeddinggemma --accept-terms`: the owner asked for this model by name.
  const { directory } = await timed(`${id}_download_s`, () =>
    downloadTextModel(id, {
      env: process.env,
      acceptTerms: true,
      progress: (line) => process.stderr.write(`${line}\n`),
    }),
  )
  const embedder = await timed(`${id}_open_s`, () => openEmbedder(model, directory))
  const recordVectors = await timed(`${id}_records_embed_s`, () =>
    embedder.embed(
      records.map((r) => r.text),
      "passage",
    ),
  )
  const groupVectors = await timed(`${id}_groups_embed_s`, () => embedder.embed(groups.map(groupText), "passage"))
  const factVectors = extracted
    ? await timed(`${id}_facts_embed_s`, () =>
        embedder.embed(
          facts.map((fact) => fact.text),
          "passage",
        ),
      )
    : []
  const queryVectors = {}
  for (const [form, texts] of Object.entries(asked))
    queryVectors[form] = await timed(`${id}_${form}_queries_embed_s`, () => embedder.embed(texts, "query"))
  await embedder.close()
  const floor = meaningFloor(vectorModelKey(model))
  const file = (name) => JSON.parse(readFileSync(join(directory, model.id, name), "utf8"))
  const tokenizer = new Tokenizer(file("tokenizer.json"), file("tokenizer_config.json"))
  const tokens = groups.map((members) => tokenizer.encode(`${model.prefix.passage}${groupText(members)}`).ids.length)
  models[id] = {
    dims: model.dims,
    floor,
    maxTokens: model.maxTokens,
    groupTokensMax: Math.max(...tokens),
    groupsOverLimit: tokens.filter((n) => n > model.maxTokens).length,
  }

  for (const [form, vectors] of Object.entries(queryVectors)) {
    const meaning = vectors.map((vector) => ranked(vector, recordVectors))
    const grouped = vectors.map((vector) => expand(ranked(vector, groupVectors)))
    if (floor > 0)
      add(
        `${id}, records, floor ${floor}, ${form}`,
        meaning.map((hits) => hits.filter((hit) => hit.score >= floor).map((hit) => hit.index)),
      )
    add(
      `${id}, records, ${form}`,
      meaning.map((hits) => hits.map((hit) => hit.index)),
    )
    add(
      `${id}, records + BM25, ${form}`,
      meaning.map((hits, i) =>
        fuse(
          hits.map((hit) => hit.index),
          wordRanks[i],
        ),
      ),
    )
    add(`${id}, groups of ${GROUP_SIZE}, ${form}`, grouped)
    if (extracted) {
      const byFact = vectors.map((vector) => toRecords(ranked(vector, factVectors).map((hit) => hit.index)))
      add(`${id}, facts, ${form}`, byFact)
      add(
        `${id}, facts + BM25, ${form}`,
        byFact.map((hits, i) => fuse(hits, factWordRanks[i])),
      )
    }
    add(
      `${id}, groups of ${GROUP_SIZE} + BM25, ${form}`,
      grouped.map((hits, i) => fuse(hits, wordRanks[i])),
    )
  }
}

const scores = python(
  "import json, memo_baseline as m\nruns, oracle = json.load(sys.stdin)\n" +
    "print(json.dumps([m.score_run(label, rows, oracle) for label, rows in runs.items()]))",
  [runs, oracle],
)
const results = {
  at: new Date().toISOString(),
  machine: {
    cpu: cpus()[0]?.model,
    threads: cpus().length,
    ramGiB: totalmem() / 2 ** 30,
    os: `${platform()} ${release()}`,
  },
  node: process.version,
  cliCore: JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")).version,
  nativeOnnx: (await onnxRuntime()).native,
  corpusSha256: createHash("sha256").update(corpusText).digest("hex"),
  records: records.length,
  groups: { total: groups.length, size: GROUP_SIZE, projects: byProject.size },
  models,
  facts: extracted && {
    model: extracted.model,
    facts: facts.length,
    usage: extracted.usage,
    costUsd: extracted.costUsd,
  },
  timings,
  scores: scores.map(({ p50_s: _p50, p95_s: _p95, ...row }) => row),
}
writeFileSync(join(output, "results.json"), `${JSON.stringify(results, null, 2)}\n`)
writeFileSync(join(output, "per-query.json"), `${JSON.stringify(runs, null, 2)}\n`)
const lines = results.scores.map(
  (row) => `| ${row.run} | ${[1, 5, 10].map((k) => row[`recall@${k}`].toFixed(2)).join(" | ")} |`,
)
process.stdout.write(`| Run | Recall@1 | Recall@5 | Recall@10 |\n|---|---:|---:|---:|\n${lines.join("\n")}\n`)
