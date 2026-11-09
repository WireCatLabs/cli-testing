// Writes a synthetic records envelope v1 as JSONL: node generate.mjs <records> <out.jsonl>
// Mixed business types in a fixed ratio: per four records one organization, one person, one invoice with three lines
// and one transaction with two splits, plus ten wallets the transactions point at.

import { once } from "node:events"
import { createWriteStream } from "node:fs"

const [count, out] = [Number(process.argv[2]), process.argv[3]]
if (!Number.isInteger(count) || count < 0 || !out) {
  process.stderr.write("usage: node generate.mjs <records> <out.jsonl>\n")
  process.exit(2)
}

const SOURCE = { provider: "bench-erp", account: "bench", batch_id: "2026-11-08" }
const WALLETS = 10
const CITIES = ["Valencia", "Lisbon", "Porto", "Turin", "Lyon", "Ghent", "Krakow", "Bergen"]
const TRADES = ["Logistics", "Bakery", "Studio", "Garage", "Clinic", "Rentals", "Printing", "Florist"]
const CATEGORIES = ["rent", "fuel", "office", "travel", "software", "meals"]

const stream = createWriteStream(out)
const write = async (value) => {
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, "drain")
}
const pad = (n) => String(n).padStart(6, "0")
const day = (n) => `2026-${String((n % 12) + 1).padStart(2, "0")}-${String((n % 28) + 1).padStart(2, "0")}`
const upsert = (type, id, fields, relations) => ({
  key: `${type}-${id}`,
  type,
  external_id: id,
  operation: "upsert",
  revision: 1,
  fields,
  ...(relations ? { relations } : {}),
})

await write({ schema_version: 1, source: SOURCE })
let written = 0
const emit = async (record) => {
  if (written >= count) return
  await write(record)
  written += 1
}
for (let w = 0; w < WALLETS && written < count; w++)
  await emit(
    upsert("wallet", `W-${w}`, {
      name: `Bench account ${w}`,
      kind: "bank",
      currency: "EUR",
      number_hint: String(1000 + w),
    }),
  )
for (let n = 0; written < count; n++) {
  const org = `C-${pad(n)}`
  const name = `${CITIES[n % CITIES.length]} ${TRADES[(n >> 3) % TRADES.length]} ${n}`
  await emit(upsert("organization", org, { name, identifiers: [{ scheme: "bench-erp:customer", value: org }] }))
  await emit(
    upsert("person", `P-${pad(n)}`, { name: `Test Person ${n}`, email: `person${n}@example.com` }, [
      { role: "member-of", type: "organization", external_id: org },
    ]),
  )
  const lines = [1, 2, 3].map((k) => ({
    description: `Service ${k} for order ${n}`,
    quantity: String(k),
    unit_price: "12.50",
    amount: (k * 12.5).toFixed(2),
  }))
  await emit(
    upsert(
      "invoice",
      `INV-${pad(n)}`,
      {
        direction: "receivable",
        number: `INV-${pad(n)}`,
        currency: "EUR",
        issue_date: day(n),
        due_date: day(n + 1),
        lines,
      },
      [{ role: "counterparty", type: "organization", external_id: org }],
    ),
  )
  await emit(
    upsert(
      "transaction",
      `T-${pad(n)}`,
      {
        direction: "out",
        amount: "75.00",
        currency: "EUR",
        date: day(n),
        description: `Card payment ${n}`,
        counterparty_name: name,
        splits: [
          { amount: "50.00", category: CATEGORIES[n % CATEGORIES.length] },
          { amount: "25.00", category: CATEGORIES[(n + 1) % CATEGORIES.length] },
        ],
      },
      [
        { role: "wallet", type: "wallet", external_id: `W-${n % WALLETS}` },
        { role: "counterparty", type: "organization", external_id: org },
      ],
    ),
  )
}
stream.end()
await once(stream, "finish")
