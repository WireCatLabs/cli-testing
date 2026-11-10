// What `memo people review --limit 500` costs in cli-core: people.linkProposals over 25,000 identity-link proposals
// of four statuses, written straight into a store seed.mjs made (once). No real data, no account, no CLI run.
//   node review.mjs <cli-core dist folder> <store file>
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { pathToFileURL } from "node:url"

const [dist, path] = process.argv.slice(2)
const writer = new DatabaseSync(path)
if (Number(writer.prepare("SELECT count(*) AS n FROM proposed_actions WHERE kind = 'identity_link'").get()?.n) === 0)
  writer.exec(
    "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 25000) " +
      "INSERT INTO proposed_actions (kind, payload, status, proposed_by_type, proposed_by_id, created_at, updated_at) " +
      "SELECT 'identity_link', json_object('identity', 'telegram:' || (6000 + 2 * (i % 20000)), " +
      "'with', 'telegram:' || (6001 + 2 * (i % 20000)), " +
      "'persons', json_array('' || (6001 + 2 * (i % 20000)), '' || (6002 + 2 * (i % 20000))), " +
      "'sides', json_array('' || (6000 + 2 * (i % 20000)), '' || (6001 + 2 * (i % 20000))), " +
      "'joins', 'person', 'signal', 'agent', 'score', NULL, 'evidence', json_array()), " +
      "CASE i % 4 WHEN 0 THEN 'proposed' WHEN 1 THEN 'rejected' WHEN 2 THEN 'executed' ELSE 'approved' END, " +
      "'bot', 3, 1794273277392 + i, 1794273277392 + i FROM n",
  )
writer.close()
const { openStore } = await import(pathToFileURL(join(dist, "store/store.js")).href)
const store = await openStore({ env: { ...process.env, MESSAGING_STORE: path } })
const times = []
for (let run = 0; run < 8; run++) {
  const began = performance.now()
  await store.people.linkProposals({ limit: 500, offset: 0 })
  times.push(performance.now() - began)
}
times.sort((a, b) => a - b)
process.stdout.write(`linkProposals, limit 500 of 25,000: median of 8 ${times[4].toFixed(0)} ms\n`)
await store.close()
