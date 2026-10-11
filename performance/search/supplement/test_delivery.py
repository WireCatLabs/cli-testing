"""Check byte accounting and evidence loss independently of measured model scores."""
import math
import unittest
from validate import deliver, encoded, metrics, supplement_order


class DeliveryTests(unittest.TestCase):
    def test_utf8_budget_counts_json_and_stops_without_clipping(self):
        docs = {'a': {'text': 'Кедр'}, 'b': {'text': 'x' * 100}, 'c': {'text': 'short'}}
        exact = len(encoded([dict(id='a', text='Кедр')]))
        self.assertEqual(deliver(['a', 'b', 'c'], docs, exact), (['a'], exact))
        self.assertEqual(deliver(['a'], docs, exact - 1), ([], 2))
        self.assertGreater(exact, len('[{"id":"a","text":"Кедр"}]'))

    def test_preserving_ten_does_not_protect_evidence_at_eleven(self):
        pool = [str(i) for i in range(14)]
        q = dict(relevant={'10': 2, '11': 1})
        new = supplement_order(pool, ['12', '13', '10'], 'en', stable=True)
        self.assertEqual(new[:10], pool[:10])
        self.assertEqual(metrics(pool[:12], q)['answer'], 1)
        self.assertEqual(metrics(new, q)['answer'], 0)
        self.assertEqual(metrics(new, q)['evidenceRecall'], 0)

    def test_stable_order_restores_answer_discount_and_russian_fallback(self):
        pool = [str(i) for i in range(14)]
        neural = ['11', '10', '13']
        q = dict(relevant={'10': 2, '11': 1})
        stable = supplement_order(pool, neural, 'en', stable=True)
        raw = supplement_order(pool, neural, 'en')
        self.assertEqual(stable, pool[:12])
        ideal = 3 + 1 / math.log2(3)
        self.assertAlmostEqual(metrics(stable, q)['ndcg'], (3 / math.log2(12) + 1 / math.log2(13)) / ideal)
        self.assertGreater(metrics(stable, q)['ndcg'], metrics(raw, q)['ndcg'])
        self.assertEqual(supplement_order(pool, ['13', '12'], 'ru', stable=True), pool[:12])

    def test_long_supplement_can_consume_budget_without_delivering_answer(self):
        pool = [str(i) for i in range(14)]
        docs = {mid: {'text': 'short'} for mid in pool}
        docs['12']['text'] = 'x' * 10000
        budget = deliver(pool, docs, None)[1]
        supplement = supplement_order(pool, ['12', '13'], 'en', stable=True)
        kept, used = deliver(supplement, docs, budget)
        self.assertEqual(kept, pool[:10])
        self.assertLessEqual(used, budget)
        self.assertEqual(metrics(kept, dict(relevant={'13': 2}))['answer'], 0)


if __name__ == '__main__':
    unittest.main()
