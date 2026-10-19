// Reviewing an agent's proposals: the built memo binary stages synthetic findings from `projects evidence` on the
// shared synthetic store, then `projects actions list` is measured with and without context, a cited text is
// changed, and the agent and the owner decide.
//
//   node review.ts <cli-memo checkout with dist/ and node_modules/>
//
// Results: README.md. Nothing here opens the owner's store.
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { seedProjectStore } from "../fixture.ts"

const [memo] = process.argv.slice(2)
if (!memo) throw new Error("usage: node review.ts <cli-memo checkout with dist/>")
const { env, refs, folder } = await seedProjectStore(memo)
const owner = { ...env }
const agent = { ...env, AI_AGENT: "synthetic-reviewer_1_agent" }
const memoJson = (as: NodeJS.ProcessEnv, ...args: string[]) => {
  const out = execFileSync(process.execPath, [join(memo, "dist/bin/memo.js"), ...args, "--json"], {
    env: as,
    encoding: "utf8",
    timeout: 60_000,
  })
  return { answer: JSON.parse(out), bytes: Buffer.byteLength(out) }
}
const fails = (as: NodeJS.ProcessEnv, ...args: string[]) => {
  try {
    memoJson(as, ...args)
    return null
  } catch (error) {
    const text = String((error as { stdout?: string; stderr?: string }).stderr ?? "")
    return /"reason"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? text.split("\n")[0]
  }
}

const source = `telegram:100,email:me@example.com,notes:${folder.id}`
const evidence = memoJson(owner, "projects", "evidence", "HBB", "--source", source, "--context-query", "bank tracker").answer.item
const byRef = new Map(evidence.items.map((item: { ref: string }) => [item.ref, item]))
const cite = (key: string) => {
  const item = byRef.get(refs[key] as string) as { ref: string; fingerprint: string } | undefined
  if (!item) throw new Error(`evidence did not return ${key}`)
  return { reference: item.ref, fingerprint: item.fingerprint }
}
const fact = (id: string, key: string, statement: string) => ({
  id,
  kind: "fact",
  type: "statement",
  statement,
  project: evidence.project_ref,
  evidence: [cite(key)],
})
const right = ["pilot", "accountant", "landing", "tracker"]
const findings = [
  fact("pilot", "t-alias-latin", "The bank pilot starts on Monday"),
  fact("accountant", "t-alias-cyrillic", "The project still needs an accountant"),
  fact("landing", "t-name", "The landing page is live"),
  fact("tracker", "m-tracker", "The bank tracker was updated"),
  fact("cable", "t-alias-noise", "The project bought a cable"),
  fact("sale", "m-newsletter", "The project's cables are on sale"),
]
const file = join(env.HOME, "findings.json")
writeFileSync(file, JSON.stringify({ schema_version: 1, key: "review-1", extractor: "synthetic", findings }))
const staged = memoJson(agent, "projects", "actions", "add", file).answer.item
memoJson(agent, "projects", "key-documents", "add", "HBB", refs["d-method"] as string, "--reason", "the methodology")

const full = memoJson(owner, "projects", "actions", "list", "HBB")
const brief = memoJson(owner, "projects", "actions", "list", "HBB", "--brief")
const batch = full.answer.items.find((one: { kind: string }) => one.kind === "findings")
const contextLines = batch.findings.reduce(
  (sum: number, one: { evidence: { around?: unknown[] }[] }) => sum + (one.evidence[0]?.around?.length ?? 0),
  0,
)

const { openStore } = await import(join(memo, "node_modules/@wirecat/cli-core/dist/store/index.js"))
const store = await openStore({ env })
const [, , account, chat, id] = (refs["t-name"] as string).split(/[:/]/) as string[]
await store.messages.saveMessages({ provider: "telegram", account }, chat, [
  {
    id,
    chatId: chat,
    senderId: "22",
    senderName: "Oleg Sample",
    timestamp: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    editedAt: new Date().toISOString(),
    text: "Harbour Bureau landing page moved",
    outgoing: false,
    attachments: [],
    replyTo: null,
    forwardedFrom: null,
    reactions: null,
  },
], { via: "history" })
await store.close()
const afterEdit = memoJson(owner, "projects", "actions", "list", "HBB", "--brief").answer
const states = afterEdit.items
  .find((one: { kind: string }) => one.kind === "findings")
  .findings.map((one: { id: string; evidence: { state: string }[] }) => `${one.id}:${one.evidence[0]?.state}`)
const staleReason = fails(
  agent,
  "projects",
  "actions",
  "confirm",
  "HBB",
  staged.id,
  ...right,
  "--fingerprint",
  batch.fingerprint,
  "--reason",
  "the texts state them",
)

const fresh = memoJson(owner, "projects", "evidence", "HBB", "--source", source, "--context-query", "bank tracker").answer
  .item
for (const item of fresh.items) byRef.set(item.ref, item)
const restaged = findings.map((one) => ({ ...one, evidence: [cite(Object.keys(refs).find((key) => refs[key] === one.evidence[0]?.reference) as string)] }))
writeFileSync(file, JSON.stringify({ schema_version: 1, key: "review-2", extractor: "synthetic", findings: restaged }))
const second = memoJson(agent, "projects", "actions", "add", file).answer.item
const decided = memoJson(
  agent,
  "projects",
  "actions",
  "confirm",
  "HBB",
  second.id,
  ...right,
  "--fingerprint",
  second.fingerprint,
  "--reason",
  "each text states it about the bureau",
).answer.item
const outcome = Object.fromEntries(decided.receipt.items.map((one: { id: string; status: string }) => [one.id, one.status]))
const firstAgain = fails(owner, "projects", "actions", "reject", "HBB", staged.id, "--fingerprint", batch.fingerprint)

const noReason = fails(agent, "projects", "actions", "confirm", "HBB", `key:${full.answer.items[0].id.slice(4)}`)
const keyDecision = memoJson(
  agent,
  "projects",
  "actions",
  "confirm",
  "HBB",
  full.answer.items[0].id,
  "--reason",
  "it describes how the bureau works",
).answer.item

console.log(
  JSON.stringify(
    {
      memo: execFileSync(process.execPath, [join(memo, "dist/bin/memo.js"), "--version"], { env, encoding: "utf8" }).trim(),
      node: process.version,
      staged: { findings: findings.length, wrong_on_purpose: findings.length - right.length },
      list: {
        items: full.answer.items.length,
        bytes_with_context: full.bytes,
        bytes_brief: brief.bytes,
        neighbour_messages_shown: contextLines,
        bytes_per_finding_with_context: Math.round(full.bytes / findings.length),
        bytes_per_finding_brief: Math.round(brief.bytes / findings.length),
      },
      changed_text: { states_after_edit: states, confirm_refused_as: staleReason },
      restaged_after_edit: {
        findings: restaged.length,
        outcome,
        decided_by: decided.receipt.decision,
        first_batch_still_decidable: firstAgain === null,
        first_batch_refused_as: firstAgain,
      },
      decisions: {
        agent_without_reason: noReason,
        key_document_by_agent: { confirmed: keyDecision.confirmed, decided_by: keyDecision.decided_by },
      },
    },
    null,
    2,
  ),
)
