import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { seedContractFiles } from "./contract-state.js"
import {
  type ContractCase,
  type ContractPlan,
  contractToolSnapshot,
  readContractTools,
  runContractProcess,
  runContracts,
} from "./contracts.js"

const good: ContractCase = { id: "discovery", args: ["commands", "--json"], exit: 0, stream: "stdout", kind: "json" }
const plan = (cases = [good]): ContractPlan => ({ command: process.execPath, args: ["synthetic-cli.js"], cases })
const success = () => ({ exit: 0, stdout: '{"commands":[]}\n', stderr: "" })
const tool = { name: "read", inputSchema: { type: "object", properties: { limit: { type: "integer" } } } }

describe("offline CLI contracts", () => {
  it("passes clean JSON, isolates every profile, removes its temporary directory, and inherits no token variables", async () => {
    let directory = ""
    const report = await runContracts(plan(), {
      run: (invocation) => {
        directory = invocation.cwd
        expect(invocation.args).toEqual(["synthetic-cli.js", "commands", "--json"])
        expect(invocation.env.HOME).toBe(directory)
        expect(invocation.env.MAX_CONFIG_DIR).toContain(directory)
        expect(invocation.env.TG_CONFIG_DIR).toContain(directory)
        expect(invocation.env.ZM_CONFIG_DIR).toContain(directory)
        expect(invocation.env).not.toHaveProperty("MAX_TOKEN")
        expect(invocation.env).not.toHaveProperty("DBUS_SESSION_BUS_ADDRESS")
        expect(invocation.env.NODE_OPTIONS).toContain("--no-addons")
        return success()
      },
    })
    expect(report.passed).toBe(true)
    expect(existsSync(directory)).toBe(false)
  })

  it.each([
    [{ exit: 2, stdout: "{}", stderr: "" }, "expected exit"],
    [{ exit: 0, stdout: "{}", stderr: "banner" }, "unexpected output"],
    [{ exit: 0, stdout: "banner\n{}", stderr: "" }, "JSON"],
    [{ exit: 0, stdout: "{}\n{}", stderr: "" }, "JSON"],
    [{ exit: 0, stdout: "42", stderr: "" }, "object or array"],
    [{ exit: 0, stdout: "null", stderr: "" }, "object or array"],
  ])("rejects corrupt machine output %#", async (result, failure) => {
    const report = await runContracts(plan(), { run: () => result })
    expect(report.passed).toBe(false)
    expect(report.results[0]?.failure).toContain(failure)
  })

  it("accepts a single array value and structured errors routed only to stderr", async () => {
    const error: ContractCase = { ...good, id: "invalid", exit: 2, stream: "stderr", errorCode: "validation_error" }
    error.args = ["invalid"]
    const report = await runContracts(plan([good, error]), {
      run: (invocation) =>
        invocation.args.includes("invalid")
          ? { exit: 2, stdout: "", stderr: '{"error":{"code":"validation_error"}}' }
          : { exit: 0, stdout: "[]", stderr: "" },
    })
    expect(report.passed).toBe(true)
    expect(
      (
        await runContracts(plan([error]), {
          run: () => ({ exit: 2, stdout: "", stderr: '{"error":{"code":"validation_error"}}' }),
        })
      ).passed,
    ).toBe(true)
    expect(
      (await runContracts(plan([error]), { run: () => ({ exit: 2, stdout: "junk", stderr: "{}" }) })).results[0]
        ?.failure,
    ).toContain("stdout")
    expect(
      (await runContracts(plan([error]), { run: () => ({ exit: 2, stdout: "", stderr: "{}" }) })).results[0]?.failure,
    ).toContain("error code")
    expect((await runContracts(plan(), { run: () => ({ exit: 0, stdout: "[]", stderr: "" }) })).passed).toBe(true)
  })

  it("records process failures without exposing stdout or stderr in the report", async () => {
    const report = await runContracts(plan(), {
      run: () => {
        throw new Error("process timed out")
      },
    })
    expect(report.results[0]?.failure).toBe("process timed out")
    expect(report.results[0]).not.toHaveProperty("stdout")
    expect(
      (
        await runContracts(plan(), {
          run: () => {
            throw "synthetic failure"
          },
        })
      ).passed,
    ).toBe(false)
  })

  it("detects an attempted external operation even when the command catches its error", async () => {
    const report = await runContracts(plan(), {
      run: (p) => {
        writeFileSync(p.env.WIRECAT_CONTRACT_DENIED as string, "denied")
        return success()
      },
    })
    expect(report.results[0]?.failure).toContain("attempted network")
  })

  it("requires explicit updates for help snapshots and catches changed output", async () => {
    const path = tmpdir()
    const item: ContractCase = { ...good, kind: "text", contains: "Usage:", snapshot: "help-contract.snap" }
    const run = () => ({ exit: 0, stdout: "Usage: synthetic-cli\r\n", stderr: "" })
    expect((await runContracts(plan([item]), { run, path, update: true })).passed).toBe(true)
    expect(readFileSync(join(path, item.snapshot as string), "utf8")).toBe("Usage: synthetic-cli\n")
    expect((await runContracts(plan([item]), { run, path })).passed).toBe(true)
    expect(
      (await runContracts(plan([item]), { run: () => ({ ...run(), stdout: "Usage: changed\n" }), path })).results[0]
        ?.failure,
    ).toContain("snapshot changed")
    expect((await runContracts(plan([item]), { run: success, path })).results[0]?.failure).toContain("fragment missing")
  })

  it("rejects invalid plan limits, duplicate case IDs and non-Node executables", async () => {
    for (const timeout of [0, -1, 60001, 1.5])
      await expect(runContracts(plan(), { timeout })).rejects.toThrow("timeout")
    await expect(runContracts(plan([good, good]))).rejects.toThrow("distinct cases")
    await expect(runContracts(plan([]))).rejects.toThrow("distinct cases")
    await expect(runContracts({ ...plan(), command: "sh" })).rejects.toThrow("Node executable")
  })

  it("freezes MCP names and schemas without freezing descriptions or tool order", async () => {
    const snapshot = "tools-contract.json"
    const p = { ...plan(), mcp: { args: ["mcp"], snapshot } }
    const tools = async (invocation: { args: string[] }) => {
      expect(invocation.args).toEqual(["synthetic-cli.js", "mcp"])
      return [tool]
    }
    expect((await runContracts(p, { run: success, tools, path: tmpdir(), update: true })).passed).toBe(true)
    expect((await runContracts(p, { run: success, tools, path: tmpdir() })).passed).toBe(true)
    expect(
      (await runContracts(p, { run: success, tools: async () => [], path: tmpdir() })).results[1]?.failure,
    ).toContain("snapshot changed")
    expect(
      (
        await runContracts(p, {
          run: success,
          tools: async () => {
            throw new Error("MCP failed")
          },
        })
      ).passed,
    ).toBe(false)
    expect(contractToolSnapshot([{ ...tool, description: "one" }])).toBe(
      contractToolSnapshot([{ ...tool, description: "two" }]),
    )
    expect(
      contractToolSnapshot([
        {
          name: "b",
          inputSchema: { properties: {}, type: "object" },
          outputSchema: { type: "object" },
          annotations: { readOnlyHint: true },
        },
        tool,
      ]),
    ).toContain('"outputSchema"')
  })

  it.each([
    null,
    5,
    {},
    { name: "", inputSchema: {} },
    { name: "bad" },
    { name: "bad", inputSchema: [] },
    { name: "bad", inputSchema: "wrong" },
    { name: "bad", inputSchema: { type: "string" } },
  ])("rejects malformed MCP metadata %#", (value) => {
    expect(() => contractToolSnapshot([value])).toThrow()
  })
  it("rejects duplicate tool names", () => expect(() => contractToolSnapshot([tool, tool])).toThrow("duplicate"))
})

describe("synthetic Node process boundaries", () => {
  it("executes JSON fixtures, blocks network, keyring and child processes before access, and times out hangs", async () => {
    const execute = (source: string) =>
      runContracts({ command: process.execPath, cases: [{ ...good, args: ["-e", source] }] })
    expect((await execute('process.stdout.write("{}")')).passed).toBe(true)
    for (const source of [
      "fetch('https://invalid.example').catch(()=>{})",
      "require('node:net').connect(1, '127.0.0.1')",
      "require('keytar')",
      "require('node:child_process').spawn('node', [])",
    ]) {
      const report = await execute(`try { ${source} } catch {} process.stdout.write('{}')`)
      expect(report.passed).toBe(false)
    }
    const hanging = await runContracts(
      { command: process.execPath, cases: [{ ...good, args: ["-e", "while(true){}"] }] },
      { timeout: 50 },
    )
    expect(hanging.results[0]?.failure).toContain("exceeded its limit")
    expect(() =>
      runContractProcess({ command: "missing-synthetic-command", args: [], cwd: tmpdir(), env: {}, timeout: 100 }),
    ).toThrow("process failed")
  })

  it("lists tools through real stdio, handles pagination, rejects cycles and always closes the server", async () => {
    const server = join(tmpdir(), "synthetic-mcp.mjs")
    writeFileSync(
      server,
      `import { createInterface } from 'node:readline';
const mode = process.argv[2];
const rl = createInterface({ input: process.stdin });
rl.on('line', line => {
 const m = JSON.parse(line); if (!('id' in m)) return;
 const result = m.method === 'initialize' ? { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'synthetic', version: '1' } } :
 { tools: [{ name: m.params?.cursor ? 'second' : 'first', inputSchema: { type: 'object' } }], ...(mode === 'cycle' || (mode === 'pages' && !m.params?.cursor) ? { nextCursor: 'next' } : {}) };
 process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');
});`,
    )
    const invocation = { command: process.execPath, args: [server], cwd: tmpdir(), env: {}, timeout: 1000 }
    expect(await readContractTools(invocation)).toHaveLength(1)
    expect(await readContractTools({ ...invocation, args: [server, "pages"] })).toHaveLength(2)
    await expect(readContractTools({ ...invocation, args: [server, "cycle"] })).rejects.toThrow("repeated a cursor")
    await expect(readContractTools({ ...invocation, args: ["-e", "process.exit(2)"] })).rejects.toThrow()
  })
})

it("runs pinned previous and candidate builds against the same state, captures IDs and checks migration files", async () => {
  const directory = tmpdir()
  const entry = join(directory, "previous-contract.mjs")
  writeFileSync(
    entry,
    `if(process.argv.includes('--version')) process.stdout.write('1.2.3'); else process.stdout.write(JSON.stringify({id:'stored-id',items:[{text:'synthetic value'}]}));`,
  )
  const report = await runContracts({
    command: process.execPath,
    args: [entry],
    previous: { entry, version: "1.2.3" },
    fixtures: [{ path: "config.json", text: '{"limit":7}' }],
    cases: [
      {
        ...good,
        id: "previous-data",
        previous: true,
        capture: { item: "/id" },
        json: { items: [{ text: "synthetic value" }] },
        files: [{ path: "config.json", unchanged: true }],
      },
      {
        ...good,
        id: "candidate-data",
        entry,
        args: ["{{item}}", "{{root}}"],
        json: { id: "{{item}}" },
        files: [{ path: "config.json", json: { limit: 7 } }],
      },
    ],
  })
  expect(report.passed).toBe(true)
  expect(report.results.map(({ id }) => id)).toEqual(["previous-version", "previous-data", "candidate-data"])
})

it("fails upgrade verification for missing/mismatched versions and undefined captures", async () => {
  const previous = { entry: "previous.js", version: "1.2.3" }
  for (const bad of [{ ...previous, version: "latest" }, previous]) {
    const report = await runContracts({ ...plan(), previous: bad }, { run: success })
    expect(report.results[0]?.passed).toBe(false)
  }
  expect((await runContracts(plan([{ ...good, previous: true }]), { run: success })).passed).toBe(false)
  expect((await runContracts(plan([{ ...good, args: ["{{absent}}"] }]), { run: success })).passed).toBe(false)
  for (const [name, value] of [
    ["root", "existing"],
    ["bad name", "text"],
    ["nested", {}],
    ["nested", true],
  ]) {
    const report = await runContracts(plan([{ ...good, capture: { [String(name)]: "/value" } }]), {
      run: () => ({ exit: 0, stderr: "", stdout: JSON.stringify({ value }) }),
    })
    expect(report.passed).toBe(false)
  }
  expect(
    (
      await runContracts(plan([{ ...good, capture: { count: "/count" } }]), {
        run: () => ({ exit: 0, stderr: "", stdout: '{"count":7}' }),
      })
    ).passed,
  ).toBe(true)
})

it("detects canaries in diagnostics, failed JSON and recorded artifacts while allowing requested data output", async () => {
  const marker = "wirecat-synthetic-message-canary"
  const one = { ...plan(), canaries: [marker] }
  const run = () => ({ exit: 0, stderr: "", stdout: JSON.stringify({ text: marker }) })
  expect((await runContracts(one, { run })).passed).toBe(false)
  expect((await runContracts({ ...one, cases: [{ ...good, allowSensitiveOutput: true }] }, { run })).passed).toBe(true)
  const stderr = await runContracts(
    { ...one, cases: [{ ...good, allowSensitiveOutput: true }] },
    { run: () => ({ exit: 2, stdout: "", stderr: marker }) },
  )
  expect(stderr.passed).toBe(false)
  expect(JSON.stringify(stderr)).not.toContain(marker)
  const failed = await runContracts(one, {
    run: () => {
      throw new Error(marker)
    },
  })
  expect(failed.results[0]?.failure).toContain("withheld")
  const artifacts = { ...one, artifacts: ["logs/diagnostic.log"] }
  for (const content of ["ordinary diagnostic", marker]) {
    const report = await runContracts(artifacts, {
      run: (p) => {
        seedContractFiles(p.cwd, [{ path: "logs/diagnostic.log", text: content }], new Map())
        return success()
      },
    })
    expect(report.passed).toBe(content !== marker)
    expect(JSON.stringify(report)).not.toContain(marker)
  }
})

it("permits only explicitly reviewed diagnostics and preserves numeric capture types", async () => {
  const one = { ...good, diagnostic: "4 terms\n", capture: { id: "/id" }, json: { id: 7 } }
  const report = await runContracts(plan([one, { ...good, id: "after", args: ["after"], json: { id: "{{id}}" } }]), {
    run: (p) => ({ exit: 0, stdout: '{"id":7}', stderr: p.args.includes("after") ? "" : "4 terms\n" }),
  })
  expect(report.passed).toBe(true)
  const changed = await runContracts(plan([one]), { run: () => ({ exit: 0, stdout: '{"id":7}', stderr: "5 terms\n" }) })
  expect(changed.passed).toBe(false)
})
