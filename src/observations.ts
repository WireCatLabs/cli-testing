import type { Observation } from "./compare.js"

const object = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid scanner object")
  return value as Record<string, unknown>
}
const list = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error("invalid scanner list")
  return value
}
const string = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0) throw new Error("invalid scanner identifier")
  return value
}

/** These are scanner observations, not verdicts on whether a vulnerability is reachable. */
export const scannerObservations = (repo: string, tool: string, value: unknown): Observation[] => {
  const ids: string[] = []
  const add = (...parts: string[]) => ids.push(JSON.stringify([repo, tool, ...parts]))
  switch (tool) {
    case "osv":
      for (const result of list(object(value).results))
        for (const pkg of list(object(result).packages))
          for (const vulnerability of list(object(pkg).vulnerabilities))
            add(string(object(object(pkg).package).name), string(object(vulnerability).id))
      break
    case "semgrep":
      for (const result of list(object(value).results)) {
        const row = object(result)
        add(string(row.check_id), string(row.path), JSON.stringify(object(row.start).line))
      }
      break
    case "zizmor":
      for (const result of list(value)) {
        const row = object(result)
        if (row.ignored === true) continue
        for (const location of list(row.locations)) {
          const symbolic = object(object(location).symbolic)
          add(string(row.ident), JSON.stringify(symbolic.key), JSON.stringify(symbolic.route))
        }
      }
      break
    case "codeql":
      for (const result of list(value).flat()) {
        const row = object(result)
        if (!Number.isSafeInteger(row.number)) throw new Error("invalid CodeQL observation number")
        add(String(row.number), string(object(row.rule).id))
      }
      break
    case "socket": {
      const response = object(value)
      if (response.ok !== true) throw new Error("Socket did not report a successful scan")
      const data = object(response.data)
      const ecosystems = object(data.alerts)
      const alerts =
        ecosystems.npm === undefined && data.healthy === true && Object.keys(ecosystems).length === 0
          ? {}
          : object(ecosystems.npm)
      for (const [pkg, versions] of Object.entries(alerts))
        for (const [version, details] of Object.entries(object(versions))) {
          const rows = Array.isArray(details) ? details : [details]
          for (const row of rows) add(pkg, version, string(object(row).type))
        }
      break
    }
    default:
      throw new Error(`unsupported scanner: ${tool}`)
  }
  return [...new Set(ids)].sort().map((id) => ({ id }))
}
