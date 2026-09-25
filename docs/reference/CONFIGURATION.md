# Configuration and credentials

## Explicit JSON configuration

```json
{
  "schemaVersion": 1,
  "provider": "jev",
  "model": "jev-latest",
  "apiKeyEnv": "TYPESAFE_API_KEY",
  "timeoutMs": 30000,
  "maxRetries": 2
}
```

Load it with `--config path/to/decision.config.json`. The CLI never scans a working
directory for executable configuration. It does not read `.env` implicitly; use
`--env-file .env`. Runtime SDK configuration uses constructor options instead.

| Field | Values / scope |
| --- | --- |
| `schemaVersion` | 1; optional, but generated profiles include it |
| `provider` | `jev` default, `openai-compatible`, `openrouter`, `anthropic`, `custom` |
| `model` | Nonempty model ID; optional for Jev/listing; needed for generic evaluation |
| `baseURL` | HTTPS API base; loopback may use HTTP |
| `apiKeyEnv` | Credential environment variable name; inline `apiKey` is rejected |
| `noAuth` | Boolean; true only for loopback OpenAI-compatible endpoints |
| `timeoutMs` | Positive integer up to 2,147,483,647 milliseconds |
| `maxRetries` | Integer 0–10; default 2 |
| `maxRequestBytes`, `maxResponseBytes` | Positive integer up to 67,108,864; default 8 MiB |
| `maxTokens` | Generative output budget, 1–1,048,576; default 4096 |
| `responseFormat` | Compatible providers: `json_schema`, `json_object`, `text` |
| `tokenParameter` | Compatible providers: `max_completion_tokens` or `max_tokens` |
| `parameters` | Extra JSON generation parameters, excluding adapter-controlled fields |
| `module` | Custom provider's explicit local ESM file |
| `options` | Custom factory's JSON options, e.g. its own baseURL |

Upper numeric limits validate client configuration, not vendor model capabilities.
Provider-specific unused fields are rejected. In a custom profile, transport and
generation settings belong inside `options`; the custom factory owns them. Top-level
`timeoutMs` still bounds the adapter. The module may implement its own networking.

`parameters` cannot override model, messages, system instructions, schemas, tools,
streaming, token-limit fields, or credentials. Unrecognized model-specific
parameters may be rejected by the server; they are not silently dropped by us.

## Precedence

For provider/configuration settings:

```text
CLI flags > DECISION_* environment variables > explicit JSON file > defaults
```

For credentials loaded from an explicit environment file:

```text
existing process environment > --env-file values
```

The loader does not mutate the process environment. The SDK independently reads
its documented ambient credential variables at provider construction.

For evaluation model selection:

```text
--model > request.model > resolved config/environment model > provider default
```

Jev defaults to `jev-latest`, with `JEV_MODEL` as a legacy/direct convenience.
A `DECISION_MODEL` or file model takes precedence over that convenience.
OpenAI-compatible, OpenRouter, Anthropic, and custom providers do not inherit a
Jev model. Offline validation of a generic request without a model reports
`model: null`; evaluation requires a request model or provider default.

Each precedence layer is merged separately. Changing provider at either the file
→ environment or environment → flag boundary discards lower-layer endpoint, key
selector, model, maxTokens, parameters, output mode, token parameter, module/options
and no-auth settings. This prevents an environment-selected provider's key from
being forwarded after a flag selects a different backend. Same-provider overrides
retain compatible settings. Supply a complete new profile when switching providers.
Common timeout/retry/byte limits remain across built-in providers. At a custom
provider boundary only timeoutMs is shared; its transport settings belong in options.

## Recognized environment variables

| Variable | Purpose |
| --- | --- |
| `TYPESAFE_API_KEY` | Native Jev credential |
| `OPENAI_API_KEY` | Default OpenAI-compatible credential at the OpenAI origin |
| `OPENROUTER_API_KEY` | OpenRouter credential |
| `ANTHROPIC_API_KEY` | Anthropic credential |
| `JEV_MODEL` | Native Jev default model convenience |
| `DECISION_PROVIDER` | CLI provider selection |
| `DECISION_MODEL` | CLI configured model |
| `DECISION_BASE_URL` | CLI explicit endpoint |
| `DECISION_API_KEY_ENV` | CLI credential variable selector |
| `DECISION_TIMEOUT_MS` | CLI timeout, decimal integer |
| `DECISION_MAX_RETRIES` | CLI retry count, decimal integer |
| `DECISION_RESPONSE_FORMAT` | CLI compatible output mode |

`RUN_LIVE_TESTS=1` applies only to the explicit development smoke helper.
No background access or live testing is enabled by normal test commands.

## Custom endpoint credential boundary

A CLI `baseURL` always requires explicit `apiKeyEnv`, even when it happens to equal
a preset origin, or `noAuth: true` for loopback compatible servers. This makes the
credential destination a deliberate selection. OpenRouter's preset origin cannot
be changed; use `openai-compatible` for a different gateway.

In SDK constructors, an ambient key is used only for the provider's original
origin. A caller-supplied third-party origin requires an explicit `apiKey`.
`apiKey: null` disables authentication only for OpenAI-compatible loopback URLs.
Credentials in URL userinfo, query strings, or fragments are rejected. Redirects
are not followed. These protections are not an SSRF sandbox: applications that
accept untrusted endpoint configuration must enforce their own destination policy.

## Profiles

See `examples/configs/` in the project for direct Jev, OpenRouter, Anthropic,
OpenAI-compatible, and local-server profiles. Replace placeholder model identifiers
with IDs returned by the intended account/server. Profiles intentionally contain
no real key or claim that one model is available to every user.
