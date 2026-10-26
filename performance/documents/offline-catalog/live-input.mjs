import assert from "node:assert/strict"
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const marker = "drive-acceptance-workspace.json"
const releases = {
  "0.11.1": {
    export_flag: "--output",
    memory_search: "items",
    list_queries: true,
    core: "0.288.0",
    framework: "0.33.0",
  },
  "0.7.0": { export_flag: "--out", memory_search: "item", core: "0.278.0", framework: "0.28.2" },
  "0.8.1": { export_flag: "--output", memory_search: "items", core: "0.283.0", framework: "0.31.1" },
  "0.8.0": { export_flag: "--output", memory_search: "items", core: "0.281.0", framework: "0.31.0" },
}
export const releaseOf = (version) => {
  assert.equal(typeof version, "string")
  assert.ok(Object.hasOwn(releases, version), "unreviewed Drive release")
  return releases[version]
}
const object = (value, keys) => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "invalid manifest object")
  assert.ok(
    Object.keys(value).every((key) => keys.includes(key)),
    "unknown manifest field",
  )
}
const id = (value) => {
  assert.match(value, /^[A-Za-z0-9_-]{1,200}$/, "invalid fixture id")
  assert.ok(!value.includes("REPLACE"), "replace fixture placeholders first")
}
const strings = (value) => {
  assert.ok(Array.isArray(value) && value.every((text) => typeof text === "string" && text.length > 0))
}
export const validateManifest = (value) => {
  object(value, ["schema_version", "drive_version", "folder_id", "folders", "documents", "absent_ids"])
  assert.equal(value.schema_version, 1)
  releaseOf(value.drive_version)
  id(value.folder_id)
  assert.ok(Array.isArray(value.folders) && value.folders.length > 0)
  assert.ok(Array.isArray(value.documents) && value.documents.length > 0)
  const ids = new Set()
  for (const entry of [...value.folders, ...value.documents]) {
    object(
      entry,
      value.folders.includes(entry)
        ? ["id", "parents", "name"]
        : ["id", "parents", "name", "markers", "absent_markers", "markdown_markers", "min_tabs"],
    )
    id(entry.id)
    assert.ok(!ids.has(entry.id), "duplicate fixture id")
    ids.add(entry.id)
    strings(entry.parents ?? [])
    for (const parent of entry.parents ?? []) id(parent)
    if (entry.name !== undefined) assert.equal(typeof entry.name, "string")
  }
  const folders = new Set(value.folders.map((entry) => entry.id))
  assert.ok(folders.has(value.folder_id), "include the selected root in folders")
  for (const entry of value.documents) {
    strings(entry.markers)
    assert.ok(entry.markers.length > 0, "each document needs a searchable marker")
    for (const key of ["absent_markers", "markdown_markers"]) strings(entry[key] ?? [])
    assert.ok(entry.parents?.length > 0 && entry.parents.every((parent) => folders.has(parent)))
    assert.ok(Number.isSafeInteger(entry.min_tabs ?? 0) && (entry.min_tabs ?? 0) >= 0)
  }
  strings(value.absent_ids ?? [])
  for (const absent of value.absent_ids ?? []) {
    id(absent)
    assert.ok(!ids.has(absent), "absent fixture is also expected present")
  }
  return value
}

export const initialize = (workspace, profile) => {
  assert.match(profile, /^[a-z][a-z0-9_-]{0,47}$/, "choose an explicit test profile")
  const root = resolve(workspace)
  mkdirSync(root, { mode: 0o700 })
  writeFileSync(join(root, marker), JSON.stringify({ schema_version: 1, profile }), { flag: "wx", mode: 0o600 })
  return root
}

export const workspaceEnvironment = (workspace, profile) => {
  const root = realpathSync(workspace)
  const saved = JSON.parse(readFileSync(join(root, marker), "utf8"))
  assert.equal(saved.schema_version, 1)
  assert.equal(saved.profile, profile, "profile differs from the initialized test workspace")
  return {
    HOME: root,
    PATH: process.env.PATH,
    NPM_CONFIG_USERCONFIG: "/dev/null",
    XDG_CONFIG_HOME: join(root, "xdg-config"),
    XDG_DATA_HOME: join(root, "xdg-data"),
    XDG_STATE_HOME: join(root, "xdg-state"),
    XDG_CACHE_HOME: join(root, "xdg-cache"),
    DRIVE_CONFIG_DIR: join(root, "config"),
    DRIVE_STATE_DIR: join(root, "state"),
    DRIVE_CACHE_DIR: join(root, "cache"),
    DRIVE_STORE: join(root, "drive.db"),
    MESSAGING_STORE: join(root, "drive.db"),
    WIRECAT_STATE_DIR: join(root, "wirecat"),
    TMPDIR: root,
    NO_COLOR: "1",
  }
}
