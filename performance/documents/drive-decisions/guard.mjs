import { createRequire, syncBuiltinESMExports } from "node:module"

const require = createRequire(`${process.env.DRIVE_TEST_PACKAGE}/package.json`)
const deny = () => {
  throw new Error("Unexpected network/browser/keyring access")
}
globalThis.fetch = deny
for (const name of ["node:http", "node:https"]) {
  const module = require(name)
  module.request = deny
  module.get = deny
}
for (const name of ["exec", "execFile", "spawn", "fork", "execSync", "execFileSync", "spawnSync"])
  require("node:child_process")[name] = deny
require("node:net").Socket.prototype.connect = deny
require("node:tls").connect = deny
syncBuiltinESMExports()
const baseRequire = createRequire(require.resolve("@wirecat/cli-base"))
const keyring = baseRequire.resolve("@napi-rs/keyring")
require.cache[keyring] = {
  id: keyring,
  filename: keyring,
  loaded: true,
  exports: {
    Entry: class {
      constructor() {
        deny()
      }
    },
  },
}
