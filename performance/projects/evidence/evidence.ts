// Project evidence against a frozen baseline: a synthetic store seeded through a build's store module, then the
// built memo binary's `projects evidence --json`, scored against baseline.json: first with --no-catch-up on the
// fresh store, then by default, which fills the search index before reading.
//
//   node evidence.ts <cli-memo checkout with dist/ and node_modules/>
//
// Results: README.md. Nothing here opens the owner's store.
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const [memo] = process.argv.slice(2)
if (!memo) throw new Error("usage: node evidence.ts <cli-memo checkout with dist/>")
const { openStore } = await import(join(memo, "node_modules/@wirecat/cli-core/dist/store/index.js"))
const baseline = JSON.parse(readFileSync(new URL("baseline.json", import.meta.url), "utf8"))

const home = mkdtempSync(join(tmpdir(), "project-evidence-"))
const env = {
  PATH: process.env.PATH ?? "",
  HOME: home,
  XDG_CONFIG_HOME: join(home, "config"),
  XDG_DATA_HOME: join(home, "data"),
  XDG_CACHE_HOME: join(home, "cache"),
  XDG_STATE_HOME: join(home, "state"),
  MESSAGING_STORE: join(home, "store.db"),
}
const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()
const telegram = { provider: "telegram", account: "100" }
const message = (id: string, chatId: string, sender: string, text: string, days: number) => ({
  id,
  chatId,
  senderId: sender === "Rita Example" ? "21" : "22",
  senderName: sender,
  timestamp: ago(days),
  editedAt: null,
  text,
  outgoing: false,
  attachments: [],
  replyTo: null,
  forwardedFrom: null,
  reactions: null,
})

const refs: Record<string, string> = {}
const store = await openStore({ env })
const core = [
  ["t-alias-latin", "1", "HBB pilot with the bank starts on Monday", 5],
  ["t-alias-cyrillic", "2", "Бухгалтера для Харбор всё ещё ищем", 4],
  ["t-name", "3", "Harbour Bureau landing page is live", 3],
  ["t-reply", "4", "Ok, I will check it tomorrow", 3],
  ["t-alias-noise", "5", "Bought an HBB cable for the TV", 2],
  ["t-old", "6", "Harbour Bureau founding call notes", 200],
] as const
await store.messages.saveMessages(
  telegram,
  "10",
  core.map(([, id, text, days]) => message(id, "10", "Oleg Sample", text, days)),
  { via: "history" },
)
for (const [key, id] of core) refs[key] = `msg:telegram/100/10/${id}`
await store.messages.saveMessages(
  telegram,
  "20",
  [message("7", "20", "Rita Example", "Rita Example here, sending the tracker you asked for", 2)],
  {
    via: "history",
  },
)
refs["t-rita-dm"] = "msg:telegram/100/20/7"
await store.messages.saveMessages(
  telegram,
  "30",
  [message("8", "30", "Rita Example", "Rita Example will water the garden plan", 1)],
  {
    via: "history",
  },
)
refs["t-rita-garden"] = "msg:telegram/100/30/8"

const mailId = await store.accounts.saveAccount({ provider: "email", account: "me@example.com" }, { name: "Me" })
const email = (thread: string, id: string, subject: string, body: string, days: number) =>
  store.mail.saveThread({
    accountId: mailId,
    externalId: thread,
    now: Date.now(),
    emails: [
      {
        externalId: id,
        subject,
        from: { address: "sender@example.com", name: null },
        to: [{ address: "me@example.com", name: null }],
        cc: [],
        sentAt: Date.parse(ago(days)),
        receivedAt: Date.parse(ago(days)),
        references: [],
        bodyText: body,
        outgoing: false,
        read: true,
        mailboxes: [{ externalId: "INBOX", name: "INBOX", kind: null }],
      },
    ],
  })
await email("th1", "e1", "Bank tracker", "The bank tracker for HBB is updated", 6)
await email("th2", "e2", "Weekly deals", "HBB cables on sale this week", 1)
refs["m-tracker"] = "msg:email/me%40example.com/th1/e1"
refs["m-newsletter"] = "msg:email/me%40example.com/th2/e2"

const folder = await store.notes.addFolder({ name: "Harbour drive" })
const method = await store.notes.saveFileNote({
  folderId: folder.id,
  path: "method.md",
  title: "Harbour Bureau methodology",
  text: "How Harbour Bureau checks a company, written a year ago",
})
const garden = await store.notes.saveFileNote({
  folderId: folder.id,
  path: "garden.md",
  title: "Garden plan",
  text: "Beds and water",
})
refs["d-method"] = method.note.ref
refs["d-garden"] = garden.note.ref
refs["n-own"] = (await store.notes.addNote({ text: "HBB idea: a second bank" })).ref

const project = await store.knowledge.addProject({ name: "Harbour Bureau", key: "HBB" })
await store.knowledge.addVocabularyAlias({ kind: "project", id: project.id }, "Харбор")
await store.fillSearchIndex?.()
await store.close()

const evidence = (...args: string[]) =>
  JSON.parse(
    execFileSync(process.execPath, [join(memo, "dist/bin/memo.js"), "projects", "evidence", "HBB", ...args, "--json"], {
      env,
      encoding: "utf8",
      timeout: 60_000,
    }),
  ).item
const source = `telegram:100,email:me@example.com,notes:${folder.id}`
const ask = ["--source", source, "--context-query", "bank tracker", "--contact", "Rita Example"]

const keyOf = Object.fromEntries(Object.entries(refs).map(([key, ref]) => [ref, key]))
const labels = baseline.labels as Record<string, { label: string }>
const score = (
  run: {
    items: { ref: string; lanes: string[]; context: string; time_kind: string; around?: { ref: string }[] | null }[]
  },
  window: number,
) => {
  const found = run.items.map((item) => keyOf[item.ref] ?? `unknown:${item.ref}`)
  const inWindow = (key: string) => key !== "t-old" || window > 200
  const relevant = Object.keys(labels).filter((key) => labels[key]?.label === "relevant" && inWindow(key))
  const reachable = relevant.filter((key) => !baseline.expect.unreachable.includes(key))
  const hits = found.filter((key) => labels[key]?.label === "relevant")
  const byKey = Object.fromEntries(run.items.map((item) => [keyOf[item.ref], item]))
  return {
    found: found.length,
    relevant_found: hits.length,
    irrelevant_found: found.filter((key) => labels[key]?.label === "irrelevant"),
    precision: +(hits.length / Math.max(1, found.length)).toFixed(2),
    precision_project_context: +(
      run.items.filter((item) => item.context === "project" && labels[keyOf[item.ref] ?? ""]?.label === "relevant")
        .length / Math.max(1, run.items.filter((item) => item.context === "project").length)
    ).toFixed(2),
    recall_all: +(hits.length / relevant.length).toFixed(2),
    recall_reachable: +(hits.length / reachable.length).toFixed(2),
    missed: relevant.filter((key) => !found.includes(key)),
    in_context_only: [
      ...new Set(run.items.flatMap((item) => (item.around ?? []).map((one) => keyOf[one.ref] ?? one.ref))),
    ].filter((key) => !found.includes(key)),
    person_only_ok: baseline.expect.person_only.every((key: string) => byKey[key]?.context === "person-only"),
    two_searches_ok: baseline.expect.two_searches.every((key: string) => (byKey[key]?.lanes.length ?? 0) >= 2),
    document_time: byKey["d-method"]?.time_kind ?? null,
    items: run.items.map((item) => `${keyOf[item.ref] ?? item.ref} ${item.context} ${item.lanes.join("+")}`),
  }
}

const fresh = evidence(...ask, "--no-catch-up")
const pending = fresh.units.filter((unit: { issue: string | null }) => unit.issue === "index-pending").length
const sixty = evidence(...ask)
const year = evidence(...ask, "--since-time", "365d")
const withKey = evidence(...ask, "--context-query", "HBB")
const all = evidence("--source", "all", "--context-query", "bank tracker", "--contact", "Rita Example")
const pages: string[][] = []
let step = evidence(...ask, "--max-pages", "2")
let resumes = 0
pages.push(step.items.map((item: { ref: string }) => item.ref))
while (step.checkpoint && resumes < 20) {
  step = evidence(...ask, "--max-pages", "2", "--cursor", step.checkpoint)
  pages.push(step.items.map((item: { ref: string }) => item.ref))
  resumes++
}
const resumed = pages.flat()

console.log(
  JSON.stringify(
    {
      memo: execFileSync(process.execPath, [join(memo, "dist/bin/memo.js"), "--version"], {
        env,
        encoding: "utf8",
      }).trim(),
      node: process.version,
      searches: sixty.lanes.map(
        (lane: { query: string; kinds: string[] }) => `${lane.query} (${lane.kinds.join(",")})`,
      ),
      fresh_store_no_catch_up: { ...score(fresh, 60), units_index_pending: pending, units: fresh.units.length },
      sixty_days: {
        ...score(sixty, 60),
        reads: sixty.usage.reads,
        read_bytes: sixty.usage.read_bytes,
        around_bytes: sixty.usage.around_bytes,
        index: sixty.index,
        units: sixty.units.length,
      },
      year: score(year, 365),
      key_as_search: score(withKey, 60),
      all_sources: {
        sources: all.scope.sources.length,
        unread: all.unread_sources.map((one: { kind: string }) => one.kind),
      },
      resume_two_pages: {
        invocations: resumes + 1,
        references: resumed.length,
        duplicates: resumed.length - new Set(resumed).size,
        same_as_one_run:
          [...new Set(resumed)].sort().join() ===
          sixty.items
            .map((item: { ref: string }) => item.ref)
            .sort()
            .join(),
      },
    },
    null,
    2,
  ),
)
