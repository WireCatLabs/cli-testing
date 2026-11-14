// Preloaded into each b24 process after the external-I/O guard: the guard has already refused all network, and this
// answers only the fake portal's host. The portal is a JSON file the runner edits between runs, so a re-sync sees
// changes as a live portal would. Every method, parameter and field below is from the Bitrix24 REST reference
// (https://apidocs.bitrix24.com/api-reference/); anything else is refused, so a b24 that asks for something new
// fails here instead of passing against a fake that guesses.
import { appendFileSync, readFileSync } from "node:fs"

export const HOST = "example.bitrix24.test"
const state = () => JSON.parse(readFileSync(process.env.FAKE_PORTAL, "utf8"))
const log = (entry) =>
  process.env.FAKE_PORTAL_LOG && appendFileSync(process.env.FAKE_PORTAL_LOG, `${JSON.stringify(entry)}\n`)

// rest-v3/items/fields-deal, fields-lead, fields-contact, fields-company
const COMMON = ["id", "title", "createdTime", "updatedTime", "assignedById", "url", "phone", "email"]
const FIELDS = {
  deal: [
    ...COMMON,
    ...["categoryId", "stageId", "stageSemanticId", "opportunity", "currencyId", "companyId", "contactId"],
    ...["contactsId", "leadId", "closeTime", "sourceId", "typeId"],
  ],
  lead: [
    ...COMMON,
    ...["name", "secondName", "lastName", "companyTitle", "stageId", "stageSemanticId", "opportunity"],
    ...["currencyId", "companyId", "contactId", "contactsId", "sourceId"],
  ],
  contact: [...COMMON, "name", "secondName", "lastName", "post", "companyId", "companiesId", "typeId", "sourceId"],
  company: [...COMMON, "typeId", "industryId", "revenue", "currencyId", "contactsId"],
}
// rest-v3/items/fields-my-company and crm-my-company-basic-list-rest-v3
const MY = { select: ["id", "title", "email", "phone", "requisites", "bankRequisites"], filter: ["id", "title"] }
const OPERATORS = new Set(["=", "!=", ">", ">=", "<", "<=", "in"])
// user/user-get, departments/department-get, crm/status/crm-status-list, crm/universal/category/crm-category-list
const REST2_PARAMS = {
  "user.get": ["FILTER", "sort", "order", "start", "ADMIN_MODE"],
  "department.get": ["sort", "order", "start", "ID", "NAME", "PARENT", "UF_HEAD"],
  "crm.status.list": ["order", "filter", "start"],
  "crm.category.list": ["entityTypeId"],
  "user.admin": [],
}
const USER_FIELDS = ["ID", "ACTIVE", "NAME", "LAST_NAME", "EMAIL", "WORK_POSITION", "UF_DEPARTMENT", "USER_TYPE"]
const REST2_PAGE = 50

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
const ok = (result, extra = {}) => json(200, { result, ...extra, time: { start: 0, finish: 0, duration: 0 } })
const v3Error = (status, code, message) => json(status, { error: { code, message } })
const unknownField = (name) =>
  v3Error(400, "BITRIX_REST_V3_EXCEPTION_UNKNOWNDTOPROPERTYEXCEPTION", `Unknown field ${name}`)
const notFound = (api, method) =>
  api === 3
    ? v3Error(404, "BITRIX_REST_V3_EXCEPTION_METHODNOTFOUNDEXCEPTION", `Method "${method}" was not found.`)
    : json(404, { error: "ERROR_METHOD_NOT_FOUND", error_description: "Method not found!" })
const noScope = (api) =>
  api === 3
    ? v3Error(403, "BITRIX_REST_V3_EXCEPTION_INSUFFICIENTSCOPEEXCEPTION", "Insufficient scope")
    : json(401, { error: "insufficient_scope", error_description: "The request requires higher privileges" })

const compare = (left, op, right) => {
  if (op === "in") return Array.isArray(right) && right.map(String).includes(String(left))
  const time = typeof right === "string" && /^\d{4}-\d{2}-\d{2}T/.test(right)
  const a = time ? Date.parse(String(left)) : typeof right === "number" ? Number(left) : String(left)
  const b = time ? Date.parse(right) : right
  return { "=": a === b, "!=": a !== b, ">": a > b, ">=": a >= b, "<": a < b, "<=": a <= b }[op]
}
const pick = (row, select) => Object.fromEntries(select.filter((name) => name in row).map((name) => [name, row[name]]))

const v3List = (rows, fields, body, { contact = false } = {}) => {
  const { select, filter = [], order = {}, pagination = {} } = body
  const extra = Object.keys(body).find((key) => !["select", "filter", "order", "pagination"].includes(key))
  if (extra) return unknownField(extra)
  if (!Array.isArray(select) || select.length === 0)
    return v3Error(400, "BITRIX_REST_V3_EXCEPTION_VALIDATIONEXCEPTION", "select is required")
  const bad = [...select, ...filter.map((one) => String(one[0])), ...Object.keys(order)].find(
    (name) => !fields.includes(name),
  )
  if (bad) return unknownField(bad)
  // fields-contact: filtering by companiesId "currently returns INTERNAL_SERVER_ERROR"
  if (contact && filter.some((one) => one[0] === "companiesId"))
    return v3Error(500, "INTERNAL_SERVER_ERROR", "Internal server error")
  if (filter.some((one) => !OPERATORS.has(String(one[1]))))
    return v3Error(400, "BITRIX_REST_V3_EXCEPTION_VALIDATIONEXCEPTION", "unknown operator")
  const { limit = 50, offset = 0 } = pagination
  const items = rows
    .filter((row) => filter.every(([field, op, value]) => compare(row[field], op, value)))
    .sort((a, b) => (a.id - b.id) * (order.id === "DESC" ? -1 : 1))
    .slice(offset, offset + Math.min(limit, 50))
  return ok({ items: items.map((row) => pick(row, select)) })
}

const rest2Page = (all, start) =>
  ok(all.slice(start, start + REST2_PAGE), start + REST2_PAGE < all.length ? { next: start + REST2_PAGE } : {})

const answer = (api, method, body) => {
  const portal = state()
  const scope = method.startsWith("user.") ? "user" : method.startsWith("department.") ? "department" : "crm"
  const typed = /^crm\.(deal|lead|contact|company)\.(list|field\.list|userfield\.list)$/.exec(method)
  const wanted = typed ? (typed[2] === "userfield.list" ? 2 : 3) : method === "crm.mycompany.basic.list" ? 3 : 2
  if (api !== wanted) return notFound(api, method)
  if (portal.withheld.includes(scope)) return noScope(api)
  if (typed?.[2] === "list")
    return v3List(portal[typed[1]], FIELDS[typed[1]], body, { contact: typed[1] === "contact" })
  if (typed?.[2] === "field.list") return ok({ items: [] })
  if (typed) return ok([])
  if (method === "crm.mycompany.basic.list") {
    const filter = body.filter ?? []
    const select = body.select ?? ["id", "title"]
    const bad = [...select.filter((one) => !MY.select.includes(one)), ...filter.map((one) => String(one[0]))].find(
      (name) => !MY.select.includes(name) && !MY.filter.includes(name),
    )
    if (bad) return unknownField(bad)
    const { limit = 50, offset = 0 } = body.pagination ?? {}
    const items = portal.mine
      .filter((row) => filter.every(([field, op, value]) => compare(row[field], op, value)))
      .slice(offset, offset + limit)
    return ok({ items: items.map((row) => pick(row, select)) })
  }
  const params = REST2_PARAMS[method]
  if (!params) return notFound(api, method)
  const extra = Object.keys(body).find((key) => !params.includes(key))
  if (extra) return json(400, { error: "INVALID_ARG_VALUE", error_description: `Unknown parameter ${extra}` })
  const start = Number(body.start ?? 0)
  if (method === "user.get") {
    const filter = body.FILTER ?? {}
    const badFilter = Object.keys(filter).find((key) => !USER_FIELDS.includes(key.replace(/^[=!<>%]+/, "")))
    if (badFilter) return json(400, { error: "INVALID_ARG_VALUE", error_description: `Unknown filter ${badFilter}` })
    const users = portal.users.filter(
      (row) =>
        (filter.ID === undefined || String(filter.ID) === row.ID) &&
        (filter.USER_TYPE === undefined || filter.USER_TYPE === row.USER_TYPE) &&
        (filter.ACTIVE === undefined || filter.ACTIVE === row.ACTIVE),
    )
    return rest2Page(users, start)
  }
  // apidocs common/users/user-admin: whether the webhook's own user is an administrator
  if (method === "user.admin") return ok(portal.admin === true)
  if (method === "department.get") return rest2Page(portal.departments, start)
  if (method === "crm.category.list") return ok({ categories: [{ id: 0, name: "Sales", sort: 100, isDefault: "Y" }] })
  const directory = body.filter?.ENTITY_ID
  return rest2Page(
    portal.statuses.filter((one) => directory === undefined || one.ENTITY_ID === directory),
    start,
  )
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input))
  if (url.protocol !== "https:" || url.hostname !== HOST) throw new Error(`fake portal refuses ${url.origin}`)
  const path = /^\/rest\/(api\/)?7\/[A-Za-z0-9_-]+\/([a-z.]+)$/.exec(url.pathname)
  if (!path) throw new Error("fake portal refuses a path that is not a webhook method")
  const api = path[1] ? 3 : 2
  const method = path[2]
  const body = JSON.parse(String(init.body ?? "{}"))
  const response = answer(api, method, body)
  log({ api, method, status: response.status })
  return response
}
