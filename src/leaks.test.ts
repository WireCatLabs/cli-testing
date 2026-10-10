import { mkdirSync, mkdtempSync, symlinkSync, truncateSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { confinedPath, findLeaks, scanLeaks } from "./leaks.js"
import { main } from "./main.js"

const marker = "wirecat-synthetic-message-canary"
const root = () => mkdtempSync(join(tmpdir(), "leak-check-"))
const phone = () => ["+1", "202", "555", "0199"].join("")

describe("no-leak artifacts", () => {
  it("reports only rule and location for canaries and common credential shapes", () => {
    const token = "invented".repeat(4)
    const jwt = [Buffer.from('{"alg":"HS256"}').toString("base64url"), "x".repeat(12), "y".repeat(12)].join(".")
    const text = [`Bearer ${token}`, jwt, phone(), `token=${token}`, marker, marker].join("\n")
    const findings = findLeaks(text, [marker])
    expect(findings.map(({ rule }) => rule)).toEqual([
      "bearer",
      "jwt",
      "phone",
      "credential-field",
      "canary-1",
      "canary-1",
    ])
    expect(findings.at(-1)?.line).toBe(6)
    expect(JSON.stringify(findings)).not.toContain(token)
    expect(JSON.stringify(findings)).not.toContain(marker)
    expect(findLeaks("token=[redacted]\nBearer [redacted]\nordinary diagnostic")).toEqual([])
    expect(() => findLeaks("", ["tiny"])).toThrow("eight characters")
    expect(() => findLeaks(Array(1002).fill(marker).join("\n"), [marker])).toThrow("finding limit")
  })
  it("scans selected artifacts recursively once and detects a planted log leak", () => {
    const directory = root()
    mkdirSync(join(directory, "logs"))
    writeFileSync(join(directory, "logs", "safe.log"), "ordinary diagnostic\n")
    expect(scanLeaks(directory, ["logs", "logs/safe.log"]).passed).toBe(true)
    writeFileSync(join(directory, "logs", "failure.log"), `context\n${marker}\n`)
    const report = scanLeaks(directory, ["logs"], [marker])
    expect(report.passed).toBe(false)
    expect(report.findings).toEqual([{ file: "logs/failure.log", rule: "canary-1", line: 2 }])
    expect(JSON.stringify(report)).not.toContain(marker)
  })
  it("fails closed for missing paths, traversal, binary files and symlinks at every depth", () => {
    const directory = root()
    const outside = root()
    writeFileSync(join(outside, "external.log"), marker)
    for (const path of ["..", "../external.log", directory])
      expect(() => confinedPath(directory, path)).toThrow("inside its root")
    expect(() => scanLeaks(directory, [])).toThrow("artifact path")
    expect(() => scanLeaks(directory, ["missing.log"])).toThrow()
    writeFileSync(join(directory, "binary.log"), Buffer.from([0, 1, 2]))
    expect(() => scanLeaks(directory, ["binary.log"])).toThrow("text files")
    symlinkSync(outside, join(directory, "alias"), "dir")
    expect(() => scanLeaks(directory, ["alias/external.log"])).toThrow("symlinks")
    expect(() => scanLeaks(join(directory, "alias"), ["external.log"])).toThrow("symlinks")
    mkdirSync(join(directory, "nested"))
    symlinkSync(join(outside, "external.log"), join(directory, "nested", "alias.log"))
    expect(() => scanLeaks(directory, ["nested"])).toThrow("symlinks")
  })
  it("bounds files, total bytes and recursive file counts", () => {
    const directory = root()
    const large = join(directory, "large.log")
    writeFileSync(large, "")
    truncateSync(large, 8 * 1024 * 1024 + 1)
    expect(() => scanLeaks(directory, ["large.log"])).toThrow("byte limit")
    mkdirSync(join(directory, "many"))
    for (let index = 0; index < 1001; index++) writeFileSync(join(directory, "many", `${index}.log`), "")
    expect(() => scanLeaks(directory, ["many"])).toThrow("file limit")
    const paths: string[] = []
    for (let index = 0; index < 5; index++) {
      const name = `${index}.log`
      paths.push(name)
      writeFileSync(join(directory, name), "x".repeat(8 * 1024 * 1024))
    }
    expect(() => scanLeaks(directory, paths)).toThrow("byte limit")
  })
  it("the CLI returns clean/leaking statuses without raw content", () => {
    const directory = root()
    const policy = join(directory, "policy.json")
    writeFileSync(policy, JSON.stringify({ paths: ["diagnostic.log"], canaries: [marker] }))
    let output = ""
    const stdout = {
      write: (text: string) => {
        output = text
      },
    }
    writeFileSync(join(directory, "diagnostic.log"), "clean")
    expect(main(["security", "no-leak", directory, policy], { stdout })).toBe(0)
    writeFileSync(join(directory, "diagnostic.log"), marker)
    expect(main(["security", "no-leak", directory, policy], { stdout })).toBe(1)
    expect(JSON.parse(output).findings).toHaveLength(1)
    expect(output).not.toContain(marker)
    writeFileSync(policy, marker)
    const stderr = {
      write: (text: string) => {
        output = text
      },
    }
    expect(main(["security", "no-leak", directory, policy], { stderr })).toBe(2)
    expect(output).toContain("no-leak setup failed")
    expect(output).not.toContain(marker)
  })
})

it("does not echo a sensitive filename in its file list or findings", () => {
  const directory = root()
  writeFileSync(join(directory, `${marker}.log`), marker)
  const report = scanLeaks(directory, [`${marker}.log`], [marker])
  expect(report.passed).toBe(false)
  expect(report.findings.map(({ line }) => line)).toEqual([0, 1])
  expect(JSON.stringify(report)).not.toContain(marker)
  expect(report.files[0]).toMatch(/^\[sensitive-path-/)
})
