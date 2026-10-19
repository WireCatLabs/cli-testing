const sources = [
  { kind: "message", ref: "synthetic:message:planning-1", text: "Mira: The budget is not approved. Review complete." },
  {
    kind: "mail",
    ref: "synthetic:mail:planning-1",
    text: "Subject: Orchard review. Shipping moves to Friday. Review complete.",
  },
  {
    kind: "document",
    ref: "synthetic:document:handbook-1",
    text: "Orchard handbook: Keep archived drafts for 30 days. Review complete.",
  },
  {
    kind: "meeting",
    ref: "synthetic:meeting:planning-1",
    text: "Noah: The budget is approved for the prototype only. Review complete.",
  },
]
const proposal = (changes = {}) => ({
  kind: "fact",
  body: "Budget remains unapproved",
  quote: "budget is not approved",
  ...changes,
})
const response = (items) => JSON.stringify({ items })
export const cases = () => {
  const base = (id, changes = {}) => ({
    id,
    source: sources[0],
    text: sources[0].text,
    answer: response([proposal()]),
    accepted: true,
    count: 1,
    ...changes,
  })
  const rejected = (id, changes) => base(id, { accepted: false, code: "invalid_response", ...changes })
  const inputRejected = (id, text) => rejected(id, { text, code: "validation_error", calls: 0 })
  return [
    ...sources.map((source, i) =>
      base(`source-${source.kind}`, {
        source,
        text: source.text,
        answer: response([
          proposal({
            kind: ["fact", "summary", "digest", "preference"][i],
            body: "Synthetic supported candidate",
            quote: source.text,
          }),
        ]),
      }),
    ),
    base("empty-items", { answer: response([]), count: 0 }),
    base("twenty-items", { answer: response(Array.from({ length: 20 }, () => proposal())), count: 20 }),
    rejected("twenty-one-items", { answer: response(Array.from({ length: 21 }, () => proposal())) }),
    inputRejected("blank-input", " \n\t"),
    base("input-at-limit", { text: "a".repeat(50000), answer: response([]), count: 0 }),
    inputRejected("input-over-limit", "a".repeat(50001)),
    base("unicode-input-at-limit", { text: "🌿".repeat(25000), answer: response([]), count: 0 }),
    inputRejected("unicode-input-over-limit", "🌿".repeat(25001)),
    base("output-at-limit", { answer: response([]).padEnd(400000, " "), count: 0 }),
    rejected("output-over-limit", { answer: response([]).padEnd(400001, " ") }),
    base("quote-at-minimum", { text: "abcdefgh", answer: response([proposal({ quote: "abcdefgh" })]) }),
    rejected("quote-below-minimum", { answer: response([proposal({ quote: "budget " })]) }),
    base("quote-at-maximum", { text: "q".repeat(4000), answer: response([proposal({ quote: "q".repeat(4000) })]) }),
    rejected("quote-over-maximum", {
      text: "q".repeat(4001),
      answer: response([proposal({ quote: "q".repeat(4001) })]),
    }),
    base("body-at-maximum", { answer: response([proposal({ body: "b".repeat(15000) })]) }),
    rejected("body-over-maximum", { answer: response([proposal({ body: "b".repeat(15001) })]) }),
    rejected("body-blank-after-trim", { answer: response([proposal({ body: " \n " })]) }),
    base("body-trimmed", {
      answer: response([proposal({ body: "  Budget remains unapproved  " })]),
      normalized_body: "Budget remains unapproved",
    }),
    rejected("quote-case-changed", { answer: response([proposal({ quote: "Budget is not approved" })]) }),
    rejected("quote-whitespace-changed", { answer: response([proposal({ quote: "budget  is not approved" })]) }),
    rejected("one-invalid-rejects-batch", {
      answer: response([proposal(), proposal({ quote: "Absent invented evidence" })]),
    }),
    rejected("unsupported-task-kind", { answer: response([proposal({ kind: "task" })]) }),
    rejected("unsupported-decision-kind", { answer: response([proposal({ kind: "decision" })]) }),
    rejected("malformed-json", { answer: "not JSON" }),
    rejected("missing-items", { answer: "{}" }),
    base("unsupported-fields-stripped", {
      answer: JSON.stringify({
        source_ref: sources[3].ref,
        items: [proposal({ assignee: "Noah", source_ref: sources[3].ref })],
      }),
      stripped: true,
    }),
    base("semantically-wrong-exact-quote", {
      answer: response([proposal({ body: "The budget was approved" })]),
      risk: "exact-quote-does-not-entail-claim",
    }),
    rejected("other-source-unique-quote", { answer: response([proposal({ quote: "prototype only" })]) }),
    base("shared-quote-wrong-attribution", {
      answer: response([proposal({ body: "Noah approved the prototype budget", quote: "Review complete." })]),
      risk: "shared-quote-cannot-identify-source-or-speaker",
    }),
  ]
}
