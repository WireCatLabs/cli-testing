// usage: SPLIT_INDEX=<file> node --import ./split-hook.mjs <bin.js> … — serves <file> in place of cli-base's
// standards/index.js. Without SPLIT_INDEX the hook passes everything through, so both variants pay the same overhead.

import { registerHooks } from "node:module"
import { pathToFileURL } from "node:url"

const split = process.env.SPLIT_INDEX
registerHooks({
  resolve(specifier, context, next) {
    const r = next(specifier, context)
    if (split && r.url.endsWith("/cli-base/dist/standards/index.js")) return { ...r, url: pathToFileURL(split).href }
    return r
  },
})
