import childProcess from "node:child_process"
import http from "node:http"
import https from "node:https"
import { syncBuiltinESMExports } from "node:module"
import net from "node:net"

const denied = () => {
  throw new Error("synthetic cross-CLI check refuses network, browser and keyring")
}
globalThis.fetch = denied
http.request = denied
http.get = denied
https.request = denied
https.get = denied
net.Socket.prototype.connect = denied
for (const method of ["spawn", "exec", "execFile", "spawnSync", "execSync", "execFileSync"])
  childProcess[method] = denied
syncBuiltinESMExports()
