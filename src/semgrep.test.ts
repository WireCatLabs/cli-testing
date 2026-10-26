import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { scanSemgrep } from "./semgrep.js"

const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "scanner-runtime-"))
  const root = join(directory, "source")
  mkdirSync(join(root, "src"), { recursive: true })
  writeFileSync(join(root, "src/bad.ts"), "const value = request.input\nexec(value)\n")
  return { root, output: join(directory, "raw/semgrep.json"), supplement: join(directory, "supplement") }
}
const result = (errors: unknown[] = [], results: unknown[] = [], scanned = ["src/bad.ts"]) =>
  JSON.stringify({ results, errors, paths: { scanned } })
const error = { type: "Syntax error", path: "src/bad.ts" }

describe("Semgrep runtime fallback", () => {
  it("retains source failures and maps a positive runtime control to its original source", () => {
    const { root, output, supplement } = fixture()
    let scans = 0
    const done = scanSemgrep(root, output, supplement, (command, args) => {
      if (command === "pnpm") {
        expect(args).toContain("esbuild@0.25.12")
        expect(args).toContain("./src/bad.ts")
        const runtime = join(supplement, "runtime/src")
        mkdirSync(runtime, { recursive: true })
        writeFileSync(join(runtime, "bad.js"), "exec(value);\n")
        writeFileSync(
          join(runtime, "bad.js.map"),
          JSON.stringify({
            version: 3,
            sources: ["bad.ts"],
            names: [],
            mappings: "AACA",
            sourcesContent: ["const value = request.input\nexec(value)\n"],
          }),
        )
        return { code: 0, stdout: "" }
      }
      return {
        code: 0,
        stdout:
          ++scans === 1
            ? result([error])
            : result(
                [],
                [
                  {
                    check_id: "synthetic.unsafe-exec",
                    path: "src/bad.js",
                    start: { line: 1, col: 1 },
                    end: { line: 1, col: 5 },
                  },
                ],
                ["src/bad.js"],
              ),
      }
    })
    expect(done.errors).toEqual([])
    expect(done.results[0]).toMatchObject({ path: "src/bad.ts", start: { line: 2, col: 1 } })
    expect(JSON.parse(readFileSync(join(supplement, "source.json"), "utf8")).errors).toEqual([error])
    expect(done.runtimeCoverage).toMatchObject({ sources: ["src/bad.ts"], typeSyntaxAnalyzed: false })
  })

  it.each(["compile", "parse", "missing"])("does not write a successful result after a %s failure", (failure) => {
    const { root, output, supplement } = fixture()
    let scans = 0
    expect(() =>
      scanSemgrep(root, output, supplement, (command) => {
        if (command === "pnpm") return { code: failure === "compile" ? 1 : 0, stdout: "" }
        return { code: 0, stdout: ++scans === 1 ? result([error]) : result(failure === "parse" ? [error] : [], [], []) }
      }),
    ).toThrow()
    expect(existsSync(output)).toBe(false)
  })

  it("rejects a scanner error path outside the export before starting a compiler", () => {
    const { root, output, supplement } = fixture()
    expect(() =>
      scanSemgrep(root, output, supplement, (command) => {
        expect(command).toBe("semgrep")
        return { code: 0, stdout: result([{ type: "Syntax error", path: "../outside.ts" }]) }
      }),
    ).toThrow("outside the source export")
  })

  it("compiles a JavaScript module the parser rejects, keeping top-level await, and maps it back", () => {
    const { root, output, supplement } = fixture()
    writeFileSync(join(root, "src/tool.mjs"), "const data = await load()\neval(data)\n")
    const syntax = { type: "Syntax error", path: "src/tool.mjs" }
    let scans = 0
    const done = scanSemgrep(root, output, supplement, (command, args) => {
      if (command === "pnpm") {
        expect(args).toEqual(expect.arrayContaining(["./src/tool.mjs", "--supported:top-level-await=true"]))
        const runtime = join(supplement, "runtime/src")
        mkdirSync(runtime, { recursive: true })
        writeFileSync(join(runtime, "tool.js"), "const data = await load();\neval(data);\n")
        writeFileSync(
          join(runtime, "tool.js.map"),
          JSON.stringify({ version: 3, sources: ["tool.mjs"], names: [], mappings: "AAAA;AACA", sourcesContent: [""] }),
        )
        return { code: 0, stdout: "" }
      }
      if (++scans === 1) return { code: 0, stdout: result([syntax]) }
      expect(args.at(-1)).toBe("./src/tool.js")
      const match = {
        check_id: "synthetic.eval",
        path: "src/tool.js",
        start: { line: 2, col: 1 },
        end: { line: 2, col: 5 },
      }
      return { code: 0, stdout: result([], [match], ["src/tool.js"]) }
    })
    expect(done.results[0]).toMatchObject({ path: "src/tool.mjs", start: { line: 2, col: 1 } })
    expect(done.runtimeCoverage).toMatchObject({ sources: ["src/tool.mjs"] })
  })

  it("refuses two failed sources that would compile to the same runtime file", () => {
    const { root, output, supplement } = fixture()
    expect(() =>
      scanSemgrep(root, output, supplement, (command) => {
        expect(command).toBe("semgrep")
        return {
          code: 0,
          stdout: result([
            { type: "Syntax error", path: "src/bad.ts" },
            { type: "Syntax error", path: "src/bad.mjs" },
          ]),
        }
      }),
    ).toThrow("same runtime file")
    expect(existsSync(output)).toBe(false)
  })

  it("records one rule failing on one file as a coverage gap and keeps the scan", () => {
    const { root, output, supplement } = fixture()
    const warning = {
      type: "Internal matching error",
      level: "warn",
      rule_id: "synthetic.rule",
      path: ".github/workflows/ci.yml",
    }
    const done = scanSemgrep(root, output, supplement, (command) => {
      expect(command).toBe("semgrep")
      return { code: 0, stdout: result([warning]) }
    })
    expect(done.coverageGaps).toEqual([
      { type: "Internal matching error", rule: "synthetic.rule", path: ".github/workflows/ci.yml" },
    ])
    expect(JSON.parse(readFileSync(output, "utf8")).errors).toEqual([warning])
  })

  it.each([
    ["a timeout", { type: "Timeout", path: "src/bad.ts" }],
    ["a matching error at error level", { type: "Internal matching error", level: "error", rule_id: "r", path: "a" }],
    ["a syntax error outside JavaScript", { type: "Syntax error", path: "config.yml" }],
  ])("fails closed on %s", (_, failure) => {
    const { root, output, supplement } = fixture()
    expect(() => scanSemgrep(root, output, supplement, () => ({ code: 0, stdout: result([failure]) }))).toThrow(
      "unrecoverable",
    )
    expect(existsSync(output)).toBe(false)
  })

  it("fails closed when the scanner itself exits with an error", () => {
    const { root, output, supplement } = fixture()
    expect(() => scanSemgrep(root, output, supplement, () => ({ code: 2, stdout: "" }))).toThrow("exit 2")
  })
})
