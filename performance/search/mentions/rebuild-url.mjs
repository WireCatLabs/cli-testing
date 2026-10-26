const [, , dist, path] = process.argv
const { openStore } = await import(`${dist}/store/store.js`)
const store = await openStore({ path })
const t = Date.now()
const result = await store.rebuildMentions({ kinds: ["url"] })
process.stdout.write(`${JSON.stringify({ ...result, seconds: (Date.now() - t) / 1000 })}\n`)
await store.close()
