import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { performance } from "node:perf_hooks"

// CLI_CORE: a cli-core checkout built with `pnpm build`; its dist is what b24 runs.
const core = resolve(process.env.CLI_CORE ?? "")
const { crmCopiesOver } = await import(join(core, "dist/store/sqlite/crm.js"))
const { openStoreContext } = await import(join(core, "dist/store/sqlite/open-store.js"))
const { accountPeopleOver } = await import(join(core, "dist/store/people.js"))

// Changes the store it is given for good: hand it a fresh copy (sqlite3 <store> ".backup <copy>"), one per run.
const path = resolve(process.env.CRM_CONTACTS_STORE ?? "")
const account = process.env.CRM_CONTACTS_ACCOUNT
const users = (process.env.CRM_CONTACTS_USERS ?? "").split(",").filter(Boolean)
if (!process.env.CRM_CONTACTS_STORE || !account || !users.length)
  throw new Error("set CRM_CONTACTS_STORE (a copy), CRM_CONTACTS_ACCOUNT (portal host), CRM_CONTACTS_USERS (1,11)")
if (path === join(homedir(), ".local/share/WireCat/wirecat.db")) throw new Error("never the owner's own store")

const ms = (start) => Math.round(performance.now() - start)
let start = performance.now()
const context = await openStoreContext({ path })
const opened = ms(start)
const { database } = context
const crm = crmCopiesOver(context, accountPeopleOver(context))
const key = { provider: "bitrix24", account }
const count = (sql) => Number(database.prepare(sql).get()?.n)
const accountId = Number(
  database.prepare("SELECT id FROM accounts WHERE provider = 'bitrix24' AND external_id = ?").get(account)?.id,
)
const contacts = () =>
  count(`SELECT count(*) AS n FROM identities WHERE provider = 'bitrix24' AND external_id LIKE '${account}/contact/%'`)
const persons = () => count("SELECT count(*) AS n FROM persons")
const before = { contacts: contacts(), persons: persons() }

const now = Date.now()
start = performance.now()
const estimate = await crm.removeContacts(key, { users, before: now, dryRun: true })
const estimateMs = ms(start)

start = performance.now()
const deals = await crm.removeOutOfScope(key, "deal", users)
const leads = await crm.removeOutOfScope(key, "lead", users)
// The portal decides which companies a narrowed sync keeps; here, those a kept deal or lead names, and own ones.
const companies = database
  .prepare(
    "UPDATE records SET deleted_at = ? WHERE account_id = ? AND type = 'organization' AND deleted_at IS NULL " +
      "AND entity_id NOT IN (SELECT organization_id FROM deals WHERE account_id = ? AND deleted_at IS NULL " +
      "AND organization_id IS NOT NULL UNION SELECT organization_id FROM leads WHERE account_id = ? " +
      "AND deleted_at IS NULL AND organization_id IS NOT NULL) AND entity_id NOT IN (SELECT id FROM organizations " +
      "WHERE json_extract(metadata, '$.own') = 1)",
  )
  .run(now, accountId, accountId, accountId).changes
const narrowMs = ms(start)

start = performance.now()
const removed = await crm.removeContacts(key, { users, before: now })
const removeMs = ms(start)

const checks = {
  danglingLinks: count(
    "SELECT count(*) AS n FROM links WHERE (to_type = 'person' AND to_id NOT IN (SELECT id FROM persons)) " +
      "OR (from_type = 'person' AND from_id NOT IN (SELECT id FROM persons))",
  ),
  danglingIdentityLinks: count(
    "SELECT count(*) AS n FROM identity_links WHERE person_id NOT IN (SELECT id FROM persons) " +
      "OR identity_id NOT IN (SELECT id FROM identities)",
  ),
  foreignKeys: database.prepare("PRAGMA foreign_key_check(identity_links)").all().length,
  ownerPersons: count("SELECT count(*) AS n FROM persons WHERE owner = 1"),
  namesWithNull: count(
    "SELECT count(*) AS n FROM persons p WHERE p.name LIKE '%null%' AND EXISTS (SELECT 1 FROM identity_links l " +
      `JOIN identities i ON i.id = l.identity_id WHERE l.person_id = p.id AND i.provider = 'bitrix24' ` +
      `AND i.external_id LIKE '${account}/contact/%')`,
  ),
}
process.stdout.write(
  `${JSON.stringify(
    {
      users,
      openMs: opened,
      before,
      estimate: { ...estimate, ms: estimateMs },
      narrowed: { deals, leads, companies, ms: narrowMs },
      removed: { ...removed, ms: removeMs },
      after: { contacts: contacts(), persons: persons() },
      checks,
    },
    null,
    2,
  )}\n`,
)
database.close()
