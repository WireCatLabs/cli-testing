// usage: node split.mjs <tool root> <args...>
// Splits one in-process command into: Node start, importing the program, building it, and running it.
import { enableCompileCache } from "node:module"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const log = (...parts) => process.stdout.write(`${parts.join(" ")}\n`)

enableCompileCache()
const [root, ...args] = process.argv.slice(2)
const t = performance.nodeTiming
const ready = performance.now()
const program = await import(pathToFileURL(join(root, "dist/program.js")).href)
const imported = performance.now()
const { createProgram } = await import("@wirecat/cli-core/cli").catch(
  () => import(pathToFileURL(join(root, "node_modules/@wirecat/cli-core/dist/cli/index.js")).href),
)
const coreImported = performance.now()
createProgram(program.definition, { out: () => {}, err: () => {} })
const built = performance.now()
createProgram(program.definition, { out: () => {}, err: () => {} })
const builtAgain = performance.now()
const write = process.stdout.write.bind(process.stdout)
process.stdout.write = () => true
const code = await program.run(args)
const ran = performance.now()
const code2 = await program.run(args)
const ranAgain = performance.now()
process.stdout.write = write
const ms = (n) => Math.round(n * 10) / 10
log(
  JSON.stringify({
    args,
    code: [code, code2],
    node_bootstrap: ms(t.bootstrapComplete),
    script_ready: ms(ready),
    import_program: ms(imported - ready),
    import_rest_of_cli_core: ms(coreImported - imported),
    create_program_first: ms(built - coreImported),
    create_program_again: ms(builtAgain - built),
    run_first: ms(ran - builtAgain),
    run_again: ms(ranAgain - ran),
  }),
)
process.exit(0)
