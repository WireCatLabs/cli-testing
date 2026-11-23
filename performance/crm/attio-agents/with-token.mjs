#!/usr/bin/env node
// Runs a command with the workspace's Attio token, read from the keyring in this process and never printed: on the
// command's stdin (`--stdin`) or in one environment variable of the command only (`--env NAME`).
//   node with-token.mjs --stdin <command> [args…]
//   node with-token.mjs --env ATTIO_API_KEY <command> [args…]
// The keyring entry is `service attio account <ATTIO_AGENTS_KEYRING_ACCOUNT or leemour>`.
import { execFileSync, spawn } from "node:child_process"

const KEYRING = ["service", "attio", "account", process.env.ATTIO_AGENTS_KEYRING_ACCOUNT ?? "leemour"]
const [mode, ...rest] = process.argv.slice(2)
const name = mode === "--env" ? rest.shift() : undefined
const [command, ...args] = rest
if (!command || (mode !== "--stdin" && !name)) {
  process.stderr.write("usage: with-token.mjs --stdin <command> … | --env NAME <command> …\n")
  process.exit(2)
}
const token = execFileSync("secret-tool", ["lookup", ...KEYRING], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
}).trim()
if (!token) {
  process.stderr.write(`no keyring entry ${KEYRING.join(" ")}\n`)
  process.exit(3)
}
const child = spawn(command, args, {
  env: name ? { ...process.env, [name]: token } : process.env,
  stdio: [name ? "inherit" : "pipe", "inherit", "inherit"],
})
if (!name) child.stdin.end(token)
// A client that stops this process (Claude Code at the end of a session) stops the command too, so no server is left.
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(signal, () => child.kill(signal))
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)))
