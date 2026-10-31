// Read-only: opens the owner's store with readOnly, prints totals per query as JSON lines (no titles, refs or text).
import { appendFileSync } from "node:fs"
import { it, vi } from "vitest"
import { searchNotes, searchNotesQuery } from "../src/services/notes-search.js"
import { openStore } from "../src/store/store.js"

// The store has notes waiting to be indexed; indexing them is a write, so this run searches the index as it stands.
vi.mock("../src/store/sqlite/note-index.js", async (original) => ({
  ...(await original<typeof import("../src/store/sqlite/note-index.js")>()),
  drainNoteIndex: () => undefined,
}))

const OUT = process.env.MEASURE_OUT as string
const QUERIES: Record<string, string> = {
  "date:today": "date:today",
  "tag:work": "tag:work",
  "date>=30d": "date>=30d",
  "budget date>=30d": "date>=30d",
  "plan tag:work": "tag:work",
  "budget source:file": "source:file",
}

it("measure", async () => {
  const store = await openStore({ path: process.env.MEASURE_STORE as string, readOnly: true })
  const label = process.env.MEASURE_LABEL as string
  const accounts = await store.notes.documentsAccounts()
  const scopes: Record<string, { folderIds?: string[] }> = { memo: {} }
  if (accounts.length === 1) scopes.drive = { folderIds: [String(accounts[0]?.id)] }
  else appendFileSync(OUT, `${JSON.stringify({ note: "documents accounts", count: accounts.length })}\n`)
  for (const [tool, scope] of Object.entries(scopes))
    for (const [query, fields] of Object.entries(QUERIES)) {
      const started = performance.now()
      const found = await searchNotes(store, query, {
        ...scope,
        env: process.env,
        command: tool,
        timezone: "Europe/Madrid",
      })
      const ms = Math.round(performance.now() - started)
      const exact = await searchNotesQuery(store, { text: fields, limit: 20_000, timezone: "Europe/Madrid", ...scope })
      const inside = new Set(exact.items.map(({ ref }) => ref))
      const words = await searchNotesQuery(store, {
        text: query,
        limit: 20_000,
        timezone: "Europe/Madrid",
        ...scope,
      }).catch(() => undefined)
      appendFileSync(
        OUT,
        `${JSON.stringify({
          label,
          tool,
          query,
          hits: found.hits.length,
          by_meaning_only: found.hits.filter(({ found_by }) => found_by.length === 1 && found_by[0] === "meaning")
            .length,
          with_meaning: found.hits.filter(({ found_by }) => found_by.includes("meaning")).length,
          outside_filter: found.hits.filter(({ ref }) => !inside.has(ref)).length,
          field_matches: inside.size,
          word_matches: words?.items.length ?? null,
          total: (found as { total?: unknown }).total ?? null,
          has_more: found.has_more,
          ms,
        })}\n`,
      )
    }
  await store.close()
}, 900_000)
