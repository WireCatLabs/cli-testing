import math
import unittest
from metrics import query_metrics

class MetricTests(unittest.TestCase):
    def test_support_is_not_actual_answer(self):
        m=query_metrics(['support','noise','answer'], {'answer':2,'support':1}, ['answer','support','noise'])
        self.assertEqual(m['recallAt10'],1)
        self.assertEqual(m['mrrAt10'],1)
        self.assertAlmostEqual(m['answerMrrAt10'],1/3)
        self.assertEqual(m['successAt1'],1)
        self.assertEqual(m['answerSuccessAt1'],0)
        self.assertEqual(m['answerSuccessAt3'],1)
        self.assertAlmostEqual(m['ndcgAt10'],(1+3/math.log2(4))/(3+1/math.log2(3)))

    def test_missing_evidence_and_single_gold(self):
        m=query_metrics(['support'], {'answer':2,'support':1}, ['support'])
        self.assertEqual(m['recallAt10'],.5)
        self.assertEqual(m['candidateRecall'],.5)
        self.assertEqual(m['answerCandidateSuccess'],0)
        m=query_metrics(['answer'], {'answer':2}, ['answer'])
        self.assertEqual(m['recallAt10'],1)
        self.assertEqual(m['ndcgAt10'],1)

    def test_cutoff_and_unanswerable_are_separate(self):
        m=query_metrics(['noise']*10+['answer'], {'answer':2}, ['answer','noise'])
        self.assertEqual(m['recallAt10'],0)
        self.assertEqual(m['answerSuccessAt10'],0)
        self.assertEqual(m['recallAt40'],1)
        m=query_metrics(['x','y'], {}, ['x','y'])
        self.assertFalse(m['answerable'])
        self.assertEqual(m['falseHits'],2)
        self.assertEqual(m['noAnswerHit'],1)

if __name__=='__main__': unittest.main()
