const fs = require("node:fs")
const mod = require("node:module")
const deny = () => {
  fs.appendFileSync(process.env.MEETING_BENCH_DENIED, "denied\n")
  throw new Error("meeting benchmark denied network, child process or keyring access")
}
fs.writeFileSync(process.env.MEETING_BENCH_LOADED, "loaded")
globalThis.fetch = deny
for (const name of ["node:http", "node:https"]) {
  const api = require(name)
  api.request = api.get = deny
}
const net = require("node:net")
net.connect = net.createConnection = net.Socket.prototype.connect = deny
require("node:tls").connect = deny
const child = require("node:child_process")
for (const name of ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"]) child[name] = deny
const load = mod._load
mod._load = function (name, ...args) {
  if (name.startsWith("@napi-rs/keyring") || name === "keytar") return deny()
  return load.call(this, name, ...args)
}
mod.syncBuiltinESMExports()
