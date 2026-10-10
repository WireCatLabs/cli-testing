import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { scanSemgrep } from "./security/semgrep.ts"

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
})
