"""New authored examples; no topic substitutions or copied prior distractor templates."""
import json
from pathlib import Path

cases = [
('helix', 'en', 'retention',
 ['How long are Helix logs kept?', 'What is the log lifetime for Helix?'],
 [('Helix log retention: raw events expire after 21 days. This policy is active.',2),
  ('Helix log lifetime review: the meeting agenda has no duration yet.',0),
  ('We rejected the proposed 90-day Helix log retention period.',1),
  ('Helix logs kept for testing are synthetic and unrelated to the production policy.',0),
  ('Helix log retention cleanup passed the daily verification.',1)]),
('quartz', 'en', 'conditional',
 ['Who has Quartz production access?', 'Who can enter Quartz production?'],
 [('Quartz production access is restricted to the incident commander today.',2),
  ('Quartz production access for contractors was proposed, but approval is still pending.',1),
  ('Who has Quartz production access? Add this question to the review agenda.',0),
  ('Quartz production access onboarding guide: permissions section is empty.',0),
  ('The Quartz production incident commander is Nia; she is on duty.',1)]),
('rivet', 'en', 'superseded',
 ['Which Rivet service build is current?', 'What version does Rivet run now?'],
 [('Rivet service build 72 is now live, replacing build 68.',2),
  ('Rivet service build 68 was live last week; this status is obsolete.',0),
  ('Which Rivet service build is current? The release checklist needs that answer.',0),
  ('Rivet build 73 failed staging and has not been deployed.',1),
  ('Rivet version 72 passed the live health check.',1)]),
('atlas', 'en', 'terse-reply',
 ['What time does Atlas export run?', 'When is the Atlas daily export?'],
 [('Atlas export: what time should the daily export run?',1),
  ('At 06:45 UTC every morning.',2),
  ('Atlas export schedule review: decide the time next meeting.',0),
  ('Atlas daily export incident: yesterday the job ran late.',1),
  ('Atlas export run guide contains no schedule.',0)]),
('beacon', 'en', 'unresolved-conflict',
 ['Where is Beacon storage located?', 'What is the final Beacon storage region?'],
 [('Beacon storage region is Warsaw according to the active infrastructure record.',1),
  ('Beacon storage region is Prague according to the active billing record; neither record has been reconciled.',1),
  ('Beacon storage region review agenda: no final decision recorded.',0),
  ('Where is Beacon storage located? The onboarding template repeats the question.',0)]),
('finch', 'en', 'missing-fact',
 ['Who is the external auditor for Finch?', 'What is the Finch audit fee?'],
 [('Finch audit planning begins next month; no external auditor has been selected.',1),
  ('Finch audit fee is not quoted and no contract exists.',1),
  ('Finch engineering budget: 300 euros for internal test equipment.',0),
  ('Finch audit checklist: auditor name and fee are blank.',1)]),
('кедр', 'ru', 'retention',
 ['Сколько дней хранятся логи Кедр?', 'Какой срок хранения логов Кедр?'],
 [('Кедр: хранение логов ограничено 12 днями, затем они удаляются автоматически.',2),
  ('Кедр: срок хранения логов — вопрос для повестки, ответа в ней нет.',0),
  ('Кедр: хранить логи 60 дней предлагали, но предложение отклонили.',1),
  ('Кедр: проверка удаления логов завершена успешно.',1),
  ('Кедр: логи тестового стенда не описывают рабочую политику.',0)]),
('сокол', 'ru', 'conditional',
 ['Кому разрешён доступ на сервер Сокол?', 'Кто может войти на сервер Сокол?'],
 [('Сокол: доступ на сервер сейчас есть только у дежурного администратора.',2),
  ('Сокол: доступ на сервер подрядчикам дадут после подписания договора; договор не подписан.',1),
  ('Сокол: кому разрешён доступ на сервер — поле формы пока пустое.',0),
  ('Сокол: дежурный администратор сегодня Олег.',1)]),
('парус', 'ru', 'superseded',
 ['Какая сборка сервиса Парус работает сейчас?', 'Какая версия Парус сейчас в работе?'],
 [('Парус: сборка сервиса 84 работает сейчас вместо прежней сборки 79.',2),
  ('Парус: сборка сервиса 79 работала раньше; запись больше не актуальна.',0),
  ('Парус: какая сборка сервиса работает сейчас — вопрос из старой анкеты.',0),
  ('Парус: версия 85 ещё тестируется и не установлена.',1)]),
('маяк', 'ru', 'terse-reply',
 ['Во сколько идёт выгрузка Маяк?', 'Когда ежедневная выгрузка Маяк?'],
 [('Маяк: во сколько должна идти ежедневная выгрузка?',1),
  ('Каждый день в 17:20 по Москве.',2),
  ('Маяк: расписание выгрузки нужно обсудить, тут нет времени запуска.',0),
  ('Маяк: вчера ежедневная выгрузка закончилась с ошибкой.',1)]),
('гранит', 'ru', 'unresolved-conflict',
 ['Где хранение данных Гранит?', 'Какой окончательный регион хранения Гранит?'],
 [('Гранит: регион хранения в рабочей карточке указан как Берлин.',1),
  ('Гранит: другой действующий документ указывает Вену; противоречие не устранено.',1),
  ('Гранит: окончательный регион хранения — пустой пункт плана обсуждения.',0),
  ('Гранит: где хранение данных — заголовок раздела без ответа.',0)]),
('ручей', 'ru', 'missing-fact',
 ['Кто внешний аудитор Ручей?', 'Сколько стоит аудит Ручей?'],
 [('Ручей: внешний аудитор ещё не выбран.',1),
  ('Ручей: стоимость аудита не согласована и договор отсутствует.',1),
  ('Ручей: внутреннее тестирование стоило 900 рублей; это не аудит.',0),
  ('Ручей: аудит — форма без имени исполнителя и цены.',1)]),
]
messages=[];queries=[];chats=[];counter=200000
for n,(name,lang,category,questions,docs) in enumerate(cases):
 chat=str(501+n);chats.append(dict(id=chat,title=f'Synthetic fresh {name}'))
 ids=[]
 for text,grade in docs:
  counter+=1;ids.append(str(counter))
  m=dict(id=str(counter),chatId=chat,senderId='700',timestamp='2026-10-08T12:00:00.000Z',text=text)
  if category=='terse-reply' and grade==2:m['replyToId']=ids[0]
  messages.append(m)
 relevant={id:grade for id,(_,grade) in zip(ids,docs) if grade}
 for i,q in enumerate(questions):
  queries.append(dict(id=f'fresh-{name}-{i}',split='holdout',group='question',language=lang,category=category,text=q,scope=f'chat:{chat}',relevant=relevant,answerExpected=any(g==2 for _,g in docs)))
 # Archive background is deliberately unrelated; meaningful distractors above are individually authored.
 for i in range(24):
  counter+=1;messages.append(dict(id=str(counter),chatId=chat,senderId='702',timestamp='2026-10-07T12:00:00.000Z',text=f'Inventory receipt {n*24+i}: synthetic office supplies delivered.'))
p=Path(__file__).with_name('fresh.json');p.write_text(json.dumps(dict(chats=chats,messages=messages,queries=queries),ensure_ascii=False,indent=2)+'\n')
print(f'{len(messages)} messages, {len(queries)} questions written to {p}')
