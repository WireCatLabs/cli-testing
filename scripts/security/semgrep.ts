import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { SourceMap } from "node:module"
import { dirname, extname, isAbsolute, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PACKS = ["p/javascript", "p/typescript", "p/nodejs", "p/secrets", "p/github-actions"]
const ESBUILD = "0.25.12"
type Failure = { type: string | unknown[]; path?: string }
type Match = {
  check_id: string
  path: string
  start: { line: number; col: number }
  end: { line: number; col: number }
}
type Result = { results: Match[]; errors: Failure[]; paths: { scanned: string[] }; [key: string]: unknown }
type Run = (command: string, args: string[], cwd: string) => { code: number; stdout: string }
const run: Run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 600_000,
    stdio: ["ignore", "pipe", "inherit"],
  })
  return { code: result.status ?? 2, stdout: result.stdout ?? "" }
}
const partial = (error: Failure) => Array.isArray(error.type) && error.type[0] === "PartialParsing"
const within = (path: string, root: string) => {
  const candidate = relative(root, resolve(root, path))
  if (!candidate || candidate.startsWith("..") || isAbsolute(candidate))
    throw new Error("scanner path is outside the source export")
  return candidate
}

export const scanSemgrep = (root: string, output: string, supplement: string, invoke: Run = run): Result => {
  const args = [
    "scan",
    "--metrics=off",
    "--quiet",
    "--json",
    "--timeout",
    "120",
    "--timeout-threshold",
    "0",
    "--jobs",
    "2",
    ...PACKS.flatMap((pack) => ["--config", pack]),
  ]
  const scan = (directory: string, targets = ["."]): Result => {
    const result = invoke("semgrep", [...args, ...targets], directory)
    if (result.code !== 0) throw new Error(`semgrep failed with exit ${result.code}`)
    const value = JSON.parse(result.stdout) as Result
    if (!Array.isArray(value.results) || !Array.isArray(value.errors) || !Array.isArray(value.paths?.scanned))
      throw new Error("invalid Semgrep result")
    return value
  }
  const source = scan(root)
  const failures = source.errors.filter((error) => !partial(error))
  mkdirSync(supplement, { recursive: true, mode: 0o700 })
  writeFileSync(resolve(supplement, "source.json"), `${JSON.stringify(source)}\n`, { mode: 0o600 })
  if (failures.length) {
    if (
      failures.some(
        (error) => error.type !== "Syntax error" || !error.path || ![".ts", ".tsx"].includes(extname(error.path)),
      )
    )
      throw new Error("Semgrep reported an unrecoverable error")
    const files = [...new Set(failures.map((error) => within(error.path as string, root)))]
    const compiled = resolve(supplement, "runtime")
    // ES2019 lowers the syntax rejected by the pinned parser; imports are never bundled or executed.
    const build = invoke(
      "pnpm",
      [
        "dlx",
        `esbuild@${ESBUILD}`,
        ...files.map((file) => `./${file}`),
        `--outdir=${compiled}`,
        "--outbase=.",
        "--platform=node",
        "--target=es2019",
        "--format=esm",
        "--charset=ascii",
        "--sourcemap=external",
        "--sources-content=true",
        "--log-level=error",
      ],
      root,
    )
    if (build.code !== 0) throw new Error(`runtime coverage compilation failed with exit ${build.code}`)
    const expected = files.map((file) => file.replace(/\.(?:tsx|ts)$/, ".js"))
    const fallback = scan(
      compiled,
      expected.map((file) => `./${file}`),
    )
    writeFileSync(resolve(supplement, "runtime.json"), `${JSON.stringify(fallback)}\n`, { mode: 0o600 })
    if (fallback.errors.length) throw new Error("Semgrep runtime fallback contains parsing or analysis errors")
    const scanned = new Set(fallback.paths.scanned.map((file) => within(file, compiled)))
    if (expected.some((file) => !scanned.has(file)))
      throw new Error("runtime fallback did not scan every failed source")
    const original = new Map(expected.map((file, index) => [file, files[index] as string]))
    for (const match of fallback.results) {
      const file = within(match.path, compiled),
        sourcePath = original.get(file)
      if (!sourcePath) throw new Error("runtime match has no original source")
      const map = new SourceMap(JSON.parse(readFileSync(resolve(compiled, `${file}.map`), "utf8")))
      const mapped = (point: { line: number; col: number }) => {
        const entry = map.findEntry(point.line - 1, point.col - 1)
        if (
          !("originalLine" in entry) ||
          !("originalColumn" in entry) ||
          typeof entry.originalLine !== "number" ||
          typeof entry.originalColumn !== "number"
        )
          throw new Error("runtime match cannot be mapped to original source")
        return { ...point, line: entry.originalLine + 1, col: entry.originalColumn + 1 }
      }
      source.results.push({ ...match, path: sourcePath, start: mapped(match.start), end: mapped(match.end) })
    }
    source.errors = source.errors.filter(partial)
    source.runtimeCoverage = {
      compiler: `esbuild ${ESBUILD}`,
      target: "es2019",
      sources: files,
      typeSyntaxAnalyzed: false,
      originalErrors: relative(dirname(output), resolve(supplement, "source.json")),
      runtimeResults: relative(dirname(output), resolve(supplement, "runtime.json")),
    }
  }
  source.results = [
    ...new Map(
      source.results.map((match) => [
        JSON.stringify([match.check_id, match.path, match.start.line, match.start.col]),
        match,
      ]),
    ).values(),
  ]
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(source)}\n`, { mode: 0o600 })
  return source
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    scanSemgrep(
      resolve(process.argv[2] as string),
      resolve(process.argv[3] as string),
      resolve(process.argv[4] as string),
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Semgrep coverage failed")
    process.exitCode = 1
  }
}
