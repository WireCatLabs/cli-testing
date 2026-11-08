import { existsSync, readdirSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { check } from "../check.mjs"
import { random, serve, store, tg } from "./mix.mjs"

// `store restore` (or `--variant reset`) while other processes have the store open. First with a long-lived serve:
// the command must refuse. Then with only short sync runs that open and close every few hundred ms: the command's
// check for holders and its rename are two steps, and a sync that opens between them writes into the file set aside.
const VARIANT = process.env.T15_VARIANT ?? "restore"
const shortTg = { ...tg, args: { ...tg.args, batches: 1, gap: 150 } }

export const scenario = {
  why: `store ${VARIANT} while another process has the store open`,
  seconds: 60,
  ...store,
  writers: [{ ...serve, args: { ...serve.args, seconds: 15 } }, shortTg, { ...shortTg, after: 120 }],
}

const swaps = []

export const drive = async ({ runDir, command, note, sleep }) => {
  await sleep(3000)
  const backup = join(runDir, "backup.db")
  note({ backup: (await command(["store", "backup", backup])).code })
  await sleep(2000)
  const argv = VARIANT === "reset" ? ["--yes", "store", "reset", "--no-backup"] : ["store", "restore", backup]
  const held = await command(argv)
  note({ while_serve_holds: held.code, says: held.output.slice(0, 300) })
  await sleep(12_000)
  for (let i = 0; i < 40 && swaps.length === 0; i++) {
    const at = Date.now()
    const out = await command(argv)
    if (out.code === 0) swaps.push({ at, done: Date.now() })
    else note({ attempt: i, code: out.code, says: out.output.slice(0, 160) })
    await sleep(random(50, 250))
  }
  note({ swapped: swaps.length > 0, attempts_until: swaps[0] ? "swap" : "none" })
}

// After the swap, nothing committed may be missing from the live store, except what the restore or reset takes back
// on purpose: rows committed before the swap. A commit after the swap that is missing went into the file set aside.
export const after = async ({ store: path, ledgers }) => {
  if (swaps.length === 0) return { swapped: false }
  const { done } = swaps[0]
  const all = await check(path, ledgers)
  const late = await check(path, ledgers, { before: Infinity, after: done })
  const aside = readdirSync(dirname(path)).filter((file) => /before-restore|backup-/.test(file))
  return {
    swapped: true,
    verdict_after_swap: late.ledger?.missing === 0 ? "ok" : "lost",
    committed_after_swap_missing: late.ledger?.missing,
    missing_after_swap_by_table: late.ledger?.tables,
    quick_check: all.quick_check?.ok,
    fts: all.fts?.ok,
    set_aside: aside.map((file) => ({ file, bytes: statSync(join(dirname(path), file)).size })),
    wal_beside: existsSync(`${path}-wal`),
  }
}
