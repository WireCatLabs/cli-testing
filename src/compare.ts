export interface Observation {
  id: string
}

export interface RunRecord {
  schema: 1
  suite: string
  observations: Observation[]
  known: string[]
  complete: boolean
  tools?: Record<string, string>
  exitCodes?: Record<string, number>
  startedAt?: string
  finishedAt?: string
  coverage?: string[]
}

export const compareRuns = (suite: string, before: RunRecord, after: RunRecord) => {
  if (before.schema !== 1 || after.schema !== 1 || before.suite !== suite || after.suite !== suite)
    throw new Error("run schemas and suites must match")
  if (!before.complete || !after.complete) throw new Error("incomplete runs cannot establish fixed observations")
  if (
    (before.coverage !== undefined || after.coverage !== undefined) &&
    JSON.stringify(before.coverage?.slice().sort()) !== JSON.stringify(after.coverage?.slice().sort())
  )
    throw new Error("run coverage must match before observations can be called fixed")
  const old = new Set(before.observations.map(({ id }) => id))
  const current = new Set(after.observations.map(({ id }) => id))
  const known = new Set(before.known)
  return {
    new: [...current].filter((id) => !old.has(id) && !known.has(id)).sort(),
    fixed: [...old].filter((id) => !current.has(id)).sort(),
    cameBack: [...current].filter((id) => !old.has(id) && known.has(id)).sort(),
    unchanged: [...current].filter((id) => old.has(id)).sort(),
  }
}

export const redactTranscript = (text: string, roots: string[] = []): string => {
  let result = text.replaceAll("\r\n", "\n")
  for (const root of [...roots].sort((a, b) => b.length - a.length)) {
    if (root.length === 0) throw new Error("a redaction root cannot be empty")
    result = result.replaceAll(root, "[ROOT]")
  }
  return result.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[WILDCARD]")
}
