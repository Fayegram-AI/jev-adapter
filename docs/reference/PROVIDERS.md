# Provider contracts and compatibility

## Built-in routes

| Provider type | Wire API | Credential | Default model | Output strategy |
| --- | --- | --- | --- | --- |
| `jev` | `POST /v1/systemone` at api.typesafe.ai | `TYPESAFE_API_KEY` | `jev-latest` | Native typed decisions |
| `openai-compatible` | `POST /chat/completions` below configured base | Selected API key | None | JSON Schema, JSON object, or text |
| `openrouter` | Chat Completions at openrouter.ai/api/v1 | `OPENROUTER_API_KEY` | None | Same, with required-parameter routing |
| `anthropic` | `POST /v1/messages` at api.anthropic.com | `ANTHROPIC_API_KEY` | None | One forced schema-carrying tool result |
| Custom | Your implementation | Your explicit configuration | Optional | Canonical DecisionProvider result |

The interface is model-neutral, not a guarantee that every model or endpoint
supports every strategy. A compatible URL alone is insufficient: the chosen model
must follow the decision instruction, fit the input/schema, and return valid data.
Provider behavior is covered by local protocol tests and checked against official
specifications. These checks do not establish compatibility with every account or
model. Run the optional [live check](../development/TESTING.md) for the Jev account
and model you intend to use; see the protocol [sources](SOURCES.md).

## Native Jev

The request directly contains `model`, shared `state`, and `questions`. Jev's
`choice`, `noul`, and `score` results are preserved and strictly validated. No
intermediate language model, skill, portal prompt, or chat conversion is used.
`GET /v1/models` lists native models. A listed catalog can differ from valid aliases;
`jev-latest` is the documented stable alias.

Pin a version after evaluating it for your workload rather than assuming a moving
alias yields reproducible quality. Store the returned `model` along with the
requested model and your question-template revision.

## OpenAI-compatible servers

Default base URL: `https://api.openai.com/v1`. Base paths such as `/v1` are preserved;
provide the API base, not the final `/chat/completions` path.

`json_schema` sends `response_format.type = json_schema`, `strict: true`, and a
schema whose required object fields disallow additional properties. Ranges and
normalization are validated locally to accommodate different supported schema
subsets. `json_object` requests JSON without schema enforcement. `text` omits the
format field and relies on instructions plus strict local validation.

There is **no auto mode**: an unsupported schema error is visible rather than
triggering a second request with weaker enforcement. A refusal, truncated output,
malformed JSON, probability violation, or unexpected tool call is an explicit
error. No Markdown stripping or JSON repair occurs.

The default token field is `max_completion_tokens`. Some compatible servers need
`max_tokens`; set `tokenParameter` explicitly. No temperature or reasoning setting
is forced. Additional generation parameters must be supported by the selected
model. This provider does not implement OpenAI Responses API, realtime streaming,
multimodal inputs, or a general function-calling agent loop.

## OpenRouter

`OpenRouterProvider` is a fixed-endpoint compatible preset, not a second native
Jev transport. It reads its own key and defaults to `max_tokens`. It sets
`parameters.provider.require_parameters = true` so required request features are
not silently ignored by routing. Other explicit routing settings are preserved.
The preset does not guarantee which upstream host serves a model; use OpenRouter's
routing controls for stricter requirements.

Select a **generative model** that supports the chosen output mode. This release
makes no claim that Jev itself can be used through a Chat Completions route. Direct
Jev is the implemented native path. Vercel's special evaluation API is not a built-in
provider in this release; add it through the documented custom-provider contract
rather than mislabeling it as Chat Completions-compatible.

## Anthropic

The provider sends Messages API headers `x-api-key` and
`anthropic-version: 2023-06-01`. It defines a synthetic `submit_decisions` tool whose
input schema is the expected answer object, then forces exactly that tool. The
returned `tool_use.input` carries the data; **no tool is executed** and no follow-up
agent cycle is started.

Extended thinking is not enabled in this forced-tool strategy; a `thinking`
parameter is rejected. Refusals, truncated output, unexpected stop reasons, and
missing/extra named tools fail. `GET /v1/models` returns the first page with
`has_more` / `last_id` preserved. Automatic pagination is not implemented.

## Native versus elicited probabilities

Jev reports its own native outputs and confidence. Generative models are prompted
to produce probability distributions. Those estimates are not logprobs, repeated
sampling frequencies, calibrated confidence, or proof of correctness.

The adapter derives an argmax choice and a probability-weighted score from the
elicited distributions. It does not synthesize Jev's confidence statistic. Both
paths use the same application contract, but metadata records their provenance:
`native` versus `elicited`. Evaluate performance and calibration on representative
labeled data before adopting thresholds or comparing costs/latencies.

## Compatibility boundaries

Remote context limits, JSON Schema limits, model availability, output budgets,
pricing, and rate limits are provider/account specific. The adapter's local caps
do not override them. This release has no silent provider failover, model search,
credential refresh, provider-side batch API, or universal quality guarantee.
Unsupported protocols require a custom `DecisionProvider`; unsupported server
features require an explicitly supported mode or a different model.
