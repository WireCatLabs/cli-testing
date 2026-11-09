#!/usr/bin/env python3
"""Generate a synthetic memory corpus and score normalized, cited engine answers."""

import argparse
import hashlib
import json
import platform
import random
import re
from datetime import date, timedelta
from pathlib import Path

PEOPLE = ["Ari Vale", "Bo Reed", "Cy Moss", "Dee Lake", "Eli Pine", "Fay Stone", "Gio Fern", "Hal Cove", "Ira Brook", "Jo Birch"]
PROJECTS = ["Amber Kite", "Birch Compass", "Cedar Lantern", "Dune Harbor", "Elm Beacon", "Flint Meadow", "Grove Atlas", "Hazel Bridge", "Iris Summit", "Juniper Valley"]
KINDS = ["telegram", "mail", "notes", "meetings"]


def source_ref(kind, number):
    if kind == "telegram":
        return f"msg:telegram/synthetic/team/{number}"
    if kind == "mail":
        return f"msg:email/synthetic%40example.test/thread-{number}/{number}"
    if kind == "notes":
        return f"document:{number}"
    return f"meeting:synthetic/{number}/cue/1"


def corpus():
    records, questions = [], []

    def add(kind, date, text):
        record = {"id": source_ref(kind, len(records) + 1), "kind": kind, "timestamp": date, "text": text}
        records.append(record)
        return record["id"]

    def ask(question, answer, citations, stale=None):
        questions.append({"id": f"q{len(questions) + 1:02}", "question": question,
                          "as_of": "2026-10-20T00:00:00Z", "answers": [answer],
                          "required_citations": citations, "stale_answers": stale or []})

    for index, (person, project) in enumerate(zip(PEOPLE, PROJECTS, strict=True)):
        old, new = f"2026-11-{index + 1:02}", f"2026-12-{index + 11:02}"
        first = add("telegram", "2026-10-01T09:00:00Z", f"{person}: We agreed the {project} delivery date is {old}.")
        changed = add("mail", "2026-10-10T10:00:00Z", f"Confirmed decision for {project}: replace {old} with {new}. The earlier deadline is cancelled.")
        owner = add("notes", "2026-10-03T12:00:00Z", f"{project} responsibility: {person} is the delivery owner. Keep this separate from project mentions.")
        handoff = add("meetings", "2026-10-05T14:00:00Z", f"For {project}, {person} agreed to deliver the accessibility review. This is a commitment, not a suggestion.")
        add("telegram", "2026-10-12T15:00:00Z", f"Could we move {project} to 2027-01-15? This is a suggestion only, no decision was made.")
        add("mail", "2026-10-13T10:00:00Z", f"Draft discussion about {project}: someone mentioned {PEOPLE[(index + 1) % 10]}, who is not the delivery owner.")
        add("notes", "2026-10-14T12:00:00Z", f"{project} reference: the original delivery date appears in the old October thread; use the confirmed replacement for current plans.")
        add("meetings", "2026-10-15T14:00:00Z", f"{project} update: the accessibility review is still open. No approved budget figure is recorded.")
        ask(f"What is the current confirmed delivery date for {project}?", new, [changed], [old, "2027-01-15"])
        ask(f"What was the original delivery date agreed for {project}, before it changed?", old, [first])
        ask(f"Who is the confirmed delivery owner of {project}?", person, [owner])
        ask(f"What did {person} commit to delivering for {project}?", "accessibility review", [handoff])
        ask(f"What approved budget amount was agreed for {project}?", "unknown", [])

    rng = random.Random(20261024)
    topics = ["test report", "calendar invite", "lunch plan", "draft design", "travel checklist", "dependency review", "room booking", "status note"]
    while len(records) < 2000:
        number = len(records)
        kind = KINDS[number % 4]
        person = rng.choice(PEOPLE)
        topic = rng.choice(topics)
        add(kind, f"2026-09-{number % 28 + 1:02}T08:00:00Z",
            f"Archive item {number}: {person} discussed the {topic} for a separate sandbox exercise, reference batch {rng.randrange(10000)}. No delivery decision or budget approval.")
    assert len(questions) == 50 and len({record["id"] for record in records}) == 2000
    return records, questions


ARCHIVE_SEED = 20261105
# Mem0's free tier had under 7,850 adds left for November 2026; a margin for Hermes's per-turn adds.
MEM0_SUBSET = 6500
ARCHIVE_PROJECTS = [*PROJECTS, "Amber Kitchen", "Hazel Ridge"]
LOOKALIKES = dict(zip(PEOPLE, ["Ari Vail", "Bo Read", "Cy Ross", "Dee Blake", "Eli Paine", "Kay Stone", "Gia Fern",
                               "Hal Grove", "Ira Brooks", "Jo Burch"], strict=True))
ARCHIVE_PEOPLE = [*PEOPLE, *LOOKALIKES.values(), "Kim Hale", "Lou Park", "Max Dorn", "Nia Shaw", "Oli West",
                  "Pia Lund", "Quin Roy", "Raj Iyer", "Sol Mendez", "Tess Ng"]
MILESTONES = ["beta", "launch", "mobile app", "data migration", "partner API", "billing revamp", "pilot",
              "security hardening"]
DELIVERABLES = ["accessibility review", "security audit", "load test report", "migration guide", "pricing page copy",
                "data retention policy", "onboarding checklist", "API changelog", "incident runbook",
                "localization plan", "privacy review", "release notes", "support playbook", "rollback plan",
                "usability study", "cost forecast"]
TOPICS = ["test report", "calendar invite", "draft design", "travel notes", "dependency review", "status note",
          "wireframes", "error budget", "staging deploy", "feature flags", "copy edits", "flaky tests",
          "support tickets", "analytics events", "logo files", "font licence", "sprint board", "demo script",
          "screenshots", "sample data", "build cache", "on-call rota", "survey results", "style guide",
          "vendor contract", "translation memory", "beta feedback", "crash logs", "seat plan", "press kit"]
TOOLS = ["lint", "unit test", "e2e", "docker build", "deploy", "type check", "bundle size"]
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
ARCHIVE_START, ARCHIVE_END = date(2026, 1, 5), date(2026, 10, 18)
PAIRS = {**LOOKALIKES, **{twin: person for person, twin in LOOKALIKES.items()}}
SLOTS = 66

TELEGRAM_NOISE = [
    "{a}: morning all, {S} standup in 10.",
    "{a}: CI for {P} is red again, looking at the {tool} step.",
    "{a}: pushed the {topic} for the {S}, reviews welcome.",
    "{a}: anyone know where the {topic} for {P} lives?",
    "{a}: {b}, can you look at the {topic} when you have a minute? It is for the {S}.",
    "{a}: heads up, the {P} demo moved to {event}.",
    "{a}: lunch after the {P} retro?",
    "{a}: I am out on {weekday}, {b} covers {P} questions.",
    "{a}: the {S} board is up to date.",
    "{a}: thanks {b}, that fixed the {topic}.",
    "{a}: is the {S} channel the right place for {topic} questions?",
    "{a}: {b} and I paired on the {topic} for {P} today, notes later.",
]
MAIL_NOISE = [
    ("{P} weekly", "{a}: notes from this week attached; no changes to scope."),
    ("{topic} for the {S}", "{a}: draft attached, comments by {weekday} please."),
    ("{P} offsite", "{a}: the {P} offsite is planned for {event}; travel details to follow."),
    ("Invoice {num}", "{a}: invoice for {P} tooling, please forward to finance."),
    ("{S} questions", "{a}: a few questions about the {topic}; happy to discuss on a call."),
    ("{P} access", "{a}: please add {b} to the {P} repository and the {topic} folder."),
]
MAIL_REPLIES = ["{b}: thanks, will read it.", "{b}: looks fine to me.", "{b}: one comment on the {topic}, see inline.",
                "{b}: can we talk about this on {weekday}?", "{b}: forwarding to {c}.", "{b}: done."]
NOTES_NOISE = [
    "{P} meeting notes: discussed the {topic} and the {topic2}; follow-ups in the tracker.",
    "{S} open questions: the {topic}? the {topic2}? Nothing decided.",
    "{P} glossary: the {topic} means the internal one, not the customer one.",
    "Reading list for {P}: the {topic}, the {topic2}.",
    "{a}'s notes: talk to {b} about the {topic} for the {S}.",
    "{S} risks: the {topic} may slip; the {topic2} depends on another team.",
    "{P} contacts: {a} for the {topic}, {b} for the {topic2}.",
]
MEETING_NOISE = [
    "{P} standup: {a} worked on the {topic}; {b} is blocked on the {topic2}.",
    "{S} sync: {a} walked through the {topic}; questions parked for later.",
    "{P} retro: went well, the {topic}; to improve, the {topic2}.",
    "{P} planning: {a} raised the {topic}; to revisit next sprint.",
    "{S} review: {a} demoed the {topic}; {b} asked about timelines, no dates were set.",
    "{P} one-to-one, {a} and {b}: mostly about the {topic}.",
]
GENERIC_NOISE = [
    ("telegram", "{a}: the office printer is jammed again."),
    ("telegram", "{a}: happy birthday {b}!"),
    ("mail", "IT notice: password rotation on {event}; nothing to do yet."),
    ("mail", "Newsletter {num}: company updates and the {topic}."),
    ("notes", "Personal todo: book the dentist, renew the {topic}."),
    ("meetings", "All-hands: welcome to new joiners; the {topic} was presented."),
]


def iso(day, minute):
    return f"{day.isoformat()}T{minute // 60:02}:{minute % 60:02}:00Z"


def mail(subject, body, root=None, quote=None):
    text = f"{'Re: ' if root else ''}{subject}. {body}" + (f" > {quote}" if quote else "")
    return {"kind": "mail", "text": text, "root": root}


def subject_trail(rng, fresh_date, team, subject, owner, lookalike):
    """One milestone's history in order, and its five questions with the records that answer them."""

    def asker():
        return rng.choice([person for person in team if person != owner])

    chain = []

    def add(kind, text):
        chain.append({"kind": kind, "text": text, "root": None})
        return chain[-1]

    def thread(subject_line, first, reply):
        root = mail(subject_line, first)
        chain.append(root)
        chain.append(mail(subject_line, reply, root=root, quote=first))
        return chain[-1]

    dates = [fresh_date(date(2026, 10, 20) + timedelta(days=rng.randint(0, 40)))]
    original = add("telegram", f"{owner}: We agreed the {subject} delivery date is {dates[0]}.")
    owner_note = add("notes", f"{subject} responsibility: {owner} is the delivery owner.")
    first_deliverable, revised, offered, extra = rng.sample(DELIVERABLES, 4)
    commitment = add("meetings", f"For the {subject}, {owner} agreed to deliver the {first_deliverable}. "
                                 "This is a commitment, not a suggestion.")
    add("mail", f"Draft discussion about the {subject}: someone mentioned {lookalike}, who is not the delivery "
                "owner.")
    current_owner, owner_record, stale_owner = owner, owner_note, []
    handover_at = 1 if rng.random() < 0.5 else None
    stale_dates = []
    changes = rng.choice([2, 2, 3, 3, 4])
    confirmed = None
    for step in range(1, changes + 1):
        previous = dates[-1]
        if rng.random() < 0.4:
            rejected = fresh_date(previous)
            stale_dates.append(rejected)
            thread(f"{subject} date", f"{asker()}: could we move the {subject} from {previous} to {rejected}?",
                   f"{current_owner}: no, we are not moving it.")
        dates.append(fresh_date(previous))
        proposal = f"{asker()}: proposal to move the {subject} from {previous} to {dates[-1]}, " \
                   f"waiting for {current_owner} to confirm."
        if step == changes and rng.random() < 0.35:
            chain.append(mail(f"{subject} date", proposal))
            confirmed = add("meetings", f"{subject} review, decision: the delivery date moves from {previous} "
                                        f"to {dates[-1]}, confirmed by {current_owner}.")
        else:
            confirmed = thread(f"{subject} date", proposal,
                               f"{current_owner}: Confirmed decision for the {subject}: replace {previous} "
                               f"with {dates[-1]}. The earlier date is cancelled.")
        if step < changes and rng.random() < 0.6:
            add("meetings", f"Recap for the {subject}: the plan currently says {dates[-1]}; more changes may "
                            "come.")
        if step == handover_at:
            successor = rng.choice([person for person in team if person not in (owner, lookalike)])
            owner_record = add(rng.choice(["notes", "mail"]),
                               f"Handover: {successor} takes over as delivery owner of the {subject} from "
                               f"{owner}, effective today.")
            stale_owner, current_owner = [owner], successor
            add("meetings", f"{subject} history: {owner} led the delivery in the first months.")
    assert lookalike != current_owner, subject
    add("telegram", f"{asker()}: should {lookalike} take over the {subject}? Just asking, nothing agreed.")
    stale_commitment = []
    if rng.random() < 0.5:
        commitment = add("meetings", f"Revised commitment for the {subject}: {owner} will deliver the "
                                     f"{revised} instead of the {first_deliverable}.")
        add("notes", f"{subject} checklist (older copy): the {first_deliverable} from {owner}.")
        stale_commitment = [first_deliverable]
    add("telegram", f"Maybe {owner} could also take on the {extra} for the {subject}? Only an idea, not "
                    "agreed.")
    add("telegram", f"{lookalike}: I can draft the {offered} for the {subject} if useful; nobody has accepted.")
    almost = fresh_date(dates[-1])
    add("telegram", f"Could we push the {subject} to {almost}? This is a suggestion only, no decision was made.")
    thread(f"{subject} date", f"{asker()}: following up on {almost} for the {subject}; can we decide this week?",
           f"{asker()}: let us not decide over mail; parking it.")
    add("meetings", f"{subject} sync: moving to {almost} came up again; no one confirmed it.")
    add("mail", f"Draft budget idea for the {subject}: about EUR {rng.randint(8, 90)},000. Not approved; "
                "finance has not decided.")
    add("telegram", f"{asker()}: is there an approved budget for the {subject} yet? No reply so far.")
    add("meetings", f"{subject} update: the {[first_deliverable, revised][bool(stale_commitment)]} is still "
                    "open. No approved budget figure is recorded.")
    start = ARCHIVE_START + timedelta(days=rng.randint(7, 120))
    # Ten-minute working-hour slots keep the chain in order: a reply never precedes what it answers.
    span = (date(2026, 10, 15) - start).days * SLOTS
    for item, offset in zip(chain, sorted(rng.sample(range(span), len(chain))), strict=True):
        item["day"] = start + timedelta(days=offset // SLOTS)
        item["minute"], item["order"] = 8 * 60 + offset % SLOTS * 10, offset
    stale = [str(day) for day in dates[:-1] + stale_dates + [almost]]
    subject_questions = [
        (f"What is the current confirmed delivery date for the {subject}?", str(dates[-1]), [confirmed], stale),
        (f"What was the original delivery date agreed for the {subject}, before it changed?", str(dates[0]),
         [original], []),
        (f"Who is the confirmed delivery owner of the {subject}?", current_owner, [owner_record], stale_owner),
        (f"What did {owner} commit to delivering for the {subject}?",
         revised if stale_commitment else first_deliverable, [commitment], stale_commitment),
        (f"What approved budget amount was agreed for the {subject}?", "unknown", [], []),
    ]
    hardness = (changes, len(stale_dates) - changes, bool(stale_owner), bool(stale_commitment))
    return chain, subject_questions, {"hardness": hardness, "people": [owner, current_owner, lookalike]}


def archive_corpus(size):
    """About a dozen projects with long, noisy histories; every question subject is one project milestone."""
    rng = random.Random(ARCHIVE_SEED)
    items, asked = [], {}
    used_dates = set()

    def fresh_date(after):
        day = after + timedelta(days=rng.randint(9, 45))
        while day in used_dates:
            day += timedelta(days=1)
        used_dates.add(day)
        return day

    teams = {}
    for index, project in enumerate(ARCHIVE_PROJECTS):
        lead = PEOPLE[index] if index < 10 else LOOKALIKES[PEOPLE[[0, 7][index - 10]]]
        others = rng.sample([person for person in ARCHIVE_PEOPLE if person != lead], 6)
        teams[project] = [lead, *others]
    # The look-alike projects share milestone names and their leads' names differ by one letter.
    plans = [(project, MILESTONES[:5] if project in ("Amber Kite", "Amber Kitchen") else rng.sample(MILESTONES, 4))
             for project in ARCHIVE_PROJECTS]
    assert sum(len(milestones) for _, milestones in plans) == 50

    for project, milestones in plans:
        team = teams[project]
        for number, milestone in enumerate(milestones):
            subject = f"{project} {milestone}"
            owner = team[0] if number == 0 else rng.choice(team)
            lookalike = PAIRS.get(owner) or rng.choice([person for person in team if person != owner])
            chain, subject_questions, info = subject_trail(rng, fresh_date, team, subject, owner, lookalike)
            items.extend(chain)
            # The asked milestone of a real project is its hardest: most changes, then rejected proposals,
            # then a handover and a revised commitment; ties go to the earlier milestone.
            rank = (*info["hardness"], -number)
            if project in PROJECTS and (project not in asked or rank > asked[project][0]):
                asked[project] = (rank, subject, subject_questions, info["people"])

    def fill(template, project=None):
        team = teams[project] if project else ARCHIVE_PEOPLE
        a, b, c = rng.sample(team, 3)
        milestone = rng.choice(dict(plans)[project]) if project else ""
        topic, topic2 = rng.sample(TOPICS, 2)
        event = ARCHIVE_START + timedelta(days=rng.randint(0, 330))
        return template.format(a=a, b=b, c=c, P=project, S=f"{project} {milestone}", topic=topic, topic2=topic2,
                               tool=rng.choice(TOOLS), weekday=rng.choice(WEEKDAYS), event=event,
                               num=rng.randint(1000, 9999))

    def place(item, day):
        item["day"], item["minute"], item["order"] = day, rng.randrange(7 * 60, 22 * 60), 0
        items.append(item)

    days = (ARCHIVE_END - ARCHIVE_START).days - 9
    while len(items) < size:
        day = ARCHIVE_START + timedelta(days=rng.randrange(days))
        if rng.random() < 0.12:
            kind, template = rng.choice(GENERIC_NOISE)
            place({"kind": kind, "text": fill(template), "root": None}, day)
            continue
        project = rng.choice(ARCHIVE_PROJECTS)
        kind = rng.choice(KINDS)
        if kind != "mail":
            pool = {"telegram": TELEGRAM_NOISE, "notes": NOTES_NOISE, "meetings": MEETING_NOISE}[kind]
            place({"kind": kind, "text": fill(rng.choice(pool), project), "root": None}, day)
            continue
        subject_line, body = rng.choice(MAIL_NOISE)
        subject_line, body = fill(f"{subject_line}\x00{body}", project).split("\x00")
        subject_line = subject_line[0].upper() + subject_line[1:]
        root = mail(subject_line, body)
        place(root, day)
        for _ in range(rng.choice([0, 0, 1, 1, 2, 3])):
            if len(items) >= size:
                break
            day += timedelta(days=rng.randint(1, 3))
            place(mail(subject_line, fill(rng.choice(MAIL_REPLIES), project), root=root, quote=body), day)

    items.sort(key=lambda item: (item["day"], item["minute"], item["order"]))
    records = []
    for number, item in enumerate(items, start=1):
        item["number"] = number
        thread_number = item["root"]["number"] if item["root"] else number
        ref = (f"msg:email/synthetic%40example.test/thread-{thread_number}/{number}" if item["kind"] == "mail"
               else source_ref(item["kind"], number))
        item["id"] = ref
        records.append({"id": ref, "kind": item["kind"], "timestamp": iso(item["day"], item["minute"]),
                        "text": item["text"]})
    questions = [row for project in PROJECTS for row in asked[project][2]]
    subjects = [asked[project][1] for project in PROJECTS]
    people = sorted({person for project in PROJECTS for person in asked[project][3]})
    width = len(str(len(questions)))
    questions = [{"id": f"q{index:0{width}}", "question": question, "as_of": "2026-10-20T00:00:00Z",
                  "answers": [answer], "required_citations": [item["id"] for item in cited], "stale_answers": stale}
                 for index, (question, answer, cited, stale) in enumerate(questions, start=1)]
    assert len(records) == size and len({record["id"] for record in records}) == size
    assert all(record["timestamp"] < "2026-10-19" for record in records)
    return records, questions, {"subjects": subjects, "people": people}


DECISION_WORDS = re.compile(r"delivery|date|owner|commit|deliver|budget|take over|Handover|Recap|history")


def provider_subset(records, asked, size, seed=ARCHIVE_SEED):
    """The records a capped provider gets: all about the asked milestones, then the hardest distractors, then noise."""
    texts = [record["text"] for record in records]
    projects = sorted({project for subject in asked["subjects"] for project in ARCHIVE_PROJECTS
                       if subject.startswith(project + " ")})
    twins = {"Amber Kite": "Amber Kitchen", "Hazel Bridge": "Hazel Ridge"}
    near = [*projects, *(twins[project] for project in projects if project in twins)]
    lookalikes = sorted({PAIRS[person] for person in asked["people"] if person in PAIRS})
    tiers = [
        ("asked milestones", lambda text: any(subject in text for subject in asked["subjects"])),
        ("decisions of other milestones and look-alike projects",
         lambda text: any(name in text for name in near) and bool(DECISION_WORDS.search(text))),
        ("quoting replies about the asked projects",
         lambda text: text.startswith("Re: ") and any(name in text for name in near)),
        ("look-alike people in the asked projects",
         lambda text: any(name in text for name in lookalikes) and any(name in text for name in near)),
    ]
    chosen, counts = [], {}
    taken = set()
    for label, test in tiers:
        tier = [index for index, text in enumerate(texts) if index not in taken and test(text)]
        tier = tier[:max(0, size - len(chosen))]
        chosen += tier
        taken.update(tier)
        counts[label] = len(tier)
    rest = [index for index in range(len(records)) if index not in taken]
    random.Random(seed).shuffle(rest)
    noise = rest[:max(0, size - len(chosen))]
    counts["noise"] = len(noise)
    chosen = sorted([*chosen, *noise])
    assert counts["asked milestones"] == sum(any(s in text for s in asked["subjects"]) for text in texts)
    lines = "".join(json.dumps(records[index], ensure_ascii=False) + "\n" for index in chosen)
    return {"records": len(chosen), "sha256": hashlib.sha256(lines.encode()).hexdigest(), "tiers": counts,
            "ids": [records[index]["id"] for index in chosen]}


def normalized(value, strict=False):
    text = re.sub(r"\s+", " ", value.strip().casefold())
    # "the accessibility review" names the same thing as the key's "accessibility review" (NEED-2212).
    return text if strict else re.sub(r"^(the|a|an) ", "", text)


def score(records, questions, predictions):
    known = {record["id"] for record in records}
    by_id = {row["id"]: row for row in predictions}
    expected = {question["id"] for question in questions}
    if len(by_id) != len(predictions) or set(by_id) != expected:
        raise ValueError("predictions must contain every question exactly once, with no extra ids")
    counts = {"correct": 0, "cited_correctly": 0, "stale": 0, "correct_strict": 0}
    for question in questions:
        row = by_id[question["id"]]
        answer = normalized(row["answer"])
        citations = row["citations"]
        if not isinstance(citations, list) or not all(isinstance(ref, str) for ref in citations):
            raise ValueError("citations must be a list of source ids")
        correct = answer in {normalized(value) for value in question["answers"]}
        supported = all(ref in known for ref in citations) and set(question["required_citations"]) == set(citations)
        if not question["required_citations"]:
            supported = citations == []
        counts["correct"] += correct
        counts["correct_strict"] += normalized(row["answer"], strict=True) in {
            normalized(value, strict=True) for value in question["answers"]}
        counts["cited_correctly"] += correct and supported
        counts["stale"] += answer in {normalized(value) for value in question["stale_answers"]}
    return counts


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="new directory; existing paths are refused")
    parser.add_argument("--predictions", type=Path, help="normalized answers from one engine, JSON array")
    parser.add_argument("--engine", default="external engine", help="recorded engine name and exact version")
    parser.add_argument("--self-check", action="store_true", help="validate the corpus and scorer, without running any engine")
    parser.add_argument("--records", type=int, default=2000,
                        help="2000 is the original fixture; any other size is the archive corpus (at least 3000)")
    args = parser.parse_args()
    if args.records != 2000 and args.records < 3000:
        parser.error("the archive corpus needs at least 3000 records")
    args.output.mkdir(parents=True, exist_ok=False)
    records, questions, asked = (*corpus(), None) if args.records == 2000 else archive_corpus(args.records)
    rows = len(records)
    source = "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records)
    (args.output / "corpus.jsonl").write_text(source)
    write_json(args.output / "queries.json", [{key: row[key] for key in ["id", "question", "as_of"]} for row in questions])
    write_json(args.output / "oracle.json", questions)
    archive = {}
    if asked:
        subset = provider_subset(records, asked, MEM0_SUBSET)
        write_json(args.output / "subset-mem0.json", subset)
        archive = {"projects": len(ARCHIVE_PROJECTS), "milestones": 50, "asked_milestones": asked["subjects"],
                   "mem0_subset": {key: subset[key] for key in ("records", "sha256", "tiers")}}
    write_json(args.output / "manifest.json", {
        "fixture_version": 1 if rows == 2000 else 2, "seed": 20261024 if rows == 2000 else ARCHIVE_SEED,
        "records": rows, "questions": len(questions), **archive,
        "source_counts": {kind: sum(record["kind"] == kind for record in records) for kind in KINDS},
        "sha256": hashlib.sha256(source.encode()).hexdigest(), "python": platform.python_version(),
    })
    print("| Run | Records | Questions | Correct | Correct with sources | Stale answers |")
    print("|---|---:|---:|---:|---:|---:|")
    if args.self_check:
        predictions = [{"id": row["id"], "answer": row["answers"][0], "citations": row["required_citations"]} for row in questions]
        result = score(records, questions, predictions)
        total = len(questions)
        assert result == {"correct": total, "cited_correctly": total, "stale": 0, "correct_strict": total}
        wrong = json.loads(json.dumps(predictions))
        wrong[0]["answer"] = questions[0]["stale_answers"][0]
        wrong[1]["citations"] = ["made-up-source"]
        wrong[4]["answer"] = "1000"
        wrong[3]["answer"] = f"The {questions[3]['answers'][0]}"
        assert score(records, questions, wrong) == {"correct": len(questions) - 2, "cited_correctly": len(questions) - 3, "stale": 1,
                                                    "correct_strict": len(questions) - 3}
        print(f"| Harness self-check (oracle answers) | {rows} | {total} | {total} | {total} | 0 |")
        write_json(args.output / "self-check.json", result)
    if args.predictions:
        result = score(records, questions, json.loads(args.predictions.read_text()))
        write_json(args.output / "scores.json", {"engine": args.engine, **result})
        print(f"| {args.engine.replace('|', '/')} | {rows} | {len(questions)} | {result['correct']} | {result['cited_correctly']} | {result['stale']} |")
    else:
        for engine in ["Memo", "Hindsight", "Graphiti", "Cognee"]:
            print(f"| {engine} (not run) | {rows} | {len(questions)} | — | — | — |")


if __name__ == "__main__":
    main()
