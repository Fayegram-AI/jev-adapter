# Primary protocol sources

These are the upstream protocol and platform references used by the adapter.
Recheck them before updating versions or claiming new compatibility. Listing a
reference does not imply that authenticated inference was run against its service.

| Subject | Official source |
| --- | --- |
| Node 22.16 JSON modules | https://nodejs.org/download/release/v22.16.0/docs/api/esm.html#json-modules |
| Node filesystem identities and atomic operations | https://nodejs.org/docs/latest-v22.x/api/fs.html |
| TypeSafe request/response API | https://docs.typesafe.ai/api |
| TypeSafe JavaScript examples | https://docs.typesafe.ai/sdk/javascript |
| Native model listing and aliases | https://docs.typesafe.ai/models |
| Choice decisions | https://docs.typesafe.ai/primitives/choice |
| Noul probabilities | https://docs.typesafe.ai/primitives/noul |
| Score rubric and weighted expectation | https://docs.typesafe.ai/primitives/score |
| Native confidence interpretation | https://docs.typesafe.ai/confidence |
| OpenAI structured output modes | https://platform.openai.com/docs/guides/structured-outputs |
| OpenRouter structured output and routing | https://openrouter.ai/docs/guides/features/structured-outputs |
| Anthropic Messages, tools, usage, and stop reasons | https://platform.claude.com/docs/en/api/messages/create |
| GitHub checkout action | https://github.com/actions/checkout |
| GitHub Node setup action | https://github.com/actions/setup-node |

No model pricing, benchmark score, latency promise, or calibration guarantee is
baked into this implementation. The repository tests verify its own protocol and
software invariants using explicitly labeled fixtures. Live model behavior is a
separate operational check.
