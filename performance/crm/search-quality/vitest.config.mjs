// Runs search.bench.ts inside a bitrix24-cli checkout (B24_REPO). With CLI_CORE set to a built cli-core checkout,
// b24 runs on that build instead of the cli-core it installed.
import { join } from "node:path"

const HERE = import.meta.dirname
const B24 = process.env.B24_REPO
const CORE = process.env.CLI_CORE
if (!B24) throw new Error("set B24_REPO to a bitrix24-cli checkout")

const entries = {
  "": "index.js",
  "/cli": "cli/index.js",
  "/crm": "crm/index.js",
  "/crm/cli": "crm/cli/index.js",
  "/crm/testing": "crm/testing/index.js",
  "/mcp": "mcp/index.js",
  "/sends": "sends/index.js",
  "/store": "store/index.js",
  "/testing": "kit/index.js",
  "/update": "update/index.js",
}

// cli-core's build and b24 must share one copy of cli-base, or its module-level registries split in two.
const oneBase = {
  name: "one-cli-base",
  enforce: "pre",
  async resolveId(source, importer) {
    if (!source.startsWith("@wirecat/cli-base") || importer?.startsWith(join(CORE, "node_modules"))) return null
    return this.resolve(source, join(CORE, "src/index.ts"), { skipSelf: true })
  },
}

export default {
  plugins: CORE ? [oneBase] : [],
  root: B24,
  tsconfig: join(B24, "node_modules/@wirecat/cli-base/config/tsconfig.base.json"),
  resolve: {
    alias: CORE
      ? Object.entries(entries).map(([path, file]) => ({
          find: new RegExp(`^@wirecat/cli-core${path.replace("/", "\\/")}$`),
          replacement: join(CORE, "dist", file),
        }))
      : [],
  },
  server: { fs: { allow: [B24, HERE, ...(CORE ? [CORE] : [])] } },
  test: {
    dir: HERE,
    include: [join(HERE, "search.bench.ts")],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000,
    ...(CORE ? { server: { deps: { inline: [new RegExp(CORE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))] } } } : {}),
  },
}
