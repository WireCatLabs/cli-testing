import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { confinedPath } from "./leaks.js"

export interface ContractFile {
  path: string
  text: string
}
export interface ContractFileCheck {
  path: string
  unchanged?: boolean
  json?: unknown
  text?: string
  sha256?: string
}

export const substitute = (text: string, values: Map<string, string | number>): string =>
  text.replace(/\{\{([A-Za-z0-9_-]+)\}\}/g, (_, key: string) => {
    const value = values.get(key)
    if (value === undefined) throw new Error("contract references an undefined value")
    return String(value)
  })

export const jsonAt = (value: unknown, pointer: string): unknown => {
  if (pointer === "") return value
  if (!pointer.startsWith("/")) throw new Error("JSON paths must be JSON pointers")
  let current = value
  for (const segment of pointer.slice(1).split("/")) {
    const key = segment.replaceAll("~1", "/").replaceAll("~0", "~")
    if (!current || typeof current !== "object" || !Object.hasOwn(current, key))
      throw new Error("expected JSON field missing")
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export const assertJson = (actual: unknown, expected: unknown, values: Map<string, string | number>): void => {
  if (typeof expected === "string") {
    const placeholder = /^\{\{([A-Za-z0-9_-]+)\}\}$/.exec(expected)
    const rendered = substitute(expected, values)
    expected = placeholder ? values.get(placeholder[1] as string) : rendered
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) throw new Error("JSON array contract changed")
    for (const [index, item] of expected.entries()) assertJson(actual[index], item, values)
  } else if (expected && typeof expected === "object") {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) throw new Error("JSON object contract changed")
    for (const [key, item] of Object.entries(expected)) {
      if (!Object.hasOwn(actual, key)) throw new Error("expected JSON field missing")
      assertJson((actual as Record<string, unknown>)[key], item, values)
    }
  } else if (actual !== expected) throw new Error("JSON value contract changed")
}

export const seedContractFiles = (root: string, files: ContractFile[], values: Map<string, string | number>) => {
  const seeded = new Map<string, string>()
  for (const file of files) {
    const path = confinedPath(root, file.path)
    const text = substitute(file.text, values)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, text, { mode: 0o600, flag: "wx" })
    seeded.set(file.path, text)
  }
  return seeded
}

export const checkContractFiles = (
  root: string,
  checks: ContractFileCheck[],
  seeded: Map<string, string>,
  values: Map<string, string | number>,
) => {
  for (const check of checks) {
    const bytes = readFileSync(confinedPath(root, check.path))
    if (check.sha256 && createHash("sha256").update(bytes).digest("hex") !== substitute(check.sha256, values))
      throw new Error("contract file checksum changed")
    const actual = bytes.toString("utf8")
    if (check.unchanged && (!seeded.has(check.path) || actual !== seeded.get(check.path)))
      throw new Error("contract file changed")
    if (check.text !== undefined && actual !== substitute(check.text, values)) throw new Error("contract file changed")
    if (check.json !== undefined) {
      let value: unknown
      try {
        value = JSON.parse(actual)
      } catch {
        throw new Error("contract file must contain JSON")
      }
      assertJson(value, check.json, values)
    }
  }
}
