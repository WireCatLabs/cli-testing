import { registerHooks } from "node:module"
import "../drive-shared-store/guard.mjs"

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.includes("@napi-rs/keyring")) throw new Error("synthetic transfer check refuses credential access")
    return next(specifier, context)
  },
})
