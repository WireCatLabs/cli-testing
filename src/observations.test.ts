import { describe, expect, it } from "vitest"
import { scannerObservations } from "./observations.js"

describe("scanner observations", () => {
  it.each([
    [
      "osv",
      {
        results: [
          {
            packages: [
              {
                package: { name: "synthetic-package" },
                vulnerabilities: [{ id: "SYNTHETIC-001" }, { id: "SYNTHETIC-001" }],
              },
            ],
          },
        ],
      },
    ],
    ["semgrep", { results: [{ check_id: "synthetic-rule", path: "src/fixture.ts", start: { line: 1 } }] }],
    [
      "zizmor",
      [
        {
          ident: "synthetic-rule",
          ignored: false,
          locations: [{ symbolic: { key: "fixture.yml", route: ["jobs", "fixture"] } }],
        },
        { ignored: true },
      ],
    ],
    ["codeql", [[{ number: 1, rule: { id: "synthetic-rule" } }]]],
    [
      "socket",
      {
        ok: true,
        data: {
          alerts: {
            npm: {
              "synthetic-package": { "1.0.0": { type: "synthetic-rule" }, "2.0.0": [{ type: "synthetic-rule" }] },
            },
          },
        },
      },
    ],
  ])("normalizes %s candidates using identifiers, without source text or descriptions", (tool, value) => {
    const observations = scannerObservations("fixture", tool as string, value)
    expect(observations).toHaveLength(tool === "socket" ? 2 : 1)
    expect(JSON.parse(observations[0]?.id ?? "").slice(0, 2)).toEqual(["fixture", tool])
    expect(JSON.stringify(observations)).not.toContain("description")
  })

  it.each([
    ["osv", { results: [] }],
    ["semgrep", { results: [] }],
    ["zizmor", []],
    ["codeql", []],
    ["socket", { ok: true, data: { alerts: { npm: {} } } }],
    ["socket", { ok: true, data: { healthy: true, alerts: {} } }],
  ])("accepts an explicit empty %s result", (tool, value) =>
    expect(scannerObservations("fixture", tool as string, value)).toEqual([]),
  )

  it.each([
    ["unknown", {}],
    ["osv", null],
    ["osv", []],
    ["osv", "invalid"],
    ["osv", { results: null }],
    ["osv", { results: [{ packages: [{ package: { name: "" }, vulnerabilities: [{ id: "fixture" }] }] }] }],
    ["semgrep", { results: [{ check_id: 1, path: "fixture.ts", start: { line: 1 } }] }],
    ["codeql", [{ number: "1", rule: { id: "fixture" } }]],
    ["socket", { ok: false }],
    ["socket", { ok: true, data: { healthy: false, alerts: {} } }],
    ["socket", { ok: true, data: { healthy: true, alerts: { unknown: {} } } }],
  ])("refuses malformed %s evidence instead of returning a clean result", (tool, value) =>
    expect(() => scannerObservations("fixture", tool as string, value)).toThrow(),
  )
})
