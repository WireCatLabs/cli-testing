// The period cli-core's search all reads from each lab question (questionPeriod, with now = the question's date):
//   node --experimental-strip-types periods.ts <cli-core checkout> <out.json>
// Writes {"<as_of date>\t<question>": [from, to] in epoch seconds, or null}. lab.py reads it as cache/ts-periods.json.
import { readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const [core, out] = process.argv.slice(2)
if (!core || !out) throw new Error("usage: periods.ts <cli-core checkout> <out.json>")
const { questionPeriod } = await import(join(core, "src/search/question-period.ts"))
const B = join(homedir(), ".cache/wirecat-bench")
const read = (path: string) => JSON.parse(readFileSync(join(B, path), "utf8"))
const questions: { question: string; as_of: string }[] = [
  ...read("kg-fixture-v3/queries.json"),
  ...read("kg-fixture-v3-paraphrased/queries.json"),
  ...read("lifebench/fixtures/fenghaoran/oracle.json"),
]
const periods: Record<string, [number, number] | null> = {}
for (const { question, as_of } of questions) {
  const period = questionPeriod(question, Date.parse(as_of), "UTC")
  periods[`${as_of.slice(0, 10)}\t${question}`] = period ? [period.from / 1000, period.to / 1000] : null
}
writeFileSync(out, `${JSON.stringify(periods, null, 1)}\n`)
const named = Object.values(periods).filter(Boolean).length
process.stdout.write(`${named} of ${Object.keys(periods).length} questions name a period\n`)
