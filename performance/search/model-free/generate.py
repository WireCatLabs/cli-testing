"""Build the topic-template fixture for the model-free question-search experiment."""
import json
from pathlib import Path

names = {'calibration': [('iris',False),('flint',False),('tundra',False),('cove',False),('липа',True),('агат',True),('тайга',True),('зима',True)],
         'holdout': [('canyon',False),('brook',False),('mist',False),('dune',False),('опал',True),('ива',True),('озеро',True),('ветер',True)]}
messages,queries,chats=[],[],[]
next_id=90000

def add(chat,text,sender='702',parent=None,day=8):
    global next_id
    next_id+=1
    m=dict(id=str(next_id),chatId=chat,senderId=sender,text=text,timestamp=f'2026-10-{day:02d}T12:00:00.000Z')
    if parent: m['replyToId']=parent
    messages.append(m)
    return m['id']

for split,families in names.items():
    for name,ru in families:
        chat=str(301+len(chats));chats.append(dict(id=chat,title=f'Synthetic robustness {name}'))
        day_count=14+len(chats);amount=180+len(chats)*7;build=40+len(chats)
        cases=[('clean','refund amount','сумма возврата'),('negated-decision','log retention','хранение логов'),
               ('conditional-approval','production access','доступ на сервер'),('superseded','service build','сборка сервиса'),
               ('terse-reply','export schedule','расписание выгрузки'),('changed-owner','incident contact','контакт инцидента'),
               ('unresolved-conflict','storage region','регион хранения')]
        case_records={}
        for case,en,rus in cases:
            anchor=f'{name} {rus if ru else en}'
            if case=='clean':
                answer=f'{anchor}: покупателю перечислено {amount} евро.' if ru else f'{anchor}: the buyer received {amount} euros.'
                support=f'{anchor}: подтверждение перевода сохранено.' if ru else f'{anchor}: the transfer receipt is filed.'
                question=f'Сколько евро вернули по {anchor}?' if ru else f'How many euros were returned for {anchor}?'
            elif case=='negated-decision':
                answer=f'{anchor}: не хранить исходные логи дольше {day_count} дней; после этого они удаляются.' if ru else f'{anchor}: we will not keep raw logs beyond {day_count} days; they are deleted then.'
                support=f'{anchor}: ежедневная очистка проверена.' if ru else f'{anchor}: daily cleanup was tested.'
                question=f'Через сколько дней удаляются логи по {anchor}?' if ru else f'After how many days are logs deleted under {anchor}?'
            elif case=='conditional-approval':
                answer=f'{anchor}: сейчас вход разрешён только дежурным инженерам.' if ru else f'{anchor}: access currently belongs only to on-call engineers.'
                support=f'{anchor}: список дежурных обновлён.' if ru else f'{anchor}: the on-call roster has been updated.'
                question=f'Кому сейчас разрешён {anchor}?' if ru else f'Who currently has {anchor}?'
            elif case=='superseded':
                answer=f'{anchor}: прямо сейчас работает версия {build}, предыдущая заменена.' if ru else f'{anchor}: the live service now runs version {build}, replacing the previous build.'
                support=f'{anchor}: проверка рабочей версии завершена.' if ru else f'{anchor}: the live-version check has completed.'
                question=f'Какая версия сейчас работает по {anchor}?' if ru else f'Which version is live now for {anchor}?'
            elif case=='terse-reply':
                support=f'{anchor}: во сколько должна идти ежедневная выгрузка?' if ru else f'{anchor}: what time should the daily export run?'
                parent=add(chat,support,'701')
                answer='Каждый день в 09:30.' if ru else 'Every day at 09:30.'
                gold=add(chat,answer,'700',parent)
                question=f'Во сколько идёт {anchor}?' if ru else f'What time does {anchor} run?'
            elif case=='changed-owner':
                answer=f'{anchor}: теперь обращаться к Миле, очередь передана ей.' if ru else f'{anchor}: contact Lena now; the queue has been handed to her.'
                support=f'{anchor}: передача очереди завершена.' if ru else f'{anchor}: the queue handover is complete.'
                question=f'К кому теперь обращаться по {anchor}?' if ru else f'Who should we contact now for {anchor}?'
            else:
                answer=f'{anchor}: один действующий документ указывает Париж.' if ru else f'{anchor}: one active document says Paris.'
                support=f'{anchor}: другой действующий документ указывает Дублин; расхождение пока не разрешено.' if ru else f'{anchor}: another active document says Dublin; the discrepancy remains unresolved.'
                question=f'Какой окончательный {anchor} после устранения расхождения?' if ru else f'What is the final {anchor} after resolving the discrepancy?'
            if case!='terse-reply':
                gold=add(chat,answer,'700');parent=add(chat,support,'701')
            relevant={gold:1,parent:1} if case=='unresolved-conflict' else {gold:2,parent:1}
            case_records[case]=(anchor,gold,parent,relevant)
            for j in range(60):
                if case=='conditional-approval':
                    text=(f'{anchor}: решение согласовано только если комитет подпишет заявку; комитет ещё не рассмотрел её.' if ru else f'{anchor}: decision approved only if the committee signs; the committee has yet to review it.')
                elif case=='superseded':
                    text=(f'{anchor}: установлен вариант 13; это архивная цитата прежнего рабочего состояния.' if ru else f'{anchor}: decision approved for version 13; this is an archived quotation of an earlier live state.')
                elif case=='changed-owner':
                    text=(f'{anchor}: владелец Ира, как указано в старой инструкции до передачи очереди.' if ru else f'{anchor}: owner Mira, as written in the old instructions before the handover.')
                elif case=='unresolved-conflict':
                    text=(f'{anchor}: установлен и проверен Париж; цитата из одного документа, окончательного решения ещё нет.' if ru else f'{anchor}: decision approved for Paris; quotation from one document, final reconciliation is pending.')
                else:
                    text=(f'{anchor}: согласован пункт обсуждения, содержание ожидает заполнения.' if ru else f'{anchor}: decision approved for the discussion heading; its content awaits completion.')
                add(chat,text+f' [{j}]')
            for group,text in [('keyword',anchor),('question-diagnostic',question)]:
                queries.append(dict(id=f'{split}-{name}-{case}-{group}',split=split,topic=name,language='ru' if ru else 'en',
                                    category=case,group=group,text=text,retrieval=f'{anchor} chat:{chat}',scope=f'chat:{chat}',
                                    relevant=relevant,answerExpected=case!='unresolved-conflict'))
        anchor,_,_,_=case_records['clean']
        question=f'Кто внешний аудитор по {anchor}?' if ru else f'Who is the external auditor for {anchor}?'
        for group,text in [('keyword',f'{anchor} auditor'),('question-diagnostic',question)]:
            retrieval=f'{anchor} auditor chat:{chat}' if group=='keyword' else f'{anchor} chat:{chat}'
            queries.append(dict(id=f'{split}-{name}-missing-fact-{group}',split=split,topic=name,language='ru' if ru else 'en',
                                category='missing-fact',group=group,text=text,retrieval=retrieval,scope=f'chat:{chat}',relevant={},answerExpected=False))
        # Scope probes are intentionally labelled only within the explicit sender/date scope.
        anchor,gold,parent,relevant=case_records['terse-reply']
        for suffix,scope in [('sender','from:700'),('date','date:2026-10-09')]:
            eligible={gold:2} if suffix=='sender' else {}
            queries.append(dict(id=f'{split}-{name}-thread-scope-{suffix}',split=split,topic=name,language='ru' if ru else 'en',
                                category=f'thread-scope-{suffix}',group='scope-control',text=anchor,
                                retrieval=f'{anchor} chat:{chat} {scope}',scope=f'chat:{chat} {scope}',
                                relevant=eligible,answerExpected=bool(eligible)))
for q in queries:
    q.pop('retrieval')
    if q['category']=='clean' and q['group']=='question-diagnostic' and q['language']=='en':
        q['text']=q['text'].replace('returned', 'refunded')
    if q['category']=='negated-decision' and q['group']=='question-diagnostic' and q['language']=='en':
        q['text']=f"How many days are logs kept for {q['topic']} log retention?"
    if q['category']=='negated-decision' and q['group']=='question-diagnostic' and q['language']=='ru':
        q['text']=f"Сколько дней хранятся логи по {q['topic']} хранение логов?"
    if q['category']=='conditional-approval' and q['group']=='question-diagnostic' and q['language']=='ru':
        q['text']=f"Кому сейчас разрешён {q['topic']} доступ на сервер?"
# Genuine paraphrases are evaluated without adding rules after their results are seen.
for q in list(queries):
    if q['category']=='negated-decision' and q['group']=='question-diagnostic':
        text=f"What is the log lifetime for {q['topic']}?" if q['language']=='en' else f"Какой срок хранения логов по {q['topic']}?"
        queries.append({**q,'id':q['id']+'-paraphrase','category':'paraphrase','text':text})
# Qualifiers are absent content, not removable question scaffolding.
for q in list(queries):
    if q['category']=='superseded' and q['group']=='question-diagnostic':
        queries.append({**q,'id':q['id']+'-qualifier','category':'unknown-qualifier',
                        'text':q['text'].replace('?', ' ultraviolet?'),'relevant':{},'answerExpected':False})
for q in queries:
    if q['group']=='question-diagnostic': q['group']='question'
Path(__file__).with_name('fixture.json').write_text(json.dumps(dict(chats=chats,messages=messages,queries=queries),ensure_ascii=False,indent=2)+'\n')
