export const isBun = typeof Bun !== "undefined"
export const runtime = isBun ? `bun ${Bun.version}` : `node ${process.versions.node}`

export const open = async (path) => {
  if (isBun) {
    const { Database } = await import("bun:sqlite")
    const db = new Database(path)
    return { exec: (s) => db.exec(s), prepare: (s) => db.prepare(s), close: () => db.close() }
  }
  const { DatabaseSync } = await import("node:sqlite")
  const db = new DatabaseSync(path)
  return { exec: (s) => db.exec(s), prepare: (s) => db.prepare(s), close: () => db.close() }
}

export const fold = (text) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFC")
    .toLowerCase()
