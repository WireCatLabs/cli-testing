import { createHash } from "node:crypto"
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs"
import { isAbsolute, relative, resolve, sep } from "node:path"

export interface LeakFinding {
  file: string
  rule: string
  line: number
}

const rules = [
  ["bearer", /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
  ["phone", /\+[1-9]\d(?:[ ().-]*\d){9,14}\b/g],
  ["credential-field", /(?:token|password|api[_-]?key)\s*["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{16,}/gi],
] as const

export const findLeaks = (text: string, canaries: string[] = []): Omit<LeakFinding, "file">[] => {
  if (canaries.some((value) => typeof value !== "string" || value.length < 8))
    throw new Error("leak canaries must have at least eight characters")
  const findings = new Map<string, Omit<LeakFinding, "file">>()
  const add = (rule: string, index: number) => {
    const line = text.slice(0, index).split("\n").length
    findings.set(`${rule}:${line}`, { rule, line })
    if (findings.size > 1000) throw new Error("leak scan exceeded its finding limit")
  }
  for (const [rule, pattern] of rules) for (const match of text.matchAll(new RegExp(pattern))) add(rule, match.index)
  for (const [index, canary] of canaries.entries()) {
    let at = text.indexOf(canary)
    while (at !== -1) {
      add(`canary-${index + 1}`, at)
      at = text.indexOf(canary, at + canary.length)
    }
  }
  return [...findings.values()]
}

export const confinedPath = (root: string, path: string): string => {
  const result = resolve(root, path)
  const inside = relative(resolve(root), result)
  if (!inside || isAbsolute(inside) || inside === ".." || inside.startsWith(`..${sep}`))
    throw new Error("artifact path must stay inside its root")
  const parts = inside.split(sep)
  for (let length = 0; length <= parts.length; length++) {
    const component = resolve(root, ...parts.slice(0, length))
    if (existsSync(component) && lstatSync(component).isSymbolicLink())
      throw new Error("artifact scan refuses symlinks")
  }
  return result
}

export const scanLeaks = (root: string, paths: string[], canaries: string[] = []) => {
  if (!paths.length) throw new Error("give at least one artifact path")
  findLeaks("", canaries)
  if (lstatSync(root).isSymbolicLink()) throw new Error("artifact scan refuses symlinks")
  const findings: LeakFinding[] = []
  const seen = new Set<string>()
  const visible = (file: string) =>
    findLeaks(file, canaries).length
      ? `[sensitive-path-${createHash("sha256").update(file).digest("hex").slice(0, 12)}]`
      : file
  let bytes = 0
  const visit = (path: string) => {
    const file = relative(resolve(root), path).split(sep).join("/")
    if (seen.has(file)) return
    seen.add(file)
    for (const finding of findLeaks(file, canaries)) findings.push({ file: visible(file), ...finding, line: 0 })
    if (seen.size > 1000) throw new Error("artifact scan exceeded its file limit")
    const info = lstatSync(path)
    if (info.isSymbolicLink()) throw new Error("artifact scan refuses symlinks")
    if (info.isDirectory()) {
      for (const child of readdirSync(path).sort()) visit(confinedPath(root, `${file}/${child}`))
      return
    }
    if (!info.isFile()) throw new Error("artifact scan requires regular files")
    bytes += info.size
    if (info.size > 8 * 1024 * 1024 || bytes > 32 * 1024 * 1024)
      throw new Error("artifact scan exceeded its byte limit")
    const text = readFileSync(path, "utf8")
    if (text.includes("\0")) throw new Error("artifact scan requires text files")
    for (const finding of findLeaks(text, canaries)) findings.push({ file: visible(file), ...finding })
  }
  for (const path of paths) {
    const target = confinedPath(root, path)
    visit(target)
  }
  return { passed: findings.length === 0, rulesVersion: 1, files: [...seen].sort().map(visible), findings }
}
