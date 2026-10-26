import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { closeSync, openSync, readFileSync, writeFileSync } from "node:fs"
import { performance } from "node:perf_hooks"

const [consent, casePath, output, binary] = process.argv.slice(2)
assert.equal(consent, "--live-local")
assert.ok(binary)
const bytes = readFileSync(casePath)
const scenario = JSON.parse(bytes)
assert.ok(scenario.max_profile && scenario.model)
const sha = (value) => createHash("sha256").update(value).digest("hex")
const fd = openSync(output, "wx", 0o600)
const calls = []
const conversations = new Map()
const invoke = (args, operation) => {
  const start = performance.now()
  let raw
  try {
    raw = execFileSync(binary, args, {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 60000,
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    throw new Error(`meaning pilot failed ${error.status ?? "unknown"}; source output withheld`)
  }
  const answer = JSON.parse(raw)
  calls.push({
    operation,
    wall_ms: +(performance.now() - start).toFixed(2),
    run_id: answer.meta?.run_id,
    stdout_bytes: Buffer.byteLength(raw),
  })
  return answer
}
try {
  const runs = []
  for (const question of scenario.questions) {
    const args = [
      scenario.max_profile,
      "search",
      "conversations",
      question.query,
      `--chat=${scenario.scope.chat}`,
      "--filter",
      `date:["${scenario.scope.since}" TO "${scenario.scope.before}"]`,
      "--provider",
      "local",
      "--model",
      scenario.model,
      "--limit",
      String(scenario.k),
      "--json",
      "--offline",
    ]
    const answer = invoke(args, "search")
    const rows = []
    for (const [index, hit] of answer.items.entries()) {
      const id = hit.summary.id
      assert.equal(hit.source.provider, "max")
      assert.equal(hit.source.account, scenario.scope.expected_account.split(":")[1])
      assert.equal(hit.summary.chat_id, scenario.scope.chat)
      if (!conversations.has(id)) {
        const found = invoke([scenario.max_profile, "conversations", "show", id, "--json", "--offline"], "expand")
        conversations.set(id, found.item.messages)
      }
      const messages = conversations.get(id)
      const first = messages.findIndex((m) => m.id === hit.chunk.first_message_id)
      const last = messages.findIndex((m) => m.id === hit.chunk.last_message_id)
      assert.ok(first >= 0 && last >= first)
      const chunk = messages.slice(first, last + 1)
      const anchors = messages.filter((m) => question.anchors.includes(m.id))
      const row = {
        rank: index + 1,
        conversation: id,
        locator: hit.locator,
        by: hit.by,
        score: hit.score,
        stale: hit.stale,
        message_refs: messages.map((m) => m.ref),
        chunk_refs: chunk.map((m) => m.ref),
        reply_edges: messages.filter((m) => m.reply_to_id).map((m) => ({ from: m.id, to: m.reply_to_id })),
        anchor_ids: anchors.map((m) => m.id),
        chunk_anchor_ids: chunk.filter((m) => question.anchors.includes(m.id)).map((m) => m.id),
        chunk_text_sha256: sha(chunk.map((m) => m.text).join("\n")),
        chunk_text_bytes: Buffer.byteLength(chunk.map((m) => m.text).join("\n")),
        conversation_text_bytes: Buffer.byteLength(messages.map((m) => m.text).join("\n")),
      }
      rows.push(row)
      process.stdout.write(
        `${JSON.stringify({
          question: question.id,
          rank: row.rank,
          conversation: id,
          by: row.by,
          anchor_ids: row.anchor_ids,
          chunk_text: chunk
            .map((m) => m.text)
            .join("\n")
            .slice(0, 1100),
          anchor_texts: anchors.map((m) => ({ ref: m.ref, text: m.text.slice(0, 1000) })),
        })}\n`,
      )
    }
    runs.push({ question: question.id, args, meta: answer.meta, missing: answer.missing ?? [], rows })
  }
  writeFileSync(
    fd,
    `${JSON.stringify(
      {
        created_at: new Date().toISOString(),
        case_sha256: sha(bytes),
        runner_sha256: sha(readFileSync(new URL(import.meta.url))),
        model: scenario.model,
        calls,
        runs,
        expanded_conversations: conversations.size,
        raw_bodies_saved: false,
        qualification:
          "Hybrid conversation retrieval with local embeddings, not pure vector-only retrieval. Compare both chunk and expanded-conversation anchor coverage; units differ from message top-k.",
      },
      null,
      2,
    )}\n`,
  )
} finally {
  closeSync(fd)
}
