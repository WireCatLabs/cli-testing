import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Project:
  def __init__(self, pid, name, aliases):
    self.pid = pid
    self.meta = {"id": pid, "name": name, "aliases": aliases}
    self.sources = []
    self.units = []
    self.by_id = {}
    self.questions = []

  def source(self, sid, kind, title):
    self.sources.append({"id": sid, "kind": kind, "title": title})
    return sid

  def _add(self, unit):
    assert unit["id"] not in self.by_id, unit["id"]
    self.units.append(unit)
    self.by_id[unit["id"]] = unit

  def chat(self, sid, rows):
    for row in rows:
      uid, author, at, text = row[:4]
      unit = {"id": uid, "source": sid, "author": author, "at": f"2026-{at.replace(' ', 'T')}:00Z", "text": text}
      if len(row) > 4 and row[4]:
        unit["reply_to"] = row[4]
      self._add(unit)

  def doc(self, sid, author, at, rows):
    for uid, section, text in rows:
      self._add({"id": uid, "source": sid, "author": author, "at": f"2026-{at}T00:00:00Z",
                 "section": section, "text": text})

  def meet(self, sid, day, rows):
    for uid, author, clock, text in rows:
      self._add({"id": uid, "source": sid, "author": author, "at": f"2026-{day}T{clock}Z", "text": text})

  def q(self, qid, language, text, kind, answerable, grades, evidence_sets, note, spans=(), control=False):
    for uid, quote in spans:
      assert quote in self.by_id[uid]["text"], (qid, uid, quote)
    question = {"id": f"{self.pid}-{qid}", "project": self.pid, "language": language, "text": text, "kind": kind,
                "answerable": answerable, "grades": grades, "evidence_sets": evidence_sets, "note": note,
                "spans": [{"unit": uid, "quote": quote} for uid, quote in spans]}
    if control:
      question["control"] = True
    self.questions.append(question)

  def write(self):
    corpus = {"project": self.meta, "sources": self.sources, "units": self.units}
    (ROOT / "corpus" / "blind" / f"{self.pid}.json").write_text(json.dumps(corpus, ensure_ascii=False, indent=1))
    (ROOT / "questions" / "blind" / f"{self.pid}.json").write_text(
      json.dumps(self.questions, ensure_ascii=False, indent=1))
    print(self.pid, len(self.units), "units", len(self.questions), "questions")
