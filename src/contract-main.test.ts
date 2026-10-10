import { readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, expect, it, vi } from "vitest"
import { contractMain } from "./contract-main.js"

afterEach(() => vi.restoreAllMocks())

const fixture = () => {
  const script = join(tmpdir(), "contract-cli-fixture.mjs")
  const plan = join(tmpdir(), "contract-plan.json")
  writeFileSync(script, 'process.stdout.write("{}")')
  writeFileSync(
    plan,
    JSON.stringify({
      command: "node",
      args: ["./contract-cli-fixture.mjs"],
      cases: [{ id: "fixture", args: [], exit: 0, kind: "json", stream: "stdout", snapshot: "cli-output.snap" }],
    }),
  )
  return plan
}

it("runs a file-based plan, resolves the Node entry point, and updates snapshots only explicitly", async () => {
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true)
  const plan = fixture()
  expect(await contractMain([plan, "--update"])).toBe(0)
  expect(readFileSync(join(tmpdir(), "cli-output.snap"), "utf8")).toBe("{}")
  expect(await contractMain([plan])).toBe(0)
  expect(output).toHaveBeenLastCalledWith(expect.stringContaining('"passed":true'))
  writeFileSync(join(tmpdir(), "cli-output.snap"), "changed")
  expect(await contractMain([plan])).toBe(1)
})

it("rejects incomplete or unknown arguments and malformed plans", async () => {
  for (const args of [[], ["file", "--unknown"], ["file", "--update", "extra"]])
    await expect(contractMain(args)).rejects.toThrow("usage:")
  await expect(contractMain([join(tmpdir(), "missing-plan.json")])).rejects.toThrow()
  const plan = fixture()
  writeFileSync(plan, "bad JSON")
  await expect(contractMain([plan])).rejects.toThrow()
  writeFileSync(
    plan,
    JSON.stringify({
      command: process.execPath,
      cases: [{ id: "fixture", args: ["-e", 'process.stdout.write("[]")'], exit: 0, kind: "json", stream: "stdout" }],
    }),
  )
  vi.spyOn(process.stdout, "write").mockReturnValue(true)
  expect(await contractMain([plan])).toBe(0)
})

it.each(["success", "failure"])("the executable entry point returns a machine-readable %s", async (mode) => {
  const saved = process.argv
  const exit = process.exitCode
  const output = vi.spyOn(process.stdout, "write").mockReturnValue(true)
  const diagnostic = vi.spyOn(process.stderr, "write").mockReturnValue(true)
  const source = fileURLToPath(new URL("./contract-main.ts", import.meta.url))
  try {
    process.argv = [process.execPath, source, ...(mode === "success" ? [fixture(), "--update"] : [])]
    vi.resetModules()
    await import("./contract-main.js")
    expect(process.exitCode).toBe(mode === "success" ? 0 : 2)
    if (mode === "success") expect(output).toHaveBeenCalledWith(expect.stringContaining('"passed":true'))
    else expect(diagnostic).toHaveBeenCalledWith('{"error":"contract setup failed"}\n')
  } finally {
    process.argv = saved
    process.exitCode = exit
  }
})
