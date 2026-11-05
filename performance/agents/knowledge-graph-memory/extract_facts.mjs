// ANTHROPIC_API_KEY=… node extract_facts.mjs <folder with @anthropic-ai/sdk> <run.py fixture> <facts.json>
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"

const [deps, fixture, cache] = process.argv.slice(2)
if (!deps || !fixture || !cache) throw new Error("usage: node extract_facts.mjs <deps folder> <fixture> <facts.json>")
const MODEL = "claude-haiku-5-5"
// List price for prompts up to 100,000 tokens, https://platform.claude.com/docs/en/about-claude/pricing (2026-11-03).
const USD_PER_MTOK = { input: 0.1, output: 0.5 }
const BATCH = 25
const PARALLEL = 4
const PROMPT =
  "Rewrite each record into 1–3 short standalone facts. Keep names, dates and values exactly. " +
  "Answer with every record id given, each exactly once."
const SCHEMA = {
  type: "object",
  properties: {
    records: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, facts: { type: "array", items: { type: "string" } } },
        required: ["id", "facts"],
        additionalProperties: false,
      },
    },
  },
  required: ["records"],
  additionalProperties: false,
}

const records = readFileSync(join(fixture, "corpus.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line))
const cached = existsSync(cache) ? JSON.parse(readFileSync(cache, "utf8")) : null
const state = cached ?? {
  model: MODEL,
  prompt: PROMPT,
  batch: BATCH,
  usage: { calls: 0, input_tokens: 0, output_tokens: 0 },
  facts: {},
}
const save = () => {
  const { input_tokens, output_tokens } = state.usage
  state.costUsd = (input_tokens * USD_PER_MTOK.input + output_tokens * USD_PER_MTOK.output) / 1e6
  writeFileSync(cache, `${JSON.stringify(state, null, 2)}\n`)
}

// Short local names keep the model's echo exact; the corpus ids hold slashes and percent signs.
const nameOf = (index) => `r${String(index + 1).padStart(4, "0")}`
const todo = records.map((_, index) => index).filter((index) => !state.facts[records[index].id])
const batches = []
for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH))
if (!batches.length) {
  process.stderr.write(`facts: all ${records.length} records already in ${cache}, nothing to call\n`)
  process.exit(0)
}
if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set")

const sdk = await import(createRequire(join(deps, "package.json")).resolve("@anthropic-ai/sdk"))
const Anthropic = sdk.default?.default ?? sdk.default
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const extract = async (batch) => {
  const input = batch.map((index) => ({ id: nameOf(index), text: records[index].text }))
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: PROMPT,
    messages: [{ role: "user", content: JSON.stringify(input) }],
  })
  state.usage.calls += 1
  state.usage.input_tokens += response.usage.input_tokens
  state.usage.output_tokens += response.usage.output_tokens
  const text = response.content.find((block) => block.type === "text")?.text
  if (response.stop_reason !== "end_turn" || !text) throw new Error(`stop_reason ${response.stop_reason}`)
  const answer = new Map(JSON.parse(text).records.map((row) => [row.id, row.facts]))
  const wrong = batch.filter((index) => {
    const facts = answer.get(nameOf(index))
    return !facts || facts.length < 1 || facts.length > 3 || facts.some((fact) => !fact.trim())
  })
  if (answer.size !== batch.length || wrong.length)
    throw new Error(`ids or fact counts off for ${wrong.length} records`)
  for (const index of batch) state.facts[records[index].id] = answer.get(nameOf(index))
}

let failed = 0
const queue = [...batches]
const worker = async () => {
  for (let batch = queue.shift(); batch; batch = queue.shift()) {
    try {
      await extract(batch).catch(() => extract(batch))
    } catch (error) {
      failed += 1
      // Status and type only: an error body is never printed, so nothing can echo a credential.
      process.stderr.write(`facts: batch from ${nameOf(batch[0])} failed: ${error?.status ?? ""} ${error?.name}\n`)
      // A refused key or request fails every batch the same way; stop before spending anything else.
      if ([400, 401, 403].includes(error?.status)) queue.length = 0
    }
    save()
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker))
save()
const done = Object.keys(state.facts).length
process.stderr.write(
  `facts: ${done} of ${records.length} records, ${state.usage.calls} calls, ` +
    `${state.usage.input_tokens} input + ${state.usage.output_tokens} output tokens, $${state.costUsd.toFixed(4)}\n`,
)
if (failed || done !== records.length) process.exit(1)
