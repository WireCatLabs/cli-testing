"""Freeze synthetic supplement stress cases before scoring any candidates."""
import hashlib
import json
from pathlib import Path

cases = [
    ('en', 'retention', ['What is the Alder backup retention?', 'When are Alder backups removed?'], [
        ('Alder backup retention is fourteen days. Backups are removed automatically after that.', 2),
        ('Alder backup retention: restoration was checked using the current fourteen-day policy.', 1),
        ('Alder backup retention: ninety days was proposed and rejected.', 1)]),
    ('en', 'conditional', ['Can contractors access Quartz production?', 'Who can access Quartz production?'], [
        ('Quartz production access is currently limited to employees. Contractors have no access.', 2),
        ('Quartz production access: contractors would be allowed only after approval; approval is pending.', 1),
        ('Quartz production access: the rejected draft allowed contractors without approval.', 1)]),
    ('en', 'superseded', ['What is the current Finch package version?', 'Which Finch package is deployed?'], [
        ('Finch package version 73 is deployed now and replaces version 68.', 2),
        ('Finch package version 68 was deployed last month; this announcement is obsolete.', 0),
        ('Finch package version 74 is proposed, pending release approval.', 1)]),
    ('en', 'terse-reply', ['When is the Sable invoice batch sent?', 'What time is the Sable invoice batch?'], [
        ('Sable invoice batch: please confirm the send time.', 1),
        ('At 04:35 UTC on Tuesdays.', 2),
        ('Sable invoice batch: the old proposed send time of noon was rejected.', 1)]),
    ('en', 'unresolved-conflict', ['Where is Spruce customer data stored?', 'What is the Spruce customer data region?'], [
        ('Spruce customer data region: the current operations inventory says Warsaw.', 1),
        ('Spruce customer data region: the current legal inventory says Vienna. The discrepancy remains unresolved.', 1),
        ('Spruce customer data region: reconcile the two current inventories before answering.', 1)]),
    ('en', 'missing-fact', ['Who approved the Otter license?', 'What is the Otter license price?'], [
        ('Otter license approval and price are undecided. No approver or quoted price exists.', 1),
        ('Otter license: the approval and price form is empty.', 1),
        ('Otter license: an unrelated office receipt cost thirty dollars.', 0)]),
    ('en', 'long-evidence', ['How is the Acorn export encrypted?', 'What protects the Acorn export?'], [
        ('Acorn export encryption: AES-256-GCM protects the exported file. ' + 'The synthetic implementation record repeats its migration history. ' * 90, 2),
        ('Acorn export encryption: the audit confirms authenticated encryption and checks key rotation.', 1),
        ('Acorn export encryption: a plaintext draft was rejected.', 1)]),
    ('en', 'no-evidence', ['Who owns the Wren deployment?', 'What is the Wren deployment limit?'], [
        ('Wren deployment: the welcome meeting has been scheduled.', 0),
        ('Wren deployment: stationery was delivered.', 0),
        ('Wren deployment: the project logo was approved.', 0)]),
    ('ru', 'retention', ['Сколько дней хранятся копии Сосна?', 'Когда удаляют копии Сосна?'], [
        ('Сосна: копии хранятся двадцать дней, затем автоматически удаляются.', 2),
        ('Сосна: восстановление копии проверено по действующему правилу хранения.', 1),
        ('Сосна: хранить копии сто дней предлагали, но отказались.', 1)]),
    ('ru', 'conditional', ['Могут подрядчики подключиться к Рябина?', 'Кому разрешено подключение к Рябина?'], [
        ('Рябина: подключение сейчас разрешено только сотрудникам. Подрядчикам запрещено.', 2),
        ('Рябина: подрядчики смогут подключиться после согласования. Согласования ещё нет.', 1),
        ('Рябина: старый проект разрешений для подрядчиков отклонён.', 1)]),
    ('ru', 'unresolved-conflict', ['Где хранятся данные Кедр?', 'Какой регион данных Кедр?'], [
        ('Кедр: действующая карточка эксплуатации указывает регион данных Прага.', 1),
        ('Кедр: действующий юридический документ указывает регион данных Рига. Противоречие не разрешено.', 1)]),
    ('ru', 'no-evidence', ['Кто владелец проекта Пихта?', 'Какой лимит проекта Пихта?'], [
        ('Пихта: приветственная встреча назначена.', 0),
        ('Пихта: опубликована новая эмблема.', 0)]),
]
messages, queries, chats = [], [], []
for n, (language, category, questions, docs) in enumerate(cases):
    chat = str(880 + n)
    chats.append(dict(id=chat, title=f'Synthetic supplement scenario {n}'))
    relevant = {}
    for i, (text, grade) in enumerate(docs):
        mid = str(800000 + n * 1000 + i)
        m = dict(id=mid, chatId=chat, senderId='900', timestamp='2026-10-10T12:00:00.000Z', text=text)
        if category == 'terse-reply' and grade == 2:
            m['replyToId'] = str(800000 + n * 1000)
        messages.append(m)
        if grade:
            relevant[mid] = grade
    for i in range(64):
        heading = questions[i % len(questions)]
        text = (heading + ' Agenda heading only; no decision or answer has been recorded.' if language == 'en'
                else heading + ' Заголовок повестки без ответа и решения.')
        if i % 16 == 0:
            text += ' Synthetic unrelated migration checklist. ' * 120
        messages.append(dict(id=str(800000 + n * 1000 + 100 + i), chatId=chat, senderId='901', timestamp='2026-10-08T12:00:00.000Z', text=text + f' [{i}]'))
    for i, text in enumerate(questions):
        queries.append(dict(id=f'supplement-{n}-{i}', group='question', split='holdout', language=language,
                            category=category, text=text, relevant=relevant,
                            answerExpected=any(g == 2 for _, g in docs)))
output = Path(__file__).with_name('fixture.json')
output.write_text(json.dumps(dict(provenance='Same agent authored wording and labels before scoring; synthetic stress test, not independent human certification.', chats=chats, messages=messages, queries=queries), ensure_ascii=False, indent=2) + '\n')
print(hashlib.sha256(output.read_bytes()).hexdigest())
