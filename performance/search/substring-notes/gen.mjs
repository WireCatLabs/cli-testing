// Deterministic mixed Cyrillic/Latin text: Zipf-like vocabulary, sentence case, some ALL CAPS, planted needles.
export const rng = (seed) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const ruSyl =
  "про,ва,ни,ко,ст,ра,ле,де,ме,то,ли,но,сть,ени,ия,ого,ть,за,по,ре,ка,на,ски,ова,ель,ния,ём,ёт,ий,ой,ый,ая,ую,ше,щи,жа,чи,ют,ят,ов,ев,бы,вы,мы,ги,хо,цу,фа,эк,ин,ан,ук,зд,тв".split(
    ",",
  )
const enSyl =
  "con,tra,ment,ing,ed,er,pro,ject,tion,al,re,de,in,ter,com,pa,ny,sys,tem,da,ta,ser,ver,cli,ent,mee,ting,plan,dev,ops,cl,ou,st".split(
    ",",
  )
const common =
  "и,в,не,на,что,с,по,это,как,а,но,для,мы,вы,я,он,она,они,так,уже,или,the,a,of,to,and,is,for,on,with,we".split(",")
const r0 = rng(42)
const make = (syl, n) => {
  const s = new Set()
  while (s.size < n) {
    let w = ""
    const k = 1 + Math.floor(r0() * 4)
    for (let i = 0; i < k; i++) w += syl[Math.floor(r0() * syl.length)]
    s.add(w)
  }
  return [...s]
}
const ru = make(ruSyl, 30000)
const en = make(enSyl, 8000)
const pick = (r, arr) => arr[Math.floor(arr.length * r() ** 2.5)]
const word = (r) => {
  const x = r()
  if (x < 0.25) return common[Math.floor(common.length * r())]
  return x < 0.78 ? pick(r, ru) : pick(r, en)
}
export const NEEDLES = [
  // [every, offset, variants]: planted into rows where id % every == offset
  [400, 7, ["Тартусский", "ТАРТУССКИЙ", "тартусском"]],
  [997, 3, ["Kubernetes", "KUBERNETES", "kubernetes-кластер"]],
  [150, 11, ["договор аренды", "Договор Аренды", "ДОГОВОР АРЕНДЫ"]],
  [500, 13, ["Ёлкин"]],
  [500, 14, ["Елкин"]],
  [600, 21, ["Ян"]],
]
export const text = (id, bytes, seed) => {
  const r = rng(id * 7919 + seed)
  const parts = []
  let size = 0
  while (size < bytes) {
    const n = 6 + Math.floor(r() * 10)
    const ws = []
    for (let i = 0; i < n; i++) {
      let w = word(r)
      if (r() < 0.02) w = w.toUpperCase()
      ws.push(w)
    }
    ws[0] = ws[0][0].toUpperCase() + ws[0].slice(1)
    const s = ws.join(" ") + (r() < 0.15 ? ".\n\n" : ". ")
    parts.push(s)
    size += Buffer.byteLength(s)
  }
  for (const [every, offset, variants] of NEEDLES) {
    if (id % every === offset) {
      const at = Math.floor(r() * parts.length)
      parts.splice(at, 0, ` ${variants[id % variants.length]} `)
    }
  }
  return parts.join("")
}
