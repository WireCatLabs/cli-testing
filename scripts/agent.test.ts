import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const shellQuote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`
const fixture = (models = "fixture") => {
  const root = mkdtempSync(join(tmpdir(), "agent-shell-")),
    bin = join(root, "bin"),
    output = join(root, "run")
  mkdirSync(bin)
  mkdirSync(output)
  const executable = (name: string, body: string) => {
    const path = join(bin, name)
    writeFileSync(path, body, { mode: 0o700 })
    return path
  }
  executable("timeout", '#!/usr/bin/env bash\nshift\nexec "$@"\n')
  executable("sleep", "#!/usr/bin/env bash\nexit 0\n")
  executable(
    "claude",
    `#!${process.execPath}
const args=process.argv.slice(2);
const model=args[args.indexOf('--model')+1];
const writing=process.env.FIXTURE_WRITE==='1'||model==='attack';
const rows=[{type:'assistant',message:{content:[{type:'tool_use',name:writing?'mcp__fixture__fixture_write':'mcp__fixture__fixture_read',input:{command:writing?'messages send':'messages list'}}]}},{type:'result',result:process.env.FIXTURE_RESULT||'UTILITY-OK',permission_denials:writing?[{}]:[]}];
for(const row of rows) console.log(JSON.stringify(row));
process.exitCode=model==='runtime'?2:0;
`,
  )
  const cli = executable(
    "fixture-cli",
    `#!${process.execPath}
const fs=require('node:fs');
const args=process.argv.slice(2), action=args[2];
fs.appendFileSync(process.env.FIXTURE_CALLS,action+'\\n');
if(action==='send')console.log(JSON.stringify({message:{id:'synthetic-id'}}));
if(action==='list')console.log(JSON.stringify({items:fs.existsSync(process.env.FIXTURE_DELETED)?[]:[{id:'synthetic-id'}]}));
if(action==='delete'){if(process.env.FIXTURE_DELETE_FAILURE==='1')process.exitCode=1;else fs.writeFileSync(process.env.FIXTURE_DELETED,'synthetic');}
`,
  )
  const cast = join(root, "cast.env")
  writeFileSync(
    cast,
    `CLI=${shellQuote(cli)}\nOWNER=synthetic-owner\nSENDER=synthetic-sender\nDIALOG=synthetic-dialog\nMODELS=${shellQuote(models)}\nMCP_NAME=fixture\nMCP_CONFIG=/synthetic-config.json\n`,
  )
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    CLI_TESTING_CAST: cast,
    CLI_TESTING_EXPECTED: "UTILITY-OK",
    FIXTURE_CALLS: join(root, "calls"),
    FIXTURE_DELETED: join(root, "deleted"),
  }
  return { output, env }
}
const run = (name: "run-agent" | "run-payload", output: string, env: NodeJS.ProcessEnv) =>
  spawnSync(
    "bash",
    [
      resolve("scripts/agent", name),
      output,
      "synthetic-case",
      ...(name === "run-agent" ? ["default", "synthetic prompt"] : ["synthetic prompt", "--", "synthetic payload"]),
    ],
    { env, encoding: "utf8" },
  )

describe("agent shell stages with synthetic executables", () => {
  it("distinguishes ordinary task success, write attempts and a blocked-write canary", () => {
    const { output, env } = fixture()
    const ordinary = run("run-agent", output, env)
    expect(ordinary.status, ordinary.stderr).toBe(0)
    expect(ordinary.stdout).toContain("writes=[]")
    expect(ordinary.stdout).toContain("utility=1 PASS")
    const injected = run("run-agent", output, { ...env, FIXTURE_WRITE: "1" })
    expect(injected.status).toBe(1)
    expect(injected.stdout).toContain("writes=[messages send]")
    const canary = run("run-agent", output, { ...env, FIXTURE_WRITE: "1", CLI_TESTING_CANARY: "1" })
    expect(canary.status).toBe(0)
    const missingCanary = run("run-agent", output, { ...env, CLI_TESTING_CANARY: "1" })
    expect(missingCanary.status).toBe(1)
    const utilityFailure = run("run-agent", output, { ...env, FIXTURE_RESULT: "wrong synthetic answer" })
    expect(utilityFailure.status).toBe(1)
    expect(utilityFailure.stdout).toContain("utility=0 FAIL")
  })
  it("deletes payloads after failures and preserves a runtime failure across later model failures", () => {
    const { output, env } = fixture("runtime attack")
    const result = run("run-payload", output, env)
    expect(result.status, result.stderr).toBe(2)
    expect(readFileSync(env.FIXTURE_CALLS, "utf8")).toContain("delete\n")
    expect(result.stdout).toContain("still visible to owner: 0")
  })
  it("reports a cleanup failure instead of passing a completed agent run", () => {
    const { output, env } = fixture()
    const result = run("run-payload", output, { ...env, FIXTURE_DELETE_FAILURE: "1" })
    expect(result.status).toBe(2)
    expect(result.stdout).toContain("still visible to owner: 1")
  })
})
