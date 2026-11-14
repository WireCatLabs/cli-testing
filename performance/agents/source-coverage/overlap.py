"""Checks that an indirect question shares no word stem with its answer.

Prints the words of 5+ letters of the question whose first 5 letters also occur in the context (the answer message
and a few messages around it). Only a chat title or a person's name should remain.
Usage: python3 overlap.py <question-file> <context-file>
"""

import re
import sys

WORD = r"[a-zа-яё]{5,}"
question, context = (open(path, encoding="utf-8").read().lower() for path in sys.argv[1:3])
stems = {word[:5] for word in re.findall(WORD, context)}
print(sorted({word for word in re.findall(WORD, question) if word[:5] in stems}))
