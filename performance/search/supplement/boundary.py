"""Freeze targeted displacement and byte-boundary cases after the broad stress run."""
import hashlib
import json
from pathlib import Path

messages, queries, chats = [], [], []
for n, count in enumerate([8, 9, 10, 11]):
    name = ['Beacon', 'Harbor', 'Meadow', 'Plover'][n]
    chat = str(950 + n)
    chats.append(dict(id=chat, title=f'Synthetic boundary scenario {n}'))
    stem = f'{name} log retention'
    docs = [(stem + ': daily cleanup was tested.', 1)]
    docs += [(stem + f': decision approved for the discussion heading; its content awaits completion. [{i}]', 0) for i in range(count)]
    docs += [(stem + ': we will not keep raw logs beyond twenty-three days; they are deleted then.', 2),
             (stem + ': the current legal record requires sixty days, contradicting the operations policy. The conflict remains unresolved.', 1)]
    relevant = {}
    for i, (text, grade) in enumerate(docs):
        mid = str(900000 + n * 100 + i)
        messages.append(dict(id=mid, chatId=chat, senderId='950', timestamp='2026-10-10T12:00:00.000Z', text=text))
        if grade:
            relevant[mid] = grade
    queries.append(dict(id=f'boundary-{n}', group='question', split='holdout', language='en', category='unresolved-conflict',
                        text=f'What is the log lifetime for {name}?', relevant=relevant, answerExpected=True))
chats.append(dict(id='959', title='Synthetic boundary reply probe'))
messages.extend([dict(id='909000', chatId='959', senderId='950', timestamp='2026-10-10T12:00:00.000Z', text='Pipit invoice batch: please confirm the time.'), dict(id='909001', chatId='959', senderId='950', timestamp='2026-10-10T12:01:00.000Z', text='At 05:20 UTC.', replyToId='909000')])
queries.append(dict(id='boundary-probe', group='question', split='holdout', language='en', category='terse-reply', text='When is the Pipit invoice batch?', relevant={'909000': 1, '909001': 2}, answerExpected=True))
output = Path(__file__).with_name('boundary.json')
output.write_text(json.dumps(dict(provenance='Targeted adversarial wording based on an exposed prior ranking failure; labels frozen before this run, not independent certification.', chats=chats, messages=messages, queries=queries), indent=2) + '\n')
print(hashlib.sha256(output.read_bytes()).hexdigest())
