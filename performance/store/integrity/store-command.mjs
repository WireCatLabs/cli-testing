// node store-command.mjs --core <version> store <backup|restore|reset> ...: the real `store` maintenance commands of
// one cli-core, in a program of their own, on the store MESSAGING_STORE names. Prints the command's JSON.
import { createRequire } from "node:module"
import { join } from "node:path"
import { HARNESS, installCore, loadCore } from "./lib.mjs"

const argv = process.argv.slice(2)
const at = argv.indexOf("--core")
const core = argv[at + 1]
argv.splice(at, 2)
installCore(core)
const { storeMaintenanceCommands } = await loadCore(core, "cli/messenger/store-maintenance-command.js")
const require = createRequire(join(HARNESS, "cores", core, "package.json"))
const { Command } = require("commander")
const messenger = {
  app: { command: "harness", name: "harness", appName: "harness-cli", envPrefix: "HARNESS" },
  provider: "harness",
}
const program = new Command("harness").option("--yes").option("--json").exitOverride()
const store = program.command("store")
for (const command of storeMaintenanceCommands(messenger)) store.addCommand(command.exitOverride())
await program.parseAsync(["node", "harness", ...argv])
