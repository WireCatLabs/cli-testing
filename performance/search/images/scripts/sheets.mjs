import fs from "node:fs"
import sharp from "sharp"

const l = JSON.parse(fs.readFileSync("../tg_list.json"))
const items = l.map((e, i) => ({ i, f: e.file })).filter((x) => x.f)
const per = 20,
  cols = 5,
  W = 320,
  H = 240
fs.mkdirSync("../sheets", { recursive: true })
for (let s = 0; s * per < items.length; s++) {
  const chunk = items.slice(s * per, (s + 1) * per)
  const comps = []
  for (let k = 0; k < chunk.length; k++) {
    const buf = await sharp(chunk[k].f)
      .rotate()
      .resize(W - 4, H - 24, { fit: "inside", background: "#fff" })
      .flatten({ background: "#fff" })
      .png()
      .toBuffer()
    const label = Buffer.from(
      `<svg width="${W}" height="22"><rect width="100%" height="100%" fill="#222"/><text x="6" y="16" font-size="16" fill="#fff">#${chunk[k].i}</text></svg>`,
    )
    const x = (k % cols) * W,
      y = Math.floor(k / cols) * H
    comps.push({ input: label, left: x, top: y }, { input: buf, left: x + 2, top: y + 22 })
  }
  await sharp({
    create: { width: cols * W, height: Math.ceil(chunk.length / cols) * H, channels: 3, background: "#888" },
  })
    .composite(comps)
    .jpeg({ quality: 80 })
    .toFile(`../sheets/sheet${s}.jpg`)
}
process.stdout.write(`${"ok"}\n`)
