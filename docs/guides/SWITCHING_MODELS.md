# Switching models without rewriting the application

The adapter's request is always `state`, `questions`, and optionally `model`.
The provider translates it into that service's wire protocol and validates the
response. Select a provider when constructing your SDK adapter.

## SDK: same request, different provider

Install the package as described in [getting started](GETTING_STARTED.md).
Create or update `.env` in your application directory with the selected backend's
key and an actual model ID available to your account. For OpenRouter:

```dotenv
OPENROUTER_API_KEY=replace_with_your_openrouter_key
DECISION_MODEL=VENDOR/MODEL_ID
```

Keep `.env` out of source control. `VENDOR/MODEL_ID` is a placeholder to replace.
Save this complete example as `use-model.mjs` beside `.env`:

```javascript
import { createAdapter, createProvider, choice, publicError } from '@fayegram-ai/jev-adapter';

try {
    const provider = createProvider({
        type: 'openrouter',
        model: process.env.DECISION_MODEL,
        responseFormat: 'json_schema',
    });
    const adapter = createAdapter({ provider });
    const result = await adapter.evaluate({
        state: { message: 'I was charged twice for the same invoice.' },
        questions: {
            route: choice('Which team should inspect this message?', {
                billing: 'Invoices, charges, or payment problems.',
                technical: 'Software defects or connectivity problems.',
                unknown: 'The evidence does not establish a team.',
            }),
        },
    });
    console.log(JSON.stringify(result, null, 2));
} catch (error) {
    console.error(publicError(error));
    process.exitCode = 1;
}
```

Run it from your application directory:

```bash
node --env-file=.env use-model.mjs
```

This performs a real evaluation and may incur charges. The request is defined in
this script; it does not need files from the adapter's source checkout.

To use another backend, replace the `createProvider(...)` configuration in the
example and provide that backend's credential in `.env`:

| SDK `type` | Credential variable | Model selection |
| --- | --- | --- |
| `jev` | `TYPESAFE_API_KEY` | Defaults to `jev-latest`; an explicit model overrides it |
| `openrouter` | `OPENROUTER_API_KEY` | Set a model available through your account |
| `openai-compatible` | `OPENAI_API_KEY` for the default OpenAI endpoint | Set a model available through your account |
| `anthropic` | `ANTHROPIC_API_KEY` | Set a model available through your account |

```javascript
createProvider({ type: 'jev', model: 'jev-latest' });
createProvider({ type: 'openai-compatible', model: process.env.DECISION_MODEL });
createProvider({ type: 'anthropic', model: process.env.DECISION_MODEL });
```

Each line is an alternative configuration. Constructors validate credentials but
make no inference calls. `evaluate()` sends the request. In the SDK, a request's
`model` overrides the provider default; omit it when the provider should choose.
The SDK does not automatically read `DECISION_*` settings: this example passes
`process.env.DECISION_MODEL` explicitly. The SDK factory property is **`type`**;
a command-runner JSON profile uses **`provider`**.

To list models with the configured SDK adapter, use `await adapter.listModels()`.
A catalog entry does not prove support for a particular response format. Check
that the selected serving endpoint supports the configured output mode. Anthropic
model listing preserves first-page pagination metadata; this client does not
fetch all pages automatically.

## Local or other compatible services

For a loopback server using Chat Completions, replace the provider configuration
in the complete example with:

```javascript
const provider = createProvider({
    type: 'openai-compatible',
    baseURL: 'http://127.0.0.1:8000/v1',
    apiKey: null,
    model: process.env.LOCAL_MODEL,
    responseFormat: 'json_schema',
    tokenParameter: 'max_tokens',
});
```

Set `LOCAL_MODEL` in `.env` to your served model ID. `apiKey: null` explicitly
allows no authentication only for loopback compatible endpoints. A remote custom
endpoint requires HTTPS and an explicit `apiKey`, for example
`apiKey: process.env.MY_SERVICE_KEY`. See [credential boundaries](../reference/CONFIGURATION.md#custom-endpoint-credential-boundary).

Select `responseFormat: 'json_object'` or `'text'` only when appropriate for that
service. Validation remains strict, and the client does not silently retry with
a weaker format.

## Optional command runner

From an application with the package installed locally, create a request to edit:

```bash
npm exec -- jev-decision init ./my-decisions
```

Edit `my-decisions/request.json` for your task. Keep `.env` in the application
root for the commands below, with the selected backend's key. Replace the
uppercase model placeholders with IDs available to your account/server:

```bash
npm exec -- jev-decision evaluate ./my-decisions/request.json --provider jev --model jev-latest --env-file .env
npm exec -- jev-decision evaluate ./my-decisions/request.json --provider openrouter --model VENDOR/MODEL_ID --env-file .env
npm exec -- jev-decision evaluate ./my-decisions/request.json --provider openai-compatible --model MODEL_ID --env-file .env
npm exec -- jev-decision evaluate ./my-decisions/request.json --provider anthropic --model MODEL_ID --env-file .env
```

List models with `npm exec -- jev-decision models --provider openrouter --env-file .env`.
For a loopback compatible server:

```bash
npm exec -- jev-decision evaluate ./my-decisions/request.json --provider openai-compatible --base-url http://127.0.0.1:8000/v1 --no-auth --model LOCAL_MODEL_ID --token-parameter max_tokens --response-format json_schema
```

For a remote custom endpoint, explicitly select its credential variable with
`--api-key-env MY_SERVICE_KEY` alongside `--base-url`.

### Save a command-runner profile

Create `openrouter.config.json` in your application directory:

```json
{
    "schemaVersion": 1,
    "provider": "openrouter",
    "model": "VENDOR/MODEL_ID",
    "apiKeyEnv": "OPENROUTER_API_KEY",
    "responseFormat": "json_schema",
    "timeoutMs": 30000
}
```

```bash
npm exec -- jev-decision evaluate ./my-decisions/request.json --config openrouter.config.json --env-file .env
```

Command-runner model precedence is `--model` > `request.model` > resolved
configuration > provider default. Omit `model` from reusable request files when
profiles should choose it. Provider changes reset lower-precedence
provider-specific settings; supply overrides for the new provider explicitly.
See [configuration](../reference/CONFIGURATION.md).

## Boundaries

The built-in generic path uses Chat Completions, not the OpenAI Responses API.
Anthropic uses one forced output-schema tool, not an agent loop. A genuinely
different protocol requires the [custom-provider contract](CUSTOM_PROVIDERS.md).
Direct Jev is implemented; this release does not pretend its special evaluation
interface is an ordinary chat endpoint.

All built-in evaluations return probability-based decisions. Jev's probabilities
are marked `native`; a generative model's estimates are `elicited`, not logprobs or
a calibration guarantee. There is no discrete-only mode in this release. The
adapter standardizes the software interface, not model accuracy or statistical
semantics. See [provider reference](../reference/PROVIDERS.md).
