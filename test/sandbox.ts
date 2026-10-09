import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll } from "vitest"

const root = mkdtempSync(join(tmpdir(), "cli-testing-fixture-"))
process.env.TMPDIR = root
afterAll(() => rmSync(root, { recursive: true, force: true }))
