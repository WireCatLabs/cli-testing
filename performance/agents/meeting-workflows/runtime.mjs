import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const digest = (value) =>
  createHash("sha256")
    .update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value))
    .digest("hex")
export const selectors = {
  search: "ref,excerpt,source.title,source.started_at,source.url",
  passage: "target_ref,target_fingerprint,items.ref,items.start_ms,items.speaker_name,items.text",
}
const guard = fileURLToPath(new URL("./guard.cjs", import.meta.url))
export function runner(install, directory) {
  mkdirSync(directory, { recursive: true })
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    XDG_CONFIG_HOME: join(directory, "xdg-config"),
    XDG_STATE_HOME: join(directory, "xdg-state"),
    XDG_CACHE_HOME: join(directory, "xdg-cache"),
    ZM_CONFIG_DIR: join(directory, "config"),
    ZM_STATE_DIR: join(directory, "state"),
    ZM_CACHE_DIR: join(directory, "cache"),
    WIRECAT_STATE_DIR: join(directory, "wirecat"),
    MESSAGING_STORE: join(directory, "store.db"),
    TMPDIR: directory,
    TMP: directory,
    TEMP: directory,
    MEETING_BENCH_LOADED: join(directory, "guard-loaded"),
    MEETING_BENCH_DENIED: join(directory, "guard-denied"),
  }
  const calls = []
  function invoke(args, { selector, input } = {}) {
    const argv = [...args, "--offline", selector ? `--json=${selector}` : "--json"]
    const start = performance.now()
    const result = spawnSync(
      process.execPath,
      ["--no-addons", "--require", guard, resolve(install, "node_modules/@wirecat/zoom-cli/dist/bin/zm.js"), ...argv],
      { env, cwd: directory, input, encoding: "utf8", timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
    )
    const elapsed = performance.now() - start
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, `${args[0]} failed: ${result.stderr}`)
    assert.equal(existsSync(env.MEETING_BENCH_DENIED), false, "external access attempted")
    assert.equal(existsSync(env.MEETING_BENCH_LOADED), true)
    const stderr = result.stderr.replace(
      /\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature and might change at any time\r?\n(?:\(Use .+?\r?\n)?/g,
      "",
    )
    assert.equal(stderr, "")
    const answer = JSON.parse(result.stdout)
    calls.push({
      command: args.slice(0, 2),
      elapsed_ms: elapsed,
      stdout_bytes: Buffer.byteLength(result.stdout),
      stdin_bytes: Buffer.byteLength(input ?? ""),
      stdout_sha256: digest(result.stdout),
      argv_bytes: Buffer.byteLength(JSON.stringify(argv)),
      complete: answer.meta?.complete,
    })
    return answer
  }
  function requests(inputs, mode, { selector, budget } = {}) {
    if (mode.startsWith("single")) {
      const items = inputs.map((request) => {
        const answer = invoke([...request.command, ...request.args], { selector })
        return { id: request.id, status: "ok", complete: answer.meta.complete, answer }
      })
      return { items, meta: { complete: items.every((item) => item.complete) } }
    }
    const args = ["batch", "-"]
    if (budget !== undefined) args.push("--max-read-bytes", String(budget))
    const answer = invoke(args, { selector, input: JSON.stringify({ requests: inputs }) })
    assert.deepEqual(
      answer.items.map((item) => item.id),
      inputs.map((item) => item.id),
    )
    assert.equal(answer.items.length, inputs.length)
    return answer
  }
  return { directory, env, calls, invoke, requests }
}
export function installedMetadata(install) {
  const lock = JSON.parse(readFileSync(join(install, "package-lock.json"), "utf8"))
  const names = ["zoom-cli", "cli-core", "cli-base"]
  return Object.fromEntries(
    names.map((name) => {
      const entry = lock.packages[`node_modules/@wirecat/${name}`]
      assert.ok(entry)
      return [name, { version: entry.version, integrity: entry.integrity }]
    }),
  )
}
