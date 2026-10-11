"""Freeze new synthetic wording and labels before inspecting ranking results."""
import hashlib
import json
from pathlib import Path

cases = [
('en','retention',['When do Juniper backups disappear?', 'How many days do we retain Juniper backups?'],[
 ('Juniper backup policy in force: snapshots are deleted on day 18.',2),
 ('When do Juniper backups disappear? This unanswered question was copied into the onboarding checklist.',0),
 ('Juniper backups: keeping snapshots for 180 days was suggested but rejected.',1),
 ('Juniper backup deletion finished successfully this morning.',1)]),
('en','conditional',['Can vendors connect to Nimbus now?', 'Who may connect to Nimbus production?'],[
 ('Nimbus production connections are currently allowed for employees only.',2),
 ('Nimbus vendors may connect after their contract is signed; none have signed yet.',1),
 ('Can vendors connect to Nimbus now? Please put this question on the agenda.',0),
 ('Nimbus production connection troubleshooting guide has no permissions information.',0)]),
('en','superseded',['Which package does Tern currently deploy?', 'What is the active Tern package version?'],[
 ('Tern package version 31 is deployed now. It replaces version 28.',2),
 ('Tern package version 28 is deployed: this old announcement has been superseded.',0),
 ('Tern package version 32 is a candidate awaiting approval.',1),
 ('What is the active Tern package version? The release form leaves this field blank.',0)]),
('en','terse-reply',['When is the Kestrel invoice batch sent?', 'What time is the Kestrel invoice batch?'],[
 ('Kestrel invoice batch: can you confirm the send time?',1),
 ('At 02:15 UTC, every weekday.',2),
 ('Kestrel invoice batch time is missing from the help page.',0),
 ('Kestrel invoice batch was delayed yesterday by an outage.',1)]),
('en','unresolved-conflict',['What is the agreed Linden data region?', 'Where is Linden data stored?'],[
 ('Linden data is stored in Dublin according to the current operations record.',1),
 ('The current legal record places Linden data in Oslo. We have not resolved this disagreement.',1),
 ('What is the agreed Linden data region? A heading without an answer.',0)]),
('en','missing-fact',['Who approved the Osprey license?', 'What is the Osprey license price?'],[
 ('Osprey license application is open; approver and price remain undecided.',1),
 ('Osprey license: approval and price fields are blank.',1),
 ('Osprey stationery cost 20 dollars. This expense is unrelated to software.',0)]),
('ru','retention',['Когда удаляются резервные копии Ива?', 'Сколько дней остаются резервные копии Ива?'],[
 ('Ива: резервные копии автоматически удаляются через 16 дней. Правило действует.',2),
 ('Когда удаляются резервные копии Ива? Вопрос из анкеты без ответа.',0),
 ('Ива: предлагали оставлять резервные копии на 120 дней, но отказались.',1),
 ('Ива: проверка удаления резервных копий прошла успешно.',1)]),
('ru','conditional',['Подрядчики могут подключиться к Лотос сейчас?', 'Кому доступно подключение к Лотос?'],[
 ('Лотос: подключение сейчас разрешено только сотрудникам.',2),
 ('Лотос: подрядчики получат подключение после согласования договора. Согласование ещё не состоялось.',1),
 ('Подрядчики могут подключиться к Лотос сейчас? Добавьте вопрос в повестку.',0),
 ('Лотос: инструкция по подключению не содержит списка разрешений.',0)]),
('ru','superseded',['Какой пакет выпускается для Осина сейчас?', 'Какая версия пакета Осина активна?'],[
 ('Осина: пакет версии 46 установлен сейчас, он заменил версию 41.',2),
 ('Осина: пакет версии 41 установлен — устаревшая запись, больше не действует.',0),
 ('Осина: пакет версии 47 пока ожидает согласования.',1),
 ('Какая версия пакета Осина активна? В форме оставлено пустое поле.',0)]),
('ru','terse-reply',['Когда отправляется пакет счетов Берёза?', 'Во сколько отправляют счета Берёза?'],[
 ('Берёза: подтвердите время отправки пакета счетов.',1),
 ('В 09:40 по Москве, каждый рабочий день.',2),
 ('Берёза: время отправки счетов в справке отсутствует.',0),
 ('Берёза: вчера пакет счетов отправили с задержкой.',1)]),
('ru','unresolved-conflict',['Где размещены данные Верба?', 'Какой регион данных Верба согласован?'],[
 ('Верба: действующая карточка эксплуатации указывает регион данных Милан.',1),
 ('Верба: в действующем юридическом документе регион данных Мадрид. Противоречие пока не разрешено.',1),
 ('Какой регион данных Верба согласован? Заголовок анкеты без ответа.',0)]),
('ru','no-evidence',['Какой лимит проекта Клён?', 'Кто владелец проекта Клён?'],[
 ('Клён: проект создан, первый тест выполнен.',0),
 ('Клён: расписание встречи опубликовано.',0),
 ('Клён: приветственное сообщение команды.',0)]),
]
messages=[]
queries=[]
chats=[]
for n,(lang,category,questions,docs) in enumerate(cases):
 chat=str(650+n)
 chats.append(dict(id=chat,title=f'Synthetic frozen scenario {n}'))
 ids=[]
 for i,(text,grade) in enumerate(docs):
  mid=str(400000+n*100+i)
  ids.append(mid)
  message=dict(id=mid,chatId=chat,senderId='700',timestamp='2026-10-09T12:00:00.000Z',text=text)
  if category=='terse-reply' and grade==2:
   message['replyToId']=ids[0]
  messages.append(message)
 relevant={mid:grade for mid,(_,grade) in zip(ids,docs) if grade}
 for i,text in enumerate(questions):
  queries.append(dict(id=f'frozen-{n}-{i}',split='holdout',group='question',language=lang,category=category,text=text,relevant=relevant,answerExpected=any(g==2 for _,g in docs)))
 for i in range(20):
  messages.append(dict(id=str(400000+n*100+30+i),chatId=chat,senderId='702',timestamp='2026-10-07T12:00:00.000Z',text=f'Synthetic office receipt {n*20+i}: paper and pens delivered.'))
output=Path(__file__).with_name('ranking-frozen.json')
output.write_text(json.dumps(dict(provenance='Same agent authored questions and judgments; frozen before experiment results, not independently reviewed.',chats=chats,messages=messages,queries=queries),ensure_ascii=False,indent=2)+'\n')
print(hashlib.sha256(output.read_bytes()).hexdigest())
