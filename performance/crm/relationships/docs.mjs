import { readFileSync } from "node:fs"
import { join } from "node:path"

// The pages bitrix24-cli#39 and cli-memo#699 changed, less the generated command reference and the changelogs.
const PAGES = {
  memo: [
    "README.md",
    "docs/people.md",
    "docs/search.md",
    "docs/usage.md",
    "docs/mcp.md",
    "docs/notes.md",
    "skills/cli-memo/SKILL.md",
    "skills/cli-memo/topics/mcp.md",
    "skills/cli-memo/topics/money.md",
    "skills/cli-memo/topics/projects.md",
    "skills/cli-memo/topics/search.md",
  ],
  b24: [
    "README.md",
    "docs/usage.md",
    "docs/configuration.md",
    "docs/security.md",
    "docs/troubleshooting.md",
    "docs/roadmap.md",
    "skills/bitrix24-cli/SKILL.md",
  ],
}

const UNDER_TEST = {
  memo: /^memo (?:(?:work|personal) )?(?:context person:|organizations (?:context|list category:)|(?:deals|leads) (?:context|update)|relationships (?:list|add|end|update)|groups |search all .*--only crm)/,
  b24: /^b24 \w+ (?:sync|config set crm\.|schedule )/,
}
// Fill-ins a reader would make; anything else in angle brackets is left a placeholder and not run.
const FILL = [
  [/deal:<id>/g, "deal:7"],
  [/organization:<id>/g, "organization:4"],
  [/person:<id>/g, "person:12"],
  [/bitrix24:<portal>/g, "bitrix24:example.bitrix24.com"],
  [/<key>/g, "HRB"],
  [/<organization>/g, "organization:4"],
]

const commandsOf = (text) => {
  const found = []
  let fenced = false
  text.split("\n").forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced
      return
    }
    const candidates = fenced ? [line.trim()] : [...line.matchAll(/`((?:memo|b24) [^`]+)`/g)].map((one) => one[1])
    for (const candidate of candidates) found.push({ line: index + 1, text: candidate.replace(/\s+#.*$/, "").trim() })
  })
  return found
}

export const docExamples = (roots) =>
  Object.entries(PAGES).flatMap(([tool, pages]) =>
    pages.flatMap((page) => {
      let text
      try {
        text = readFileSync(join(roots[tool], page), "utf8")
      } catch {
        return []
      }
      return commandsOf(text)
        .filter(({ text: one }) => UNDER_TEST[tool].test(one))
        .map(({ line, text: one }) => {
          const command = FILL.reduce((done, [pattern, value]) => done.replace(pattern, value), one)
          const skip = /<[^>]+>|…|\.\.\./.test(command)
            ? "placeholder"
            : /schedule (?:command|agent|remove|run|exec)/.test(command)
              ? "installs or runs an OS timer"
              : undefined
          return { file: `${tool}/${page}`, line, command, ...(skip ? { skip } : {}) }
        })
    }),
  )
