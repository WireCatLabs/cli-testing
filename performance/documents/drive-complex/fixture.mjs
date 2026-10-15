const paragraph = (text) => ({ paragraph: { elements: [{ textRun: { content: `${text}\n` } }] } })
const cell = (...content) => ({ content })

export const complexDocument = (edited = false) => ({
  documentId: "complex",
  title: "Synthetic duplicate",
  tabs: [
    {
      tabProperties: { tabId: "main", title: "Overview" },
      documentTab: {
        body: { content: [paragraph(edited ? "replacementmarker approved" : "originalmarker proposed")] },
        headers: { header: { content: [paragraph("excludedheadermarker")] } },
        footers: { footer: { content: [paragraph("excludedfootermarker")] } },
      },
      childTabs: [
        {
          tabProperties: { tabId: "child", title: "Budget" },
          documentTab: {
            body: {
              content: [
                {
                  table: {
                    tableRows: [
                      { tableCells: [cell(paragraph("hostingmarker")), cell(paragraph("120")), cell(paragraph(""))] },
                      {
                        tableCells: [
                          cell(paragraph("staffmarker")),
                          cell({ table: { tableRows: [{ tableCells: [cell(paragraph("nestedcellmarker"))] }] } }),
                        ],
                      },
                    ],
                  },
                },
                { paragraph: { elements: [{ footnoteReference: { footnoteId: "footnote-one" } }] } },
              ],
            },
            footnotes: { "footnote-one": { content: [paragraph("footnotemarker excludes tax")] } },
          },
          childTabs: [
            {
              tabProperties: { tabId: "grandchild", title: "Details" },
              documentTab: {
                body: {
                  content: [{ tableOfContents: { content: [paragraph("tocmarker")] } }, paragraph("deepestmarker")],
                },
              },
            },
          ],
        },
      ],
    },
    {
      tabProperties: { tabId: "second", title: "People" },
      documentTab: {
        body: {
          content: [
            {
              paragraph: {
                elements: [
                  { person: { personProperties: { name: "Rin Example" } } },
                  { textRun: { content: " / " } },
                  { richLink: { richLinkProperties: { title: "linkedbriefmarker" } } },
                  { textRun: { content: "\n" } },
                ],
              },
            },
            paragraph("Юникод café finaltabmarker"),
          ],
        },
      },
    },
    { tabProperties: { tabId: "empty", title: "Empty" }, documentTab: { body: { content: [] } } },
  ],
})

export const expectedTabs = ["main", "child", "grandchild", "second", "empty"]
export const expectedMarkers = [
  "hostingmarker",
  "staffmarker",
  "nestedcellmarker",
  "footnotemarker",
  "tocmarker",
  "deepestmarker",
  "Rin Example",
  "linkedbriefmarker",
  "Юникод café",
  "finaltabmarker",
]
export const nativeMarkdown = (edited = false) =>
  `# Provider Markdown\r\n${edited ? "replacementmarker" : "originalmarker"}\r\nUnicode café\r\n`
