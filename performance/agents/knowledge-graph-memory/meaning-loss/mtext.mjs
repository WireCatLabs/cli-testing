const PKG = `${process.env.HOME}/.cache/wirecat-bench/memo-pkg-0.131.50/node_modules/@wirecat/cli-core/dist`
const { plainQuery } = await import(`${PKG}/search/lucene/plain.js`)
const { plainWords } = await import(`${PKG}/services/pictures.js`)
const { questionText, questionLookup } = await import(`${PKG}/search/question-plan.js`)
const { meaningWords } = await import(`${PKG}/search/lucene/meaning-parts.js`)
const { parseLucene } = await import(`${PKG}/../../cli-base/dist/query/index.js`)
const { validateFields } = await import(`${PKG}/search/lucene/registry.js`)
const { SEARCH_QUERY } = await import(`${PKG}/search/lucene/types.js`)
const meaningText = (q) => {
  try {
    return meaningWords(
      validateFields(
        parseLucene(questionLookup(q) === undefined ? q : questionText(q), { ...SEARCH_QUERY, defaultField: "text" }),
      ).root,
    )
  } catch (e) {
    return `<threw ${e.code ?? e.message}> -> ${plainWords(q)}`
  }
}
for (const raw of [
  "content:invoice",
  "from:alice budget",
  "budget harbour",
  '"harbour loft" deposit',
  "budg*",
  "When is the call? Answer as YYYY-MM-DD HH:MM.",
  "invoice NOT paid",
  "budget OR harbour",
  "subject:retreat deposit",
]) {
  const q = plainQuery(raw)
  process.stdout.write(
    `${[JSON.stringify(raw), "| plainWords:", JSON.stringify(plainWords(q)), "| meaningText:", JSON.stringify(meaningText(q))].join(" ")}\n`,
  )
}
