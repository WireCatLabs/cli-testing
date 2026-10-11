import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { assertJson, checkContractFiles, jsonAt, seedContractFiles, substitute } from "./contract-state.js"

describe("stateful contracts", () => {
  it("captures JSON pointers and refuses missing fields", () => {
    const value = { items: [{ id: "synthetic-id" }], "a/b": { "~key": 7 } }
    expect(jsonAt(value, "/items/0/id")).toBe("synthetic-id")
    expect(jsonAt(value, "/a~1b/~0key")).toBe(7)
    expect(jsonAt(value, "")).toBe(value)
    for (const path of ["/items/1/id", "/items/0/id/no", "/toString"])
      expect(() => jsonAt(value, path)).toThrow("missing")
    expect(() => jsonAt(value, "items")).toThrow("JSON pointers")
  })
  it("checks object subsets, array lengths, scalars and captured substitutions", () => {
    const values = new Map([["id", "synthetic-id"]])
    expect(substitute("value={{id}}", values)).toBe("value=synthetic-id")
    expect(() => substitute("{{absent}}", values)).toThrow("undefined value")
    assertJson(
      { items: [{ id: "synthetic-id", extra: true }], count: 1 },
      { items: [{ id: "{{id}}" }], count: 1 },
      values,
    )
    assertJson(null, null, values)
    for (const [actual, expected] of [
      [{}, []],
      [[], [1]],
      [[], {}],
      [null, {}],
      [{}, { missing: 1 }],
      [false, true],
    ])
      expect(() => assertJson(actual, expected, values)).toThrow()
  })
  it("verifies migration preview byte preservation and retained config fields", () => {
    const root = mkdtempSync(join(tmpdir(), "stateful-contract-"))
    const values = new Map([["root", root]])
    const text = '{"legacy":true,"limit":7}'
    const seeded = seedContractFiles(root, [{ path: "config/settings.json", text }], values)
    expect(readFileSync(join(root, "config/settings.json"), "utf8")).toBe(text)
    checkContractFiles(
      root,
      [{ path: "config/settings.json", unchanged: true, json: { limit: 7 }, text }],
      seeded,
      values,
    )
    writeFileSync(join(root, "config/settings.json"), '{"permissions":{"messages":"readonly"},"limit":7}')
    checkContractFiles(
      root,
      [{ path: "config/settings.json", json: { permissions: { messages: "readonly" }, limit: 7 } }],
      seeded,
      values,
    )
    for (const check of [{ unchanged: true }, { text }, { json: { limit: 8 } }])
      expect(() => checkContractFiles(root, [{ path: "config/settings.json", ...check }], seeded, values)).toThrow()
    expect(() =>
      checkContractFiles(root, [{ path: "config/settings.json", unchanged: true }], new Map(), values),
    ).toThrow("changed")
    writeFileSync(join(root, "config/settings.json"), "bad JSON")
    expect(() => checkContractFiles(root, [{ path: "config/settings.json", json: {} }], seeded, values)).toThrow(
      "contain JSON",
    )
    expect(() => seedContractFiles(root, [{ path: "../escape", text: "" }], values)).toThrow("inside its root")
    expect(() => seedContractFiles(root, [{ path: "config/settings.json", text }], values)).toThrow()
  })
})

it("checks binary store checksums so rejected upgrades cannot silently rewrite databases", () => {
  const root = mkdtempSync(join(tmpdir(), "store-preservation-"))
  writeFileSync(join(root, "store.db"), Buffer.from([0, 1, 2]))
  const digest = createHash("sha256")
    .update(Buffer.from([0, 1, 2]))
    .digest("hex")
  checkContractFiles(root, [{ path: "store.db", sha256: "{{original}}" }], new Map(), new Map([["original", digest]]))
  writeFileSync(join(root, "store.db"), Buffer.from([0, 1, 3]))
  expect(() => checkContractFiles(root, [{ path: "store.db", sha256: digest }], new Map(), new Map())).toThrow(
    "checksum changed",
  )
})
