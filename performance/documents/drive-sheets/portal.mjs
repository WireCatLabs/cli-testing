import { checkPortal } from "../portal-check.mjs"

const [base, output, source] = process.argv.slice(2)
const markers = {
  index: ["#read-and-change-spreadsheet-cells", "#organize-tabs-and-format-selected-cells"],
  installation: ["sheets.googleapis.com", "npm install -g @wirecat/drive-cli", "--client-file"],
  recipes: ["drive personal sheets update SHEET_ID", "drive personal sheets format SHEET_ID", "outcome_unknown"],
  troubleshooting: ["google-api.disabled", "workspace/guides/enable-apis"],
  commands: ["drive sheets format", "drive api show", "readonly"],
  changelog: ["0.16.0", "google-api.disabled", "0.307.0", "0.40.3"],
}
await checkPortal({ base, output, source, release: "0.16.0", markers })
