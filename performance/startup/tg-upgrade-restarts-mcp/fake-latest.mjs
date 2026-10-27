// Answers npm's "latest" for tg with the version under test; every other request goes out as usual.
const real = globalThis.fetch
globalThis.fetch = async (url, init) =>
  String(url) === "https://registry.npmjs.org/@wirecat/tg-cli/latest"
    ? new Response(JSON.stringify({ version: process.env.E2E_LATEST }), {
        headers: { "content-type": "application/json" },
      })
    : real(url, init)
