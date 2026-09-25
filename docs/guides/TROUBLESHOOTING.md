# Troubleshooting

## The command cannot find a key

General `node bin/jev.mjs ...` calls need exported environment variables or an
explicit `--env-file .env`. Only the documented convenience npm scripts
preload `.env`. The file must name the selected provider's credential variable.
Do not pass a TypeSafe key to OpenRouter or vice versa. Existing shell environment
values win over a file; an old exported value can therefore mask a newly edited file.

## My model or base URL seems ignored

Unknown options are rejected, but precedence still matters: `--model` wins over
request.model, which wins over provider defaults. Provider changes discard
incompatible fields inherited from a different JSON profile. Use a complete
explicit config. A compatible base includes its version prefix, not the final
`/chat/completions` path. Native Jev/Anthropic origins must not include a path.

## Structured output is rejected

Check that the selected endpoint/model supports the requested `json_schema` mode.
Choose `json_object` or `text` explicitly when appropriate; local validation remains
strict. Some servers require `--token-parameter max_tokens`. A valid schema does
not guarantee probabilities sum to one. `INVALID_RESPONSE` must not be treated as
an approved decision. Large schemas also consume context/output budget.

## The model returns JSON but confidence is absent

This is expected for generative backends. They produce elicited probabilities,
not Jev's native confidence statistic. Read `meta.probabilitySource`. A null token
count means the server did not report it. Neither absence should be silently
converted to a number.

## Evaluation succeeds but an extension failed

Inspect `meta.observerFailures`. Observation occurs after inference; a failed log
sink must not cause another model call. Preparation failures instead throw
`EXTENSION_ERROR` before continuing to inference. Observe the separate provider,
adapter, and observer deadlines documented in the SDK reference.

## Batch output is incomplete

Per-record errors are explicit JSONL records and do not stop the CLI. A global
input, UTF-8, limit, interruption, or filesystem failure can stop the batch. Atomic
file output is not finalized in that case; stdout can contain a completed prefix.
Some requests may already have been sent/billed. Retrying an entire prefix can
repeat work, so retain completed records externally when designing resumability.

## Type checks fail because tsc is missing

Runtime and tests have no TypeScript dependency. Development type checks require
TypeScript 5.8.3, the verified compiler. Install it as a developer tool using the
instructions in [Testing](../development/TESTING.md). Do not confuse an absent
development compiler with a broken runtime package.

## Filing a useful issue

Include adapter version, Node version, OS, command with secrets removed, provider,
requested model, safe error JSON, and a minimal nonsensitive reproduction. Never
include `.env`, keys, private prompts, or raw confidential documents. Security
reports should be private; see the root security policy.
