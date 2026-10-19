# Check extraction boundaries without calling a model

## Why we ran it

Project context needs source-backed claims before a person can review or save them. This study checks what
Core's existing `extractMemories(text, complete)` validates and what still needs semantic and source review.
It gives maintainers a bounded replay of the released contract, using invented source excerpts and fake
completion responses. It does not evaluate an LLM or introduce a new proposal format.

## Setup

Measured with Node 24.19.0, registry Core 0.358.0 and Base 0.47.1. From the repository root, install the exact
SDKs into an isolated prefix, then run with a separate temporary home and report:

```sh
S=$(mktemp -d -p /var/tmp extraction-sdk-XXXXXX) && HOME=$S XDG_CONFIG_HOME=$S/config XDG_DATA_HOME=$S/data XDG_CACHE_HOME=$S/cache MESSAGING_STORE=$S/store WIRECAT_STATE_DIR=$S/state TMPDIR=$S NPM_CONFIG_USERCONFIG=/dev/null npm install --prefix "$S/prefix" --ignore-scripts --no-audit --no-fund --save-exact @wirecat/cli-core@0.358.0 @wirecat/cli-base@0.47.1
T=$(mktemp -d -p /var/tmp extraction-run-XXXXXX) && HOME=$T XDG_CONFIG_HOME=$T/config XDG_DATA_HOME=$T/data XDG_CACHE_HOME=$T/cache MESSAGING_STORE=$T/store WIRECAT_STATE_DIR=$T/state TMPDIR=$T node performance/projects/extraction-contract/run.mjs "$S/prefix" "$T/result.json"
```

Expected output: `33 synthetic contract cases matched; no model or store calls`, followed by the output path.
Installation alone needs the registry. The runner imports only the published `@wirecat/cli-core/documents`
entry for extraction and uses the existing [external-I/O guard](../../documents/drive-shared-store/guard.mjs)
to refuse network, sockets, browser/keyring subprocesses and subprocesses generally. No account is used,
no store API is called, and the store path must remain absent. Only the explicitly selected report is written.
This manual diagnostic is not added to CI.

## Observed results

[`result.json`](result.json) records all 33 cases: 16 accepted and 17 rejected as expected. Those counts
measure agreement with the observed contract, not good versus bad claims. The deliberately wrong claims
are accepted cases. [Fixtures](fixtures.mjs) contain the invented texts and fake answers; [run.mjs](run.mjs)
records lengths, outcomes and error codes without copying bodies into results.

| Case group | Observed released behavior |
| --- | --- |
| Message, mail, document and meeting labels | Text from each is accepted with one of the four supported kinds; labels are attached externally |
| Kind | `summary`, `digest`, `fact`, `preference` accepted; `task` and `decision` rejected |
| Unknown fields | Extra top-level `source_ref` and item `assignee`/`source_ref` accepted then stripped, not rejected |
| Input | Blank rejected before completion; 50,000 UTF-16 units accepted, 50,001 rejected; emoji boundary confirms units differ from UTF-8 bytes |
| Completion text | Valid JSON padded with spaces to 400,000 units accepted; 400,001 rejected |
| Item body | Trimmed; blank after trimming rejected; 15,000-unit body accepted, 15,001 rejected |
| Quote | Exact substring required; 8 and 4,000 units accepted, 7 and 4,001 rejected; case/spacing changes rejected |
| Count and JSON | Empty and 20 items accepted; 21, malformed JSON or missing `items` rejected |
| Batch | One invalid quote rejects the whole response; no partial accepted batch is returned |
| Request to fake completion | `purpose: memories`, source quotes allowed, input passed as `data`, `maxTokens: 6000` |

A 6,000-token request limit is a completion request field, not measured token enforcement. The length
limits above are JavaScript string units. The harness itself supplies fake answers; it does not test a
provider's token counting, refusal, rate limits or prompt-injection resistance.

## Exact quotes do not establish correct claims

The message fixture says `The budget is not approved.` A fake fact saying `The budget was approved` with
the exact quote `budget is not approved` is accepted. The quote is present; the claim contradicts it.
Structural validation and substring matching do not check semantic entailment.

A quote unique to the meeting fixture, `prototype only`, is rejected when paired with the message text.
However, `Review complete.` appears in multiple sources. A wrong claim attributing a prototype approval
to Noah is accepted against the message text when it uses that shared quote. The SDK receives one text,
not a source identifier, participant identity, date or project. It cannot authenticate attribution.

The fixture labels such as `synthetic:message:planning-1` are external test labels, not valid application
locators or SDK fields. Callers need to retain source references and context separately, then review
meaning, speaker, date, project scope and duplication before storing anything. This study creates no
facts, tasks, project links, proposals or memories, and does not test that downstream review workflow.

## Provenance and limits

The retained result includes exact package versions, npm integrity values checked against the installed
lock, manifest hashes, the public documents entry hash, the executed extractor function hash, Valibot
1.5.0 entry hash, and fixture/runner/guard hashes. It was measured using a retained isolated SDK prefix;
its lock also contains unrelated tooling. The lock digest identifies that installation, not a committed
portable lock or a guarantee that a new install resolves an identical dependency tree. Entry/function
hashes do not cover the entire package. Compare contract outcomes separately from byte identity.

This proves neither automatic extraction quality nor production readiness across providers. Fake
responses offer deterministic contract checks and reveal accepted failure modes; a later model study
needs separately labelled claims, semantic/source judgments, an exact model configuration and cost
records. Keep its accuracy and review-effort metrics separate from these contract counts, as described
in the [project measurement process](../PROCESS.md).
