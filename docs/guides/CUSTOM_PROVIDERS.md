# Custom providers

A custom provider adapts another model or execution engine to the stable decision
contract. It is not required for native Jev or the included compatible presets.
An endpoint implementing only another protocol needs this adapter rather than an
unverified base-URL substitution.

## SDK contract

A `DecisionProvider` has:

```text
name: nonempty string
probabilitySource?: string
defaultModel?: nonempty string
evaluate(resolvedRequest, { signal }?): Promise<ProviderResult>
listModels?({ signal }?): Promise<{ models: [{ name, ... }], ... }>
```

`resolvedRequest` already contains a model, immutable state, and validated questions.
Return `model`, `answers`, `usage`, and optional JSON `meta`. Exact answer IDs/types
must match the request. Unreported token counts must be `null`. Do not use fake
confidence or token counts to satisfy a native Jev shape. Set honest probability
provenance; the adapter supplies `unspecified` when nothing is known.

Pass your provider directly:

```javascript
const adapter = createAdapter({ provider: myProvider });
```

A provider with no default model is valid; callers must then supply request.model.
Implement `listModels` only when it is meaningful. Respect AbortSignal and bound
network/body work. Built-in transport helpers are internal, not public stable
exports; use a public built-in provider to delegate an already-supported protocol,
or own your protocol's transport and tests.

## Runnable delegation example

In your installed application, save this as `provider.mjs`. It exports a factory
that delegates to `OpenAICompatibleProvider`:

```javascript
import { OpenAICompatibleProvider } from '@fayegram-ai/jev-adapter';

export function createProvider(options = {}) {
    const backend = new OpenAICompatibleProvider(options);
    return {
        name: 'project-compatible-endpoint',
        defaultModel: backend.defaultModel,
        probabilitySource: backend.probabilitySource,
        evaluate: (request, callOptions) => backend.evaluate(request, callOptions),
        listModels: callOptions => backend.listModels(callOptions),
    };
}
```

Configure its real endpoint/key/model before use. The source checkout includes
[examples/custom-provider.mjs](../../examples/custom-provider.mjs) with the
corresponding source-relative import.

## Explicit CLI module

```json
{
  "schemaVersion": 1,
  "provider": "custom",
  "module": "./provider.mjs",
  "model": "YOUR_SERVED_MODEL",
  "apiKeyEnv": "PROJECT_MODEL_KEY",
  "timeoutMs": 30000,
  "options": {
    "baseURL": "https://your-model-service.example/v1",
    "responseFormat": "json_schema",
    "tokenParameter": "max_tokens"
  }
}
```

Here the `.example` URL and model ID are placeholders, not hosted services.
The module must export `createProvider(options)`, synchronously or asynchronously.
Async import/factory waiting is bounded by `timeoutMs` (30 seconds by default) and
CLI cancellation; this is a separate initialization budget before evaluation.
The loader passes configured JSON `options`, then selected `apiKey` and `model`
when present. Do not store secrets in `options`; use `apiKeyEnv`.

A module path inside a JSON config is resolved relative to that config. The
`--provider-module` flag resolves relative to the current directory and implies
`--provider custom`. Imported modules can execute arbitrary code: this is a trusted
extension mechanism, not a sandbox. No executable module is auto-discovered.

## Required tests for a new backend

Test the serialized request, credentials/headers, endpoint path, response mapping,
unknown usage, provenance, refusals/truncation, malformed distributions, timeouts,
abort behavior, and safe errors. Use local HTTP fixtures for deterministic protocol
tests. Live tests should be explicit, credential-dependent, and clearly separated
from unit tests. Do not call synthetic fixture results accuracy measurements.
