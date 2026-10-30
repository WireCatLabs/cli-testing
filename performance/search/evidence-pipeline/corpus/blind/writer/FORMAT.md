# Corpus and question format

One project per file, `corpus/blind/<project>.json`. All text is synthetic: invented people, companies and
numbers. Nothing is copied from a real archive.

```json
{
  "project": { "id": "harbor", "name": "Harbor clinic website", "aliases": ["Харбор", "сайт клиники"] },
  "sources": [
    { "id": "harbor-chat-site", "kind": "chat", "title": "Сайт" },
    { "id": "harbor-doc-brief", "kind": "document", "title": "Website brief v3" },
    { "id": "harbor-meet-0914", "kind": "meeting", "title": "Weekly sync 14 Sep" }
  ],
  "units": [
    { "id": "h-101", "source": "harbor-chat-site", "author": "Ольга", "at": "2026-09-14T09:12:00Z",
      "text": "Логи храним дольше 21 дня?" },
    { "id": "h-102", "source": "harbor-chat-site", "author": "Dmitri", "at": "2026-09-14T09:20:00Z",
      "reply_to": "h-101", "text": "Нет, не больше 21 дня — требование безопасности." },
    { "id": "h-301", "source": "harbor-doc-brief", "author": "Anna", "at": "2026-09-01T00:00:00Z",
      "section": ["Hosting", "Logs"], "text": "…" },
    { "id": "h-501", "source": "harbor-meet-0914", "author": "Pavel", "at": "2026-09-14T10:03:10Z",
      "text": "…one transcript turn…" }
  ]
}
```

- A **unit** is the smallest retrievable thing: one message, one document section or one transcript turn.
  At most 8,000 UTF-8 bytes.
- `reply_to` exists only for chat messages and points at a unit in the same source: a native reply.
- `section` is the heading path of a document section. Transcript turns follow each other by `at`.
- Units within one source are in time order. Ids are unique across all projects.

Questions live beside the corpus, `questions/blind/<project>.json`:

```json
[
  { "id": "harbor-q03", "project": "harbor", "language": "ru",
    "text": "Сколько дней можно хранить логи сайта?",
    "kind": "negative",
    "answerable": true,
    "grades": { "h-102": 3, "h-101": 2, "h-301": 1 },
    "evidence_sets": [["h-101", "h-102"], ["h-301"]],
    "note": "The reply alone says 'no'; it needs its question." }
]
```

- `kind` is one of: `fact`, `negative`, `conditional`, `approval`, `unresolved`, `conflict`, `revoked`,
  `same-name`, `missing`, `premise`.
- `answerable: false` means no settled answer exists in the corpus (missing, unresolved, open conflict, false
  premise). It may still have useful grade-1/2 evidence.
- Grades: **3** states the answer (or the decisive denial or condition). **2** is needed to understand a
  3, such as the question its reply answers, or one side of a conflict. **1** is relevant background.
  Unlisted units are 0.
- `evidence_sets` are alternative complete sets. Any one set, fully present, supports the answer. A set
  is empty for an unanswerable question with no useful evidence.
- Scoring code reads only `text` and `project` from a question. `kind`, `grades`, `evidence_sets` and
  `note` never reach a ranker.

Two more question fields:

```json
{ "spans": [{ "unit": "h-102", "quote": "Нет, не больше 21 дня — требование безопасности." }], "control": true }
```

- `spans` — for every grade-3 unit, the exact sentence(s) that state the answer, as a substring of its text.
- `control` — `true` for a decision that still stands (see BRIEF.md); omit it otherwise.
