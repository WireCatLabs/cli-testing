"""Generate the fresh, synthetic holdout before model fitting or evaluation."""
import json
from pathlib import Path

families = [
    ('quartz', 'deployment', 'restart', 'Quartz deployment restart: production uses build 42 after the health check passed.', 'Quartz deployment restart: Lena verified the running build.', 'deploymnt', 'deplo', 'which build is running', 'What build does Quartz use after the deployment restart?', False),
    ('willow', 'snapshot', 'expiry', 'Willow snapshot expiry: snapshots older than 21 days are now removed automatically.', 'Willow snapshot expiry: Theo tested the nightly cleanup.', 'snapsoht', 'snap', 'how long copies survive', 'How many days are snapshots kept under Willow snapshot expiry?', False),
    ('ember', 'purchase', 'rebate', 'Ember purchase rebate: 72 euros have been sent back to the buyer.', 'Ember purchase rebate: Sana confirmed receipt of the transfer.', 'purchsae', 'purch', 'money returned to buyer', 'How much money was returned for the Ember purchase rebate?', False),
    ('янтарь', 'релиз', 'перезапуск', 'Янтарь релиз перезапуск: в рабочей среде запущена сборка 42, проверка завершена.', 'Янтарь релиз перезапуск: Мила подтвердила работающую сборку.', 'рлеиз', 'рели', 'какая сборка работает', 'Какая сборка работает после Янтарь релиз перезапуск?', True),
    ('берег', 'резервирование', 'хранение', 'Берег резервирование хранение: копии старше 21 дня теперь удаляются автоматически.', 'Берег резервирование хранение: Олег проверил ночную очистку.', 'резервировние', 'резерв', 'срок жизни копий', 'Сколько дней хранятся копии по Берег резервирование хранение?', True),
    ('искра', 'покупка', 'возмещение', 'Искра покупка возмещение: покупателю уже перечислено 72 евро.', 'Искра покупка возмещение: Лада подтвердила получение перевода.', 'покпука', 'покуп', 'деньги вернули клиенту', 'Сколько евро вернули по Искра покупка возмещение?', True),
]
messages, queries, chats = [], [], []
next_id = 50000

def add(chat, sender, text, day=6):
    global next_id
    next_id += 1
    message = dict(id=str(next_id), chatId=chat, senderId=sender,
                   timestamp=f'2026-10-{day:02d}T12:00:00.000Z', text=text)
    messages.append(message)
    return message['id']

for i, (name, word, action, answer, support, typo, prefix, paraphrase, question, ru) in enumerate(families, 201):
    chat = str(i)
    chats.append(dict(id=chat, title=f'Synthetic fresh {name}'))
    a, b = add(chat, '700', answer, 5), add(chat, '701', support, 5)
    head = f'{name} {word} {action}'
    noise = ([f'{head}: тема для будущего разговора, итог пока неизвестен.',
              f'{head}: может быть стоит выбрать другое значение? Ждём обсуждения.',
              f'{head}: это учебный пример, он не описывает рабочую систему.',
              f'{head}: ранее утверждённый вариант отменён; сейчас ответа нет.',
              f'{head}: ответственный пока не назначен, сведения отсутствуют.',
              f'{head}: подтверждён только заголовок документа, а не его содержание.'] if ru else
             [f'{head}: discussion topic for next week; the outcome is still unknown.',
              f'{head}: could we choose a different value? Waiting for the meeting.',
              f'{head}: training example only; it does not describe the running system.',
              f'{head}: the previously approved option was cancelled; there is no current answer.',
              f'{head}: no owner has been assigned and the requested information is missing.',
              f'{head}: only the document heading was confirmed, not its contents.'])
    for j in range(240):
        add(chat, '702', noise[j % len(noise)] + f' [{j}]')
    variants = [('words', head), ('typo', f'{name} {typo} {action}'),
                ('beginnings', f'{name} {prefix} {action}'), ('phrase', f'"{head}"'),
                ('from', f'{name} {word} from:700'), ('chat', f'{name} {word} chat:{chat}'),
                ('date', f'{name} {word} date:2026-10-05'),
                ('and', f'{name} AND {word} AND {action}'), ('or', f'{name} {word} OR {action}'),
                ('paraphrase', f'{name} {paraphrase}'),
                ('no-answer-absent', f'{name} quantum unicorn'),
                ('no-answer-near-miss', f'{head} purple')]
    for category, text in variants:
        relevant = {} if category.startswith('no-answer') else ({a: 2} if category == 'from' else {a: 2, b: 1})
        queries.append(dict(id=f'fresh-{name}-{category}', split='fresh', group='keyword', topic=name,
                            language='ru' if ru else 'en', category=category, retrieval=text, text=text,
                            relevant=relevant))
    absent = f'Кто внешний аудитор по {head}?' if ru else f'Who is the external auditor for {head}?'
    for category, text, relevant in [('question-answer', question, {a: 2, b: 1}),
                                     ('question-missing-fact', absent, {})]:
        queries.append(dict(id=f'fresh-{name}-{category}', split='fresh', group='question-diagnostic',
                            topic=name, language='ru' if ru else 'en', category=category,
                            retrieval=head, text=text, relevant=relevant))
Path(__file__).with_name('fresh.json').write_text(json.dumps(dict(chats=chats, messages=messages, queries=queries), ensure_ascii=False, indent=2)+'\n')
