#!/usr/bin/env node
// Asks one contestant the questions, one fresh `claude -p` session per question, with the same model, prompt, tools and
// limits for every contestant. Each contestant's own `hubspot` is a wrapper in RUN/<id>/bin made by its setup script.
// Usage: node run.mjs <a|b|c> <questions.md> [--only Q1,Q2] [--label baseline]
// Writes RUN/runs/<label>/<id>/: <qid>.jsonl (the transcript), status.csv (one row per question; a rerun skips the
// rows marked done), answers.md (the sheet for score.sh). Transcripts stay outside git.
import { spawn } from "node:child_process"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

const say = (line) => process.stdout.write(`${line}\n`)
const warn = (line) => process.stderr.write(`${line}\n`)
const RUN = process.env.HUBSPOT_AGENTS_RUN ?? join(homedir(), ".cache/wirecat-hubspot-agents")
const MODEL = process.env.ASK_MODEL ?? "claude-sonnet-5-5"
const TIMEOUT_MS = 15 * 60_000

const [who, questionsFile, ...rest] = process.argv.slice(2)
const flag = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined)
const only = flag("--only")?.split(",")
const label = flag("--label") ?? "baseline"

const SHELL_TOOLS = ["Bash(hubspot:*)", "Bash(jq:*)", "Bash(head:*)", "Bash(sort:*)", "Bash(wc:*)", "Read", "Skill"]
const contestants = {
  a: {
    access:
      "The user's HubSpot account is available through the `hubspot` command line tool, profile `test` " +
      "(start with: hubspot test --help).",
    tools: SHELL_TOOLS,
  },
  b: {
    access:
      "The user's HubSpot account is available through the `hubspot` command line tool (start with: hubspot --help).",
    tools: SHELL_TOOLS,
  },
  c: {
    access: "The user's HubSpot account is available through the HubSpot MCP tools.",
    tools: ["mcp__hubspot", "Read", "Skill"],
    extra: ["--mcp-config", join(RUN, "c/mcp.json"), "--strict-mcp-config"],
  },
}
const contestant = contestants[who]
if (!contestant || !questionsFile) {
  warn("usage: node run.mjs <a|b|c> <questions.md> [--only Q1,Q2] [--label baseline]")
  process.exit(2)
}

const rules = `Today is Monday 2026-11-23. Answer the user's request about their own HubSpot CRM. Use only the tools you
are given. Name the records (deal, contact, company, note, task, meeting) your answer comes from. If the CRM does not
hold the answer, say so; never guess. When the user asks you to change something in the CRM, do it: nobody is there to
confirm, and the user allows these changes.`

const questions = readFileSync(resolve(questionsFile), "utf8")
  .split("\n")
  .map((line) => /^([QVW]\d+):\s*(.+)$/.exec(line.trim()))
  .filter(Boolean)
  .map(([, id, text]) => ({ id, text }))
  .filter((q) => !only || only.includes(q.id))

const out = join(RUN, "runs", label, who)
const work = join(RUN, who, "agent")
mkdirSync(out, { recursive: true })
mkdirSync(work, { recursive: true })
const statusCsv = join(out, "status.csv")
if (!existsSync(statusCsv)) writeFileSync(statusCsv, "id,status,detail,time\n")
const doneIds = new Set(
  readFileSync(statusCsv, "utf8")
    .split("\n")
    .filter((l) => l.split(",")[1] === "done")
    .map((l) => l.split(",")[0]),
)
say(`status: ${statusCsv}`)

// The child must not join this session: drop the variables that tie a process to a running Claude Code.
const childEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) =>
      !/^(CLAUDECODE|CLAUDE_CODE_(SESSION|MESSAGING|CHILD|ENTRYPOINT|PLUGIN_DIRS|SESSION_ATTENDED)|CLAUDE_PID|AI_AGENT)/.test(
        name,
      ),
  ),
)
childEnv.PATH = `${join(RUN, who, "bin")}:${process.env.PATH}`
// The owner's own CLAUDE.md would give every contestant his house rules and his context; the test gives none.
childEnv.CLAUDE_CODE_DISABLE_CLAUDE_MDS = "1"

const ask = (q) =>
  new Promise((done) => {
    const started = Date.now()
    const transcript = join(out, `${q.id}.jsonl`)
    const args = [
      "-p",
      `${contestant.access}\n\n${rules}\n\n${q.text}`,
      "--model",
      MODEL,
      "--output-format",
      "stream-json",
      "--verbose",
      "--no-session-persistence",
      "--setting-sources",
      "project",
      "--allowedTools",
      ...contestant.tools,
      ...(contestant.extra ?? []),
    ]
    const child = spawn("claude", args, { cwd: work, env: childEnv, stdio: ["ignore", "pipe", "pipe"] })
    const chunks = []
    child.stdout.on("data", (chunk) => chunks.push(chunk))
    child.stderr.on("data", (chunk) => chunks.push(chunk))
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS)
    child.on("close", (code) => {
      clearTimeout(timer)
      const text = Buffer.concat(chunks).toString("utf8")
      writeFileSync(transcript, text)
      const events = text.split("\n").flatMap((line) => {
        try {
          return [JSON.parse(line)]
        } catch {
          return []
        }
      })
      const result = events.findLast((e) => e.type === "result")
      const calls = events
        .filter((e) => e.type === "assistant")
        .flatMap((e) => e.message?.content ?? [])
        .filter((c) => c.type === "tool_use")
      done({
        id: q.id,
        code,
        seconds: Math.round((Date.now() - started) / 1000),
        cost: result?.total_cost_usd ?? null,
        turns: result?.num_turns ?? null,
        toolCalls: calls.length,
        denied: result?.permission_denials?.length ?? 0,
        answer: result?.result ?? `(no answer: exit ${code})`,
        error: result?.is_error ?? code !== 0,
      })
    })
  })

const results = join(out, "results.jsonl")
for (const q of questions) {
  if (doneIds.has(q.id)) continue
  const r = await ask(q)
  appendFileSync(results, `${JSON.stringify(r)}\n`)
  appendFileSync(
    statusCsv,
    `${q.id},${r.error ? "failed" : "done"},${r.seconds}s ${r.toolCalls} calls $${r.cost ?? "?"} denied ${r.denied},${new Date().toISOString()}\n`,
  )
  say(`${who} ${q.id}: ${r.seconds}s, ${r.toolCalls} tool calls, $${r.cost ?? "?"}, denied ${r.denied}`)
}

// The sheet holds the last answer to each question, without the contestant's name.
const latest = new Map()
for (const line of readFileSync(results, "utf8").trim().split("\n")) {
  const r = JSON.parse(line)
  latest.set(r.id, r)
}
const order = (id) => ({ Q: 0, V: 1, W: 2 })[id[0]] * 100 + Number(id.slice(1))
writeFileSync(
  join(out, "answers.md"),
  [...latest.values()]
    .sort((x, y) => order(x.id) - order(y.id))
    .map((r) => `## ${r.id}\n\n${r.answer.trim()}\n`)
    .join("\n"),
)
say(`answers: ${join(out, "answers.md")}`)
