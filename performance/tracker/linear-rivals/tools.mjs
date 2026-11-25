// How each contestant is installed and run. Every tool gets its own folders under WORK_DIR and an empty working
// directory, so none reads the owner's home, a .env file or another tool's sign-in. The token comes from the keyring
// in this process and reaches a tool only through its environment (rivals) or its stdin (ours).
import { execFileSync, spawn } from "node:child_process"
import { mkdirSync, readFileSync, rmSync } from "node:fs"
import { dirname, join } from "node:path"

// LINEAR_BENCH_OURS runs a local build of ours instead of the pinned package, named by LINEAR_BENCH_OURS_LABEL.
const LOCAL_OURS = process.env.LINEAR_BENCH_OURS

export const VERSIONS = {
  ours: LOCAL_OURS ? (process.env.LINEAR_BENCH_OURS_LABEL ?? LOCAL_OURS) : "@wirecat/linear-cli@0.3.1",
  memo: "@wirecat/cli-memo@0.152.0",
  linearis: "linearis@2026.8.0",
  schpet:
    "schpet/linear-cli v3.1.0 (linear-x86_64-unknown-linux-gnu.tar.xz, sha256 bf7712097ce6a01e8a379de8357eca66d5748050201d336ba787b6ad3687f3e7)",
  mcp: "https://mcp.linear.app/mcp through @modelcontextprotocol/sdk@1.20.0",
}

const COUNTER = join(dirname(new URL(import.meta.url).pathname), "count-requests.mjs")

// The test workspace's key: keyring entry `service linear account <LINEAR_BENCH_ACCOUNT>`. No default, so a run never
// picks an account on its own.
export const token = () => {
  const account = process.env.LINEAR_BENCH_ACCOUNT
  if (!account) throw new Error("set LINEAR_BENCH_ACCOUNT to the keyring account of the Linear test workspace's key")
  const secret = execFileSync("secret-tool", ["lookup", "service", "linear", "account", account], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim()
  if (!secret) throw new Error(`no keyring entry service linear account ${account}`)
  return secret
}

export const tools = (work) => {
  const bins = {
    ours: LOCAL_OURS ?? join(work, "rivals/ours/node_modules/@wirecat/linear-cli/dist/bin/linear.js"),
    memo: join(work, "rivals/memo/node_modules/@wirecat/cli-memo/dist/bin/memo.js"),
    linearis: join(work, "rivals/linearis/node_modules/linearis/dist/main.js"),
    schpet: join(work, "rivals/schpet/linear-x86_64-unknown-linux-gnu/linear"),
  }
  const folder = (name) => {
    const root = join(work, "run", name)
    for (const one of ["home", "cwd", "xdg/config", "xdg/data", "xdg/state", "xdg/cache"]) {
      mkdirSync(join(root, one), { recursive: true })
    }
    return {
      root,
      cwd: join(root, "cwd"),
      env: {
        PATH: process.env.PATH,
        LANG: "C.UTF-8",
        TZ: "Europe/Madrid",
        HOME: join(root, "home"),
        XDG_CONFIG_HOME: join(root, "xdg/config"),
        XDG_DATA_HOME: join(root, "xdg/data"),
        XDG_STATE_HOME: join(root, "xdg/state"),
        XDG_CACHE_HOME: join(root, "xdg/cache"),
        DBUS_SESSION_BUS_ADDRESS: "disabled:",
        NO_COLOR: "1",
      },
    }
  }
  const ours = folder("ours")
  Object.assign(ours.env, {
    WCLINEAR_CONFIG_DIR: join(ours.root, "config"),
    WCLINEAR_STATE_DIR: join(ours.root, "state"),
    WCLINEAR_CACHE_DIR: join(ours.root, "cache"),
    MESSAGING_STORE: join(ours.root, "wirecat.db"),
  })
  const linearis = folder("linearis")
  const schpet = folder("schpet")
  Object.assign(schpet.env, { LINEAR_IGNORE_ENV_FILE: "1" })
  return { bins, ours, linearis, schpet }
}

// Runs a command and times it from spawn to exit. A Node tool runs under count-requests.mjs.
export const run = (command, args, { cwd, env, input, node = false }) =>
  new Promise((resolve) => {
    const countFile = join(cwd, "..", `requests-${process.pid}-${Math.random().toString(36).slice(2)}.json`)
    const argv = node ? ["--import", COUNTER, command, ...args] : args
    const started = process.hrtime.bigint()
    const child = spawn(node ? process.execPath : command, argv, {
      cwd,
      env: { ...env, ...(node ? { REQUEST_COUNT_FILE: countFile } : {}) },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => (stdout += chunk))
    child.stderr.on("data", (chunk) => (stderr += chunk))
    child.stdin.end(input ?? "")
    child.on("close", (status) => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6
      let requests = null
      if (node) {
        try {
          requests = JSON.parse(readFileSync(countFile, "utf8")).requests
          rmSync(countFile)
        } catch {}
      }
      resolve({ status, stdout, stderr, ms, requests })
    })
  })

// The SDK is installed by setup.sh under WORK_DIR, not in this repository.
export const mcpClient = async (work, secret) => {
  const sdk = join(work, "rivals/mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client")
  const { Client } = await import(join(sdk, "index.js"))
  const { StreamableHTTPClientTransport } = await import(join(sdk, "streamableHttp.js"))
  const transport = new StreamableHTTPClientTransport(new URL("https://mcp.linear.app/mcp"), {
    requestInit: { headers: { authorization: `Bearer ${secret}` } },
  })
  const client = new Client({ name: "wirecat-bench", version: "0.0.0" })
  await client.connect(transport)
  const { tools: list } = await client.listTools()
  const call = async (name, args) => {
    const started = process.hrtime.bigint()
    try {
      const answer = await client.callTool({ name, arguments: args })
      const text = (answer.content ?? []).map((one) => one.text ?? "").join("\n")
      return {
        status: answer.isError ? 1 : 0,
        stdout: text,
        stderr: "",
        ms: Number(process.hrtime.bigint() - started) / 1e6,
        requests: 1,
      }
    } catch (error) {
      return {
        status: 1,
        stdout: "",
        stderr: String(error.message),
        ms: Number(process.hrtime.bigint() - started) / 1e6,
        requests: 1,
      }
    }
  }
  return { call, toolsChars: JSON.stringify(list).length, toolCount: list.length, close: () => client.close() }
}
