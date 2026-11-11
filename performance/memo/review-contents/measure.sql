.headers on
.mode list
.separator " | "
SELECT count(*) AS documents, sum(deleted_at IS NOT NULL) AS documents_deleted FROM documents;
.print
.print ## proposals by kind and status
SELECT kind, status, proposed_by_type, count(*) AS n FROM proposed_actions GROUP BY 1,2,3 ORDER BY 1,2,3;
.print
.print ## relationship proposals by role group
SELECT CASE WHEN json_extract(p.payload,'$.role') IN ('owner','last-editor') THEN json_extract(p.payload,'$.role')
            WHEN json_extract(p.payload,'$.role') IS NULL THEN '(none)' ELSE '(other)' END AS role,
  substr(p.target_type,1,20) AS from_type,
  p.status, p.proposed_by_type, b.kind AS bot_kind, p.decided_by_type,
  json_extract(p.payload,'$.score') IS NOT NULL AS scored, count(*) AS n
FROM proposed_actions p LEFT JOIN bots b ON p.proposed_by_type='bot' AND b.id=p.proposed_by_id
WHERE p.kind='relationship' GROUP BY 1,2,3,4,5,6,7 ORDER BY 1,2,3;
.print
.print ## relationship proposals by scorer
SELECT json_extract(s.value,'$.scorer') AS scorer, p.status, count(*) AS n
FROM proposed_actions p, json_each(p.payload,'$.signals') s WHERE p.kind='relationship' GROUP BY 1,2 ORDER BY 1,2;
.print
.print ## owner and last-editor proposals by decision day
SELECT json_extract(payload,'$.role') AS role, status, date(decided_at/1000,'unixepoch') AS decided, count(*) AS n
FROM proposed_actions WHERE kind='relationship' AND json_extract(payload,'$.role') IN ('owner','last-editor') GROUP BY 1,2,3 ORDER BY 3,1;
.print
.print ## links from documents by role and standing
SELECT CASE WHEN role IN ('owner','last-editor','key') THEN role WHEN role IS NULL THEN '(none)' ELSE '(other)' END AS role,
  kind, source,
  CASE WHEN ends_at IS NOT NULL AND ends_at <= unixepoch()*1000 THEN 'ended' WHEN confirmed=1 THEN 'confirmed'
       WHEN deleted_at IS NOT NULL THEN 'ended' WHEN account_id IS NOT NULL THEN 'reported' ELSE 'proposed' END AS standing,
  substr(json_extract(metadata,'$.provenance'),1,instr(json_extract(metadata,'$.provenance')||':',':')-1) AS provenance,
  count(*) AS n
FROM links WHERE from_type='document' AND kind IN ('member-of','related-to','reports-to','customer-of','partner-of') AND to_id IS NOT NULL
GROUP BY 1,2,3,4,5 ORDER BY 1,4;
.print
.print ## proposed owner and last-editor links: is the document still there
SELECT l.role, d.deleted_at IS NOT NULL AS document_deleted, a.provider, count(*) AS n, count(DISTINCT l.from_id) AS documents
FROM links l JOIN documents d ON d.id=l.from_id LEFT JOIN accounts a ON a.id=d.account_id
WHERE l.from_type='document' AND l.role IN ('owner','last-editor') AND l.confirmed=0 AND l.account_id IS NULL AND l.deleted_at IS NULL
GROUP BY 1,2,3;
.print
.print ## every waiting link outside documents by end types
SELECT from_type, to_type, kind, source, count(*) AS n FROM links
WHERE from_type<>'document' AND confirmed=0 AND account_id IS NULL AND deleted_at IS NULL AND to_id IS NOT NULL
  AND kind IN ('member-of','related-to','reports-to','customer-of','partner-of') GROUP BY 1,2,3,4;
.print
.print ## reported links by end types
SELECT from_type, to_type, kind, count(*) AS n FROM links
WHERE confirmed=0 AND account_id IS NOT NULL AND deleted_at IS NULL AND to_id IS NOT NULL GROUP BY 1,2,3;
.print
.print ## findings parts by kind and batch status
SELECT p.kind AS batch, json_extract(f.value,'$.kind') AS finding, p.status, count(*) AS n
FROM proposed_actions p, json_each(p.payload,'$.findings') f
WHERE p.kind IN ('mail_findings','evidence_findings','meeting_findings') GROUP BY 1,2,3 ORDER BY 1,2,3;
.print
.print ## decided findings by outcome
SELECT p.kind AS batch, json_extract(f.value,'$.kind') AS finding, json_extract(i.value,'$.status') AS outcome, count(*) AS n
FROM proposed_actions p, json_each(p.payload,'$.findings') f, json_each(p.result,'$.items') i
WHERE p.kind IN ('mail_findings','evidence_findings','meeting_findings')
  AND json_extract(i.value,'$.id')=json_extract(f.value,'$.id') GROUP BY 1,2,3 ORDER BY 1,2,3;
.print
.print ## memories
SELECT m.kind, m.status, m.author_type, b.kind AS bot_kind, count(*) AS n FROM memories m
LEFT JOIN bots b ON m.author_type='bot' AND b.id=m.author_id WHERE m.deleted_at IS NULL GROUP BY 1,2,3,4 ORDER BY 1,2;
.print
.print ## facts
SELECT f.type, f.status, f.author_type, b.kind AS bot_kind, f.source, count(*) AS n FROM facts f
LEFT JOIN bots b ON f.author_type='bot' AND b.id=f.author_id WHERE f.deleted_at IS NULL GROUP BY 1,2,3,4,5 ORDER BY 1,2;
.print
.print ## task closes waiting
SELECT count(*) AS waiting_closes FROM tasks WHERE close_suggested_at IS NOT NULL;
