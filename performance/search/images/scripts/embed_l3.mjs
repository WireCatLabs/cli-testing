import fs from "node:fs"
import {
  AutoModel,
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  env,
  RawImage,
  SiglipTextModel,
  SiglipVisionModel,
} from "@huggingface/transformers"

env.cacheDir = "../models/hf"
env.localModelPath = "../models/"
env.allowLocalModels = true
const list = JSON.parse(fs.readFileSync("../tg_list.json"))
const targets = JSON.parse(fs.readFileSync("../targets.json"))
const timing = {}
const time = async (f) => {
  const s = performance.now()
  const r = await f()
  return [r, performance.now() - s]
}
const norm = (a) => {
  let n = 0
  for (const x of a) n += x * x
  n = Math.sqrt(n)
  return Array.from(a, (x) => x / n)
}
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return {
    median: s[Math.floor(s.length / 2)],
    p95: s[Math.floor(s.length * 0.95)],
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
  }
}
const out = {}

// Dense 768 -> 512, no bias (2_Dense/config.json)
const buf = fs.readFileSync("../models/mclip/2_Dense/model.safetensors")
const hl = Number(buf.readBigUInt64LE(0))
const hdr = JSON.parse(buf.subarray(8, 8 + hl).toString())
const key = Object.keys(hdr).find((k) => k !== "__metadata__")
const [o, i] = hdr[key].shape
const [s0, s1] = hdr[key].data_offsets
const W = new Float32Array(buf.buffer.slice(buf.byteOffset + 8 + hl + s0, buf.byteOffset + 8 + hl + s1))
const dense = (v) => {
  const r = new Float32Array(o)
  for (let a = 0; a < o; a++) {
    let s = 0
    for (let b = 0; b < i; b++) s += W[a * i + b] * v[b]
    r[a] = s
  }
  return r
}
const meanPool = (hs, mask) => {
  const [, L, D] = hs.dims
  const r = new Float32Array(D)
  let c = 0
  for (let l = 0; l < L; l++) {
    if (!Number(mask.data[l])) continue
    c++
    for (let d = 0; d < D; d++) r[d] += hs.data[l * D + d]
  }
  return r.map((x) => x / c)
}

// ---- A: CLIP vision + multilingual text
let [procA, ms] = await time(() => AutoProcessor.from_pretrained("Xenova/clip-vit-base-patch32"))
let vA
;[vA, ms] = await time(() =>
  CLIPVisionModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch32", { dtype: "q8" }),
)
timing.A_vision_load_ms = ms
const tokM = await AutoTokenizer.from_pretrained("mclip", { local_files_only: true })
let tM
;[tM, ms] = await time(() => AutoModel.from_pretrained("mclip", { dtype: "q8", local_files_only: true }))
timing.A_mtext_load_ms = ms
const tokE = await AutoTokenizer.from_pretrained("Xenova/clip-vit-base-patch32")
let tE
;[tE, ms] = await time(() =>
  CLIPTextModelWithProjection.from_pretrained("Xenova/clip-vit-base-patch32", { dtype: "q8" }),
)
timing.A_entext_load_ms = ms
// ---- B: SigLIP2
const procB = await AutoProcessor.from_pretrained("onnx-community/siglip2-base-patch16-224-ONNX")
let vB
;[vB, ms] = await time(() =>
  SiglipVisionModel.from_pretrained("onnx-community/siglip2-base-patch16-224-ONNX", { dtype: "int8" }),
)
timing.B_vision_load_ms = ms
const tokB = await AutoTokenizer.from_pretrained("onnx-community/siglip2-base-patch16-224-ONNX")
let tB
;[tB, ms] = await time(() =>
  SiglipTextModel.from_pretrained("onnx-community/siglip2-base-patch16-224-ONNX", { dtype: "int8" }),
)
timing.B_text_load_ms = ms

const imgMs = { A: [], B: [] }
out.imgA = []
out.imgB = []
for (const e of list) {
  const t0 = performance.now()
  const img = (await RawImage.read(e.file)).rgb()
  const t1 = performance.now()
  const oa = await vA(await procA(img))
  const t2 = performance.now()
  out.imgA.push(norm(oa.image_embeds.data))
  const ob = await vB(await procB(img))
  const t3 = performance.now()
  out.imgB.push(norm(ob.pooler_output.data))
  imgMs.A.push(t2 - t1 + (t1 - t0) * 0)
  imgMs.B.push(t3 - t2)
}
timing.A_image_ms = stats(imgMs.A)
timing.B_image_ms = stats(imgMs.B)
const qMs = { A_ru: [], A_en: [], B_ru: [], B_en: [] }
out.qA = []
out.qAen = []
out.qB = []
out.qBen = []
for (const [, ru, en] of targets) {
  let s = performance.now()
  const inp = tokM([ru], { padding: true, truncation: true })
  const r = await tM(inp)
  out.qA.push(norm(dense(meanPool(r.last_hidden_state, inp.attention_mask))))
  qMs.A_ru.push(performance.now() - s)
  s = performance.now()
  const re = await tE(tokE([en], { padding: true, truncation: true }))
  out.qAen.push(norm(re.text_embeds.data))
  qMs.A_en.push(performance.now() - s)
  s = performance.now()
  const rb = await tB(tokB([ru.toLowerCase()], { padding: "max_length", max_length: 64, truncation: true }))
  out.qB.push(norm(rb.pooler_output.data))
  qMs.B_ru.push(performance.now() - s)
  s = performance.now()
  const rbe = await tB(tokB([en.toLowerCase()], { padding: "max_length", max_length: 64, truncation: true }))
  out.qBen.push(norm(rbe.pooler_output.data))
  qMs.B_en.push(performance.now() - s)
}
timing.query_ms = Object.fromEntries(Object.entries(qMs).map(([k, v]) => [k, stats(v)]))
fs.writeFileSync("../l3_vecs.json", JSON.stringify(out))
fs.writeFileSync("../l3_timing.json", JSON.stringify(timing, null, 1))
process.stdout.write(`${JSON.stringify(timing)}\n`)
