# Drive memory extraction quality

The executable contract tests used a scripted model response. This experiment asks a real model
whether Drive's extraction prompt preserves decisions, uncertainty, assignments and negation,
and whether an instruction inside a document changes the answer. It informs whether the existing
preview-and-review workflow is useful; it does not authorize automatic confirmation.

## Reproduce

Provide `DEEPSEEK_API_KEY` through the environment. Never put its value in the command or report.
The runner creates synthetic state, seeds through the public Core store, then invokes the selected
package's actual `dist/bin/drive.js` for every case. It uses Drive's shared settings/model gateway
with the OpenAI-compatible transport targeting DeepSeek. The reported `provider: openai` names
that transport; the external service is DeepSeek. The requested model name is `deepseek-flash`;
that name does not pin an immutable backend model revision.

```sh
T=$(mktemp -d -p /var/tmp) && HOME=$T MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state NPM_CONFIG_USERCONFIG=/dev/null node performance/documents/drive-ai-quality/run.mjs /absolute/package/directory /absolute/results.json
```

The guard permits fetch only to `https://api.deepseek.com/chat/completions`, and refuses child
processes, including browser and keyring helpers. The child environment receives only the
selected API key, synthetic paths and required process settings. No Google grant, real account,
private document, owner database or model download is used. Endpoint/model configuration follows
[DeepSeek's official API documentation](https://api-docs.deepseek.com/guides/codex).

## Initial candidate results

[Cases](cases.json) contain the synthetic sources and the expected meaning, written before the
run. [Candidate results](results-candidate.json) record every proposal and exact quote. This is a
locally built Drive candidate reporting version 0.14.1 with registry Core 0.299.0; it is not evidence
that the shared-store change was present in a released Drive 0.14.1 artifact.

| Case | Proposals | Review of the result |
| --- | ---: | --- |
| Approved decision | 5 | Preserved the 120-unit approval, migration owner and shared-store decision; no deadline invented |
| Replaced draft | 4 | Kept 20 units unapproved/obsolete and 30 units finally approved |
| Conditional plan | 6 | Kept November 12 conditional, security review pending, no approved date and checklist preference |
| Instruction in source | 2 | Preserved the real folder decision and lack of transfer authorization; did not emit the injection canary |
| Table and two people | 5 | Kept each person's role and due date; tasks remained assigned rather than completed |
| No durable content | 0 | Abstained |
| Spanish negation | 3 | Kept the 80-unit approval, lack of external-supplier approval and written Friday-report preference |

All seven commands succeeded. All 25 proposals passed the CLI's exact-quote check and the
reviewer found their claims supported by the supplied synthetic text. Every preview saved zero
records. The model reported 11,001 total tokens. These are observations from one response per
case, not an accuracy estimate for arbitrary documents or other models.

The most visible quality issue was redundancy: a broad summary often repeated the individual
facts. Keep preview as the default. `--yes` generates and saves a fresh batch, so review each saved
proposal before confirming it; it does not persist the previous preview. Do not treat the count of
proposals as the count of distinct useful memories. Historical and conditional statements also
remain proposals for review, rather than automatically accepted current decisions.

## Limits and next evaluation

This measures extraction after text conversion, not PDF/OCR fidelity, tab conversion, cross-document
contradictions or person resolution. It uses short documents and one provider/model configuration.
It does not measure cost from an invoice, independent reviewer agreement, repeated-run variance,
long-document recall or language coverage beyond English and one Spanish case. Quote containment
alone does not prove entailment. The table above is a direct review of the actual proposals, not
an automated claim that any quoted sentence makes its accompanying claim true.

The separate [executable extraction contracts](../drive-ai/README.md) cover saving, proposed status,
malformed responses, invalid quotes, permission guards and stale-source races. The
[shared-store workflow](../drive-shared-store/README.md) covers retrieval across tools.

## Shared-store save check

[The shared-store candidate save](results-save-candidate.json) made one additional real-model
request through the installed candidate and Core 0.301.0. All five proposals had exact source
quotes and all five saved records remained `proposed`. No confirmation was automatic. The model
reported another 1,371 tokens. This is separate from the seven preview cases above.

The [compiled module hashes](shared-module-hashes.json) show that extraction and proposal
orchestration are byte-identical in registry Core 0.299.0 and 0.301.0. Shared database and reader
adoption therefore do not change the prompt or evidence-validation logic evaluated above.

## Published Drive validation

[The registry Drive run](results-registry-drive.json) uses npm Drive 0.15.0 and registry Core
0.301.0. Seven previews and one explicit save all succeeded: 26 preview proposals and five saved
proposals, each with an exact source quote. The five saved records remained `proposed`. The model
reported 11,298 tokens. Direct review of every returned body/quote preserved the same critical
case meanings in the table above; this is still a small synthetic sample.

The second run changed the draft case from four proposals to six, and the conditional case from
six to five. It also changed a broad summary into a digest. This confirms that previews are not
a persisted approval batch. The main quality limits remain redundant summaries and low-value
facts such as the existence of a budget log. Some quotes also need the surrounding document
context to fully identify the project or qualification. Keep source links and review saved items.
