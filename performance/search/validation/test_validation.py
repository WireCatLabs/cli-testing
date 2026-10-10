"""Check recorded end-to-end scope, context and answer/evidence invariants."""
import hashlib
import json
from pathlib import Path
import unittest

root=Path(__file__).resolve().parent
raw=json.loads((root/'results/candidates.json').read_text())
context=json.loads((root/'results/reply-context-candidates.json').read_text())
report=json.loads((root/'results/report.json').read_text())
messages={m['id']:m for m in raw['messages']}

class ValidationTests(unittest.TestCase):
    def test_context_stays_inside_production_scope(self):
        for row in context['rows']:
            ids=[c['id'] for c in row['candidates']]
            self.assertLessEqual(len(ids),300)
            self.assertEqual(len(ids),len(set(ids)))
            self.assertTrue(set(ids)<=set(row['hardEligibleIds']))
            for mid in ids:
                parent=messages[mid].get('replyToId')
                if parent:
                    self.assertIn(parent,row['hardEligibleIds'])
                    self.assertEqual(messages[parent]['chatId'],messages[mid]['chatId'])

    def test_reply_evidence_is_recovered_without_filter_bypass(self):
        original={q['id']:q for q in raw['rows']}
        for row in context['rows']:
            before=original[row['id']]
            if row['category']=='terse-reply':
                answer=next(mid for mid,g in row['relevant'].items() if g==2)
                self.assertNotIn(answer,[c['id'] for c in before['candidates']])
                self.assertIn(answer,[c['id'] for c in row['candidates']])
            if row['group']=='scope-control' or not row['rerankable']:
                self.assertEqual(row['candidates'],before['candidates'])

    def test_unresolved_context_is_not_labelled_as_an_answer(self):
        for row in raw['rows']:
            if row['category']=='unresolved-conflict':
                self.assertFalse(row['answerExpected'])
                self.assertEqual(set(row['relevant'].values()),{1})
                self.assertEqual(len(row['relevant']),2)

    def test_source_and_weights_match_recorded_run(self):
        frozen=report['frozenInputs']
        for key,path in [('inputSha256',root/'results/candidates.json'),('modelSha256',root.parent/'matrix/results/pairwise.json'),
                         ('runnerSha256',root/'validate.py'),('featuresSha256',root/'features.py'),('fixtureSha256',root/'fixture.json')]:
            self.assertEqual(frozen[key],hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertEqual(raw['exporterSha256'],hashlib.sha256((root/'export.ts').read_bytes()).hexdigest())

if __name__=='__main__':unittest.main()
