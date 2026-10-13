import { Readability } from "@mozilla/readability"
import { Defuddle } from "defuddle/node"
import { parseHTML } from "linkedom"
import TurndownService from "turndown"

const clean = (s) => (s ?? "").replace(/\s+/g, " ").trim()

export const engineA = async (html, url) => {
  const { document } = parseHTML(html)
  const r = await Defuddle(document, url, { markdown: true })
  return {
    title: clean(r.title),
    text: r.content ?? "",
    meta: {
      description: clean(r.description),
      author: clean(r.author),
      published: clean(r.published),
      language: clean(r.language),
      site: clean(r.site),
    },
  }
}

const content = (document, selector) => clean(document.querySelector(selector)?.getAttribute("content"))
const names = (value) =>
  []
    .concat(value ?? [])
    .map((v) => clean(typeof v === "string" ? v : v?.name))
    .filter(Boolean)
    .join(", ")

const readMetadata = (document) => {
  const nodes = []
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const json = JSON.parse(script.textContent)
      nodes.push(...[].concat(json["@graph"] ?? json))
    } catch {}
  }
  const ld =
    nodes.find((n) => /Article|Posting|Product|NewsArticle/.test([].concat(n?.["@type"]).join(" "))) ?? nodes[0] ?? {}
  return {
    title: content(document, 'meta[property="og:title"]') || clean(document.title),
    description: content(document, 'meta[name="description"]') || content(document, 'meta[property="og:description"]'),
    author:
      content(document, 'meta[name="author"]') ||
      content(document, 'meta[property="article:author"]') ||
      names(ld.author),
    published: content(document, 'meta[property="article:published_time"]') || clean(ld.datePublished),
    language: clean(document.documentElement.getAttribute("lang")),
    site: content(document, 'meta[property="og:site_name"]'),
    jsonLdType: [].concat(ld["@type"] ?? []).join(","),
    jsonLdHeadline: clean(ld.headline),
  }
}

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" })

export const engineB = async (html) => {
  const { document } = parseHTML(html)
  const meta = readMetadata(document)
  const article = new Readability(document).parse()
  return {
    title: clean(article?.title) || meta.title,
    text: article?.content ? turndown.turndown(article.content) : "",
    meta: { ...meta, author: meta.author || clean(article?.byline), site: meta.site || clean(article?.siteName) },
  }
}

// Engine C is htmlText copied from cli-messaging src/attachments/markup.ts (file last changed in 358475e0; main was b00ae58c), types removed.
const HTML_DROPPED = /<(script|style|head|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const HTML_BLOCK = /<\/?(p|div|br|li|ul|ol|tr|h[1-6]|blockquote|pre|section|article|header|footer|table|hr)\b[^>]*>/gi
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

/** The visible text of an HTML page: no scripts, styles or tags, blocks on their own lines, entities decoded. */
export const htmlText = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(HTML_DROPPED, "")
    .replace(/<\/t[dh]\s*>/gi, "\t")
    .replace(HTML_BLOCK, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (entity, body) => {
      const lower = body.toLowerCase()
      if (lower.startsWith("#x")) return safeChar(Number.parseInt(lower.slice(2), 16), entity)
      if (lower.startsWith("#")) return safeChar(Number(lower.slice(1)), entity)
      return ENTITIES[lower] ?? entity
    })
    .replace(/[ \t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

const safeChar = (code, fallback) => (code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : fallback)

export const engineC = async (html) => ({
  title: clean(/<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1]),
  text: htmlText(html),
  meta: { description: "", author: "", published: "", language: "", site: "" },
})
