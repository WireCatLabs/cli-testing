"""Deterministic unrelated chatter that reuses common project words, so candidate pools have to filter."""
import argparse
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--seed', type=int, required=True)
parser.add_argument('--units', type=int, default=1500)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
assert not args.output.exists(), 'refuse to overwrite'

CHATS = ['Общий', 'Кухня', 'random', 'hr', 'dev-help', 'Родительский чат 3Б', 'Бег по субботам', 'news', 'Дача', 'books']
PEOPLE = ['Лена', 'Игорь', 'Sam', 'Priya', 'Костя', 'Marta', 'Вера', 'Tom', 'Юля', 'Oscar', 'Наташа', 'Ben']
RU = [
    'Кто-нибудь знает хороший {thing} для {place}?', 'Я сегодня {doing}, буду позже.', 'Ссылка на {thing}: example.org/{n}',
    'Согласовали {thing} на {day}, но это не точно', 'Бюджет на {thing} опять урезали', 'Логи {thing} никто не читает 😅',
    'Запуск {thing} перенесли на {day}?', 'Оплату за {thing} внесла, чек в общем чате', 'Договор по {thing} подписали в {day}',
    'Сайт {place} опять лежит', 'Давайте обсудим {thing} на неделе', 'Дата {thing} — {day}, кто идёт?', 'Цены на {thing} выросли на {n}%',
    '+', 'ок', 'да, давай', 'спасибо!', 'не, я пас', 'а что решили?', 'Кто отвечает за {thing}?', 'Нет, не больше {n} человек',
]
EN = [
    'Anyone tried the new {thing} near {place}?', 'Running late, {doing}.', 'Approved the {thing} for {day}, I think',
    'Budget for {thing} is tight this quarter', 'Logs from {thing} are noisy again', 'Launch of {thing} moved to {day}?',
    'Deploy of {thing} failed, retrying', 'Cutover for {thing} is a myth lol', 'Retention policy for {thing}? no idea',
    'Paid the {thing} invoice, receipt in thread', 'Contract for {thing} signed on {day}', 'Price of {thing} went up {n}%',
    '+1', 'ok', 'sounds good', 'thanks!', 'nope', 'what did we decide?', 'Who owns {thing}?', 'No more than {n} days, please',
]
THINGS = ['кофемашина', 'парковка', 'отпуск', 'корпоратив', 'подписка', 'ремонт', 'бассейн', 'printer', 'standup',
          'offsite', 'newsletter', 'VPN', 'laptop', 'gym', 'pizza night', 'школьная экскурсия', 'забег', 'книжный клуб',
          'сайт школы', 'booking widget', 'backup', 'server room', 'CRM trial', 'onboarding']
PLACES = ['офиса', 'центра', 'Valencia', 'downtown', 'дачи', 'школы', 'the park', 'airport']
DOINGS = ['в пробке', 'у врача', 'at the dentist', 'on a call', 'забираю ребёнка', 'stuck in traffic']
DAYS = ['пятницу', 'понедельник', '12 октября', 'Monday', 'Friday', 'Oct 3', 'next week', 'конец месяца']

rng = random.Random(args.seed)
start = datetime(2026, 8, 15, 8, tzinfo=timezone.utc)
sources = [{'id': f'bg{args.seed}-c{i}', 'kind': 'chat', 'title': title} for i, title in enumerate(CHATS)]
clocks = {source['id']: start for source in sources}
units, last = [], {}
for n in range(args.units):
    source = rng.choice(sources)['id']
    clocks[source] += timedelta(minutes=rng.randint(3, 900))
    pool = RU if rng.random() < .55 else EN
    text = rng.choice(pool).format(thing=rng.choice(THINGS), place=rng.choice(PLACES), doing=rng.choice(DOINGS),
                                   day=rng.choice(DAYS), n=rng.choice([3, 5, 7, 14, 21, 30, 90]))
    unit = {'id': f'bg{args.seed}-{n}', 'source': source, 'author': rng.choice(PEOPLE),
            'at': clocks[source].strftime('%Y-%m-%dT%H:%M:%SZ'), 'text': text}
    if source in last and rng.random() < .25:
        unit['reply_to'] = last[source]
    last[source] = unit['id']
    units.append(unit)
units.sort(key=lambda unit: (unit['source'], unit['at']))
corpus = {'project': {'id': f'background-{args.seed}', 'name': 'Unrelated chatter', 'aliases': []},
          'sources': sources, 'units': units}
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(corpus, ensure_ascii=False, indent=1) + '\n')
print(json.dumps({'units': len(units), 'sources': len(sources)}))
