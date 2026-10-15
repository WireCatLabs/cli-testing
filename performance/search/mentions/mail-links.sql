-- Totals of mail link mentions on a copy of a store; run with sqlite3 <copy.db> < mail-links.sql.
SELECT 'mail url rows', count(*), 'distinct', count(DISTINCT value), 'value bytes', sum(length(value))
  FROM mentions WHERE source_type = 'email' AND kind = 'url';
SELECT 'letters with a link', count(DISTINCT source_id), 'sites', count(DISTINCT domain)
  FROM mentions WHERE source_type = 'email' AND kind = 'url';
SELECT 'message url rows', count(*) FROM mentions WHERE source_type IN ('message', 'attachment') AND kind = 'url';
SELECT 'mentions table and indexes, bytes', sum(pgsize) FROM dbstat WHERE name LIKE '%mentions%';
