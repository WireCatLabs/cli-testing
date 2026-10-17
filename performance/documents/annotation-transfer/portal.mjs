import { checkPortal } from "../portal-check.mjs"

const [base, output, source] = process.argv.slice(2)
await checkPortal({
  base,
  output,
  source,
  release: "0.17.0",
  sourceRef: "v0.17.0",
  markers: {
    recipes: [
      "store.selected",
      "store.checkpoint",
      "drive personal store check SOURCE_DB --offline --json",
      "drive personal store import SOURCE_DB --fingerprint FINGERPRINT --offline --json",
      "already_transferred",
      "missing_bindings",
      "16 MiB",
    ],
    usage: ["#keep-notes-when-changing-databases", "MESSAGING_STORE"],
    troubleshooting: ["#keep-notes-when-changing-databases", "store.checkpoint", "store import"],
    commands: ["drive store check", "drive store import", "--fingerprint"],
    changelog: ["0.17.0", "store check SOURCE_DB", "store import SOURCE_DB --fingerprint HASH"],
  },
})
