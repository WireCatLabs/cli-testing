// Loaded with `node --import` into a Node tool under test: counts the HTTP requests the process opens, from Node's own
// diagnostics channels, so a tool is measured without changing its code. Writes the count to REQUEST_COUNT_FILE.
import diagnostics from "node:diagnostics_channel"
import { writeFileSync } from "node:fs"

const file = process.env.REQUEST_COUNT_FILE
const hosts = []
diagnostics.subscribe("undici:request:create", ({ request }) => hosts.push(request.origin))
diagnostics.subscribe("http.client.request.start", ({ request }) => hosts.push(request.host))
if (file) process.on("exit", () => writeFileSync(file, JSON.stringify({ requests: hosts.length, hosts })))
