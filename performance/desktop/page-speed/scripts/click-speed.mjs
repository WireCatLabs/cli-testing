// Click to next frame on the browser build of Desktop (mock platform), in headless Chrome.
//   pnpm exec vite build && pnpm exec vite preview --port 1487 --strictPort
//   DESKTOP=<checkout> node click-speed.mjs [--port 1487] [--runs 3] [--cpu 1]
// For each click: "frame" is the Event Timing duration (input to the next paint, what INP scores), "busy" the
// main-thread long tasks (>50 ms) in the 2 s after it, which includes rendering the data a mock answer brings.
import { existsSync } from "node:fs"
import { createRequire } from "node:module"

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const require = createRequire(`${process.env.DESKTOP}/package.json`)
const { chromium } = require("playwright-core")
const port = Number(flag("port", 1487))
const runs = Number(flag("runs", 3))
const cpu = Number(flag("cpu", 1))

const nav = (id) => `nav button[data-tour="nav-${id}"]`
const button = (name) => `main >> role=button[name=/^${name}/] >> nth=0`
const SCENARIOS = [
  { name: "nav Tools→Memory (many)", query: "?onboarding=off&memory=many&section=tools", clicks: [nav("memory")] },
  { name: "nav Tools→Clients (many)", query: "?onboarding=off&clients=many&section=tools", clicks: [nav("clients")] },
  { name: "nav Tools→Tasks (many)", query: "?onboarding=off&tasks=many&section=tools", clicks: [nav("tasks")] },
  { name: "nav Tools→People (many)", query: "?onboarding=off&people=many&section=tools", clicks: [nav("people")] },
  {
    name: "nav Tools→Analytics (showcase)",
    query: "?onboarding=off&showcase&section=tools",
    clicks: [nav("analytics")],
  },
  { name: "nav Tools→Logs (showcase)", query: "?onboarding=off&showcase&section=tools", clicks: [nav("logs")] },
  { name: "nav Tools→Agents (showcase)", query: "?onboarding=off&showcase&section=tools", clicks: [nav("agents")] },
  { name: "nav Tools→Search (showcase)", query: "?onboarding=off&showcase&section=tools", clicks: [nav("search")] },
  { name: "nav Tools→Digests (showcase)", query: "?onboarding=off&showcase&section=tools", clicks: [nav("digests")] },
  { name: "nav Tools→Storage (showcase)", query: "?onboarding=off&showcase&section=tools", clicks: [nav("storage")] },
  { name: "nav Tools→Settings (showcase)", query: "?onboarding=off&showcase&section=tools", clicks: [nav("settings")] },
  {
    name: "Memory: open a row",
    query: "?onboarding=off&memory=many&section=memory",
    clicks: ["main [aria-expanded] >> nth=3"],
  },
  { name: "Memory: approve one", query: "?onboarding=off&memory=many&section=memory", clicks: [button("Approve")] },
  { name: "Memory: Kind filter", query: "?onboarding=off&memory=many&section=memory", clicks: [button("Kind")] },
  {
    name: "Clients: sort by amount",
    query: "?onboarding=off&clients=many&section=clients",
    clicks: ["key:Escape", button("Sort by amount")],
  },
  {
    name: "Clients: open a deal",
    query: "?onboarding=off&clients=many&section=clients",
    clicks: ["key:Escape", button("Support contract")],
  },
  {
    name: "Clients: board view",
    query: "?onboarding=off&clients=many&section=clients",
    clicks: ["key:Escape", "main [aria-pressed]:visible >> nth=1"],
  },
  {
    name: "Tasks: sort by priority",
    query: "?onboarding=off&tasks=many&section=tasks",
    clicks: [button("Sort by priority")],
  },
  { name: "Tasks: open a task", query: "?onboarding=off&tasks=many&section=tasks", clicks: [button("WEB-127 ")] },
  {
    name: "Tasks: board view",
    query: "?onboarding=off&tasks=many&section=tasks",
    clicks: ["main [aria-pressed]:visible >> nth=1"],
  },
  {
    name: "People: sort by last contact",
    query: "?onboarding=off&people=many&section=people",
    clicks: [button("Sort by last contact")],
  },
  {
    name: "People: open a person",
    query: "?onboarding=off&people=many&section=people",
    clicks: [button("Lena Ortiz")],
  },
  {
    name: "People: another kind",
    query: "?onboarding=off&people=many&section=people",
    clicks: ["main [aria-pressed]:visible >> nth=1"],
  },
]

const executablePath = ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].find(existsSync)
const browser = await chromium.launch({ executablePath, headless: true })
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const only = args.filter((a) => !a.startsWith("--") && Number.isNaN(Number(a)))

const once = async (s) => {
  const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } })
  if (cpu > 1) {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
  }
  await page.goto(`http://localhost:${port}/${s.query}`)
  await page.waitForTimeout(3000)
  const before = s.clicks.slice(0, -1)
  for (const c of before) {
    if (c.startsWith("key:")) await page.keyboard.press(c.slice(4))
    else await page.click(c, { timeout: 5000 })
    await page.waitForTimeout(2000)
  }
  await page.evaluate(() => {
    window.__events = []
    window.__long = []
    new PerformanceObserver((l) => window.__events.push(...l.getEntries().map((e) => [e.name, e.duration]))).observe({
      type: "event",
      durationThreshold: 16,
    })
    new PerformanceObserver((l) => window.__long.push(...l.getEntries().map((e) => e.duration))).observe({
      type: "longtask",
    })
  })
  const last = s.clicks.at(-1)
  await page.locator(last).waitFor({ timeout: 5000 })
  const t = Date.now()
  await page.click(last, { timeout: 5000 })
  const clickMs = Date.now() - t
  await page.waitForTimeout(2000)
  const r = await page.evaluate(() => ({
    frame: Math.max(
      0,
      ...window.__events.filter(([n]) => ["pointerdown", "pointerup", "click"].includes(n)).map(([, d]) => d),
    ),
    busy: window.__long.reduce((a, b) => a + b, 0),
    maxLong: Math.max(0, ...window.__long),
    nodes: document.querySelectorAll("*").length,
  }))
  await page.close()
  return { ...r, clickMs }
}

const results = []
for (const s of SCENARIOS.filter((x) => only.length === 0 || only.some((o) => x.name.includes(o)))) {
  const xs = []
  for (let i = 0; i < runs; i++) {
    try {
      xs.push(await once(s))
    } catch (e) {
      xs.push({ error: String(e.message).split("\n")[0] })
    }
  }
  const ok = xs.filter((x) => !x.error)
  const row = ok.length
    ? {
        scenario: s.name,
        frame_ms: Math.round(median(ok.map((x) => x.frame))),
        busy_ms: Math.round(median(ok.map((x) => x.busy))),
        longest_ms: Math.round(median(ok.map((x) => x.maxLong))),
        nodes: median(ok.map((x) => x.nodes)),
      }
    : { scenario: s.name, error: xs[0].error }
  results.push(row)
  process.stderr.write(`${JSON.stringify(row)}\n`)
}
process.stdout.write(`${JSON.stringify({ cpu, runs, results }, null, 1)}\n`)
await browser.close()
