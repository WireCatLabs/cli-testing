export const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

export const pageText = (document) => {
  const out = []
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) out.push(child.data)
      else if (child.nodeType === 1 && !/^(script|style|noscript|template)$/i.test(child.nodeName)) {
        out.push(" ")
        walk(child)
        out.push(" ")
      }
    }
  }
  walk(document.documentElement)
  return out.join("")
}
