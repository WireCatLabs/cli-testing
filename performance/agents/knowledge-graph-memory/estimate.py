#!/usr/bin/env python3
"""Planning scenarios, not measured API usage. Rates checked 2026-10-24."""
import argparse

RATES = {"GPT-6 Luna": (0.10, 0.50), "GPT-6.1 Sol": (2.00, 10.00)}
SCENARIOS = {
    "Lean": {"calls": [1, 4, 1], "input": 1500, "output": 200, "answer_input": 4000, "answer_output": 800},
    "Higher overhead": {"calls": [3, 8, 3], "input": 3000, "output": 500, "answer_input": 8000, "answer_output": 2000},
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--records", type=int, default=2000)
    parser.add_argument("--questions", type=int, default=50)
    args = parser.parse_args()
    if args.records < 1 or args.questions < 1:
        parser.error("records and questions must be positive")
    print("| Scenario | Input tokens | Output tokens | GPT-6 Luna | GPT-6.1 Sol |")
    print("|---|---:|---:|---:|---:|")
    for name, scenario in SCENARIOS.items():
        calls = args.records * sum(scenario["calls"])
        answer_calls = 4 * args.questions
        inputs = calls * scenario["input"] + answer_calls * scenario["answer_input"]
        outputs = calls * scenario["output"] + answer_calls * scenario["answer_output"]
        costs = [f"${(inputs * rate_in + outputs * rate_out) / 1_000_000:.2f}" for rate_in, rate_out in RATES.values()]
        print(f"| {name} | {inputs:,} | {outputs:,} | {' | '.join(costs)} |")


if __name__ == "__main__":
    main()
