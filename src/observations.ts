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

const socketAlerts = (value: unknown): Record<string, unknown> => {
  const response = object(value)
  if (response.ok !== true) throw new Error("Socket did not report a successful scan")
  const data = object(response.data)
  const ecosystems = object(data.alerts)
  if (Object.keys(ecosystems).length === 0 && data.healthy !== true)
    throw new Error("Socket did not report an explicit empty result")
  for (const [ecosystem, alerts] of Object.entries(ecosystems)) {
    string(ecosystem)
    object(alerts)
  }
  return ecosystems
}

export const scannerCoverage = (repo: string, tool: string, value: unknown): string[] => {
  const keys = new Set([JSON.stringify([repo, tool])])
  if (tool === "socket") {
    socketAlerts(value)
    keys.add(JSON.stringify([repo, tool, "all-ecosystems-v1"]))
  }
  if (tool !== "semgrep") return [...keys]
  const report = object(value)
  for (const item of list(report.coverageGaps ?? [])) {
    const gap = object(item)
    keys.add(JSON.stringify([repo, tool, "rule-gap", string(gap.rule), string(gap.path)]))
  }
  const point = (value: unknown) => {
    const position = object(value)
    if (!Number.isSafeInteger(position.line) || !Number.isSafeInteger(position.col))
      throw new Error("invalid partial parsing position")
    return [position.line, position.col]
  }
  for (const item of list(report.errors ?? [])) {
    const type = object(item).type
    if (!Array.isArray(type) || type[0] !== "PartialParsing") continue
    for (const item of list(type[1])) {
      const span = object(item)
      keys.add(JSON.stringify([repo, tool, "partial", string(span.path), point(span.start), point(span.end)]))
    }
  }
  return [...keys].sort()
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
    case "cargo-audit": {
      const report = object(value)
      for (const row of list(object(report.vulnerabilities).list)) {
        const pkg = object(object(row).package)
        add(string(pkg.name), string(pkg.version), string(object(object(row).advisory).id))
      }
      for (const [kind, rows] of Object.entries(object(report.warnings)))
        for (const row of list(rows)) {
          const pkg = object(object(row).package)
          const advisory = object(row).advisory
          add(kind, string(pkg.name), string(pkg.version), advisory ? string(object(advisory).id) : "-")
        }
      break
    }
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
      for (const [ecosystem, alerts] of Object.entries(socketAlerts(value)))
        for (const [pkg, versions] of Object.entries(object(alerts)))
          for (const [version, details] of Object.entries(object(versions))) {
            const rows = Array.isArray(details) ? details : [details]
            for (const row of rows) {
              const parts = [string(pkg), string(version), string(object(row).type)]
              add(...(ecosystem === "npm" ? parts : [ecosystem, ...parts]))
            }
          }
      break
    }
    default:
      throw new Error(`unsupported scanner: ${tool}`)
  }
  return [...new Set(ids)].sort().map((id) => ({ id }))
}
