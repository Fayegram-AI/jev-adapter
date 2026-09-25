# Jev Adapter

A JavaScript SDK that turns supplied information into structured decisions inside
your application. An optional Node command runner is included for evaluating files.
Give it a `state` (text or JSON to assess) and one or more `questions`; it returns
validated choices, probabilities for yes/no (`noul`) questions, or rubric-based
scores.
For example, pass a failed test log to classify the failure and estimate whether
a missing dependency caused it. Your application decides what to do with the result.

By default, requests go to Jev through TypeSafe's native decision API. You can
select an OpenAI-compatible endpoint, OpenRouter, Anthropic, or a custom provider
without changing the `state` / `questions` request format.

**Version 0.1.0 · Node.js 22.16+ · ESM · zero runtime dependencies**

Source: [Fayegram-AI/jev-adapter](https://github.com/Fayegram-AI/jev-adapter).
For usage questions and bug reports, use the repository's
[issues](https://github.com/Fayegram-AI/jev-adapter/issues); report security
issues privately as described in [SECURITY.md](SECURITY.md).

This is an independent integration, not an official TypeSafe product. The built-in
generative backends identify their probabilities as elicited model outputs.
Changing providers does **not** make their accuracy or calibration equivalent.

## Use in your application

Use Node.js **22.16 or newer**. Install the package from npm in your application's
directory:

```bash
npm install @fayegram-ai/jev-adapter
```

The installed SDK runs without a compilation step.

Create `.env` in your application's directory and set your TypeSafe API key:

```dotenv
TYPESAFE_API_KEY=your_real_key_here
```

Add `.env` to your application's `.gitignore`. The SDK reads the process
environment; the Node command below explicitly loads this file before startup.

Save this complete example as `app.mjs` beside `.env`. The `.mjs` extension enables
ESM imports without changing your application's `package.json`:

```javascript
import { createAdapter, choice, noul, publicError } from '@fayegram-ai/jev-adapter';

try {
    const adapter = createAdapter(); // TYPESAFE_API_KEY; model defaults to jev-latest.
    const result = await adapter.evaluate({
        state: { log: "ModuleNotFoundError: No module named 'pytest'" },
        questions: {
            category: choice('Classify the failure using only the evidence.', {
                dependency: 'A required package or module is unavailable.',
                network: 'A network operation failed.',
                unknown: 'The evidence is insufficient.',
            }),
            missing_package: noul('Does the error indicate a missing package?'),
        },
    });
    console.log(result.answers.category.choice);
    console.log(result.answers.missing_package.noul);
    console.log(result.meta.probabilitySource);
} catch (error) {
    console.error(publicError(error));
    process.exitCode = 1;
}
```

```bash
node --env-file=.env app.mjs
```

This makes one real Jev evaluation and may incur charges. The first output is one
of your category labels. The second is a probability between 0 and 1; `noul` does
not turn it into a boolean. For Jev, `probabilitySource` is `native`. Answers depend
on the model; the example does not assume a particular prediction.

Edit `state` and the question definitions for each call. No saved prompt
registration is required. `publicError()` exposes a stable error code and safe
message, with HTTP diagnostics when available; see [errors](docs/reference/ERRORS.md).

Continue with [getting started](docs/guides/GETTING_STARTED.md) for TypeScript,
CommonJS, and optional command-runner usage, or the [SDK reference](docs/reference/SDK.md)
for the complete request and result contracts.

## Change the backend, not the request

[Switching models](docs/guides/SWITCHING_MODELS.md) provides a complete SDK example
for changing providers. For a locally served compatible model, construct the adapter
with an explicit provider:

```javascript
import { createAdapter, OpenAICompatibleProvider } from '@fayegram-ai/jev-adapter';

const provider = new OpenAICompatibleProvider({
    baseURL: 'http://127.0.0.1:8000/v1',
    apiKey: null,                       // Explicitly allowed only for loopback.
    model: process.env.LOCAL_MODEL,     // Your locally served model ID.
    responseFormat: 'json_schema',      // Must be supported by that endpoint.
    tokenParameter: 'max_tokens',
});
const adapter = createAdapter({ provider });
// await adapter.evaluate(theSameRequest);
```

For OpenRouter, use `new OpenRouterProvider({ model: 'your-provider/your-model' })`
with `OPENROUTER_API_KEY`. For Anthropic, use
`new AnthropicProvider({ model: 'your-account-model-id' })` with
`ANTHROPIC_API_KEY`. Substitute real available model IDs; the adapter does not
choose an arbitrary remote model on your behalf.

A server may implement only JSON-object or text output. Select that mode explicitly
with `responseFormat: 'json_object'` or `'text'`; the client still validates every
answer. It never silently downgrades formats, repairs JSON, or changes models.

## Optional command runner

The installed package includes `jev-decision` for working with request files.
Run it through npm from your application directory:

```bash
npm exec -- jev-decision init ./my-decisions
npm exec -- jev-decision validate ./my-decisions/request.json
```

These two commands are offline. To evaluate with a real account, copy the generated
`.env.example` to `.env` inside `my-decisions`, set the key, then run:

```bash
npm exec -- jev-decision evaluate ./my-decisions/request.json --config ./my-decisions/decision.config.json --env-file ./my-decisions/.env
```

The runner uses explicit environment/configuration paths. See the
[command reference](docs/reference/CLI.md) for flags, streams, and exit codes.

## What this repository produces

| Component | What you get |
| --- | --- |
| JavaScript SDK | Import `@fayegram-ai/jev-adapter` in your application; TypeScript declarations are included |
| Optional command runner | `jev-decision` and its shorter `decision` alias, both backed by `bin/jev.mjs` |
| npm package artifact | `npm run build` creates and verifies `release/fayegram-ai-jev-adapter-VERSION.tgz` |

For maintainers, `npm run build` archives the ESM source and verifies an offline
install of the exact tarball used for the npm release. See
[packaging and release](docs/development/RELEASING.md).

For running the source examples, see [source setup](docs/guides/GETTING_STARTED.md#run-from-a-source-checkout).
See [platform setup](docs/guides/PLATFORMS.md) for Windows/macOS/Linux details.

## What is included

The source checkout includes these runtime features and development tools. The npm
tarball contains the SDK, Node command, small examples, and maintained docs; it excludes the
test suite and development scripts.

| Area | Implementation |
| --- | --- |
| Stable contract | Runtime-defined `choice`, `noul`, `score`; shared state; immutable results |
| Providers | Native Jev; Chat Completions-compatible; OpenRouter preset; Anthropic Messages |
| SDK | Typed builders, provider factory, cancellation, batch evaluation, context/observer extensions, optional decision policy |
| Node command | Initialize, evaluate, validate, schema, models, ordered JSONL batches, explicit JSON profiles |
| Reliability | Bounded payloads, deadlines, limited retries, strict response validation, safe errors, atomic output |
| Development | Functional tests, coverage, TypeScript contract checks, offline tarball-install smoke test, CI template |

## Result semantics

`result` contains `answers`, `model`, `usage`, and `meta`. Native Jev confidence is
preserved. Generative backends **do not invent confidence**; missing token counts
are `null`, not zero. Their choices and scores are derived from the returned
probability distributions. See [SDK reference](docs/reference/SDK.md) and
[provider compatibility](docs/reference/PROVIDERS.md).

This library does not execute the selected action, operate an agent loop, train a
model, enforce user authorization, or guarantee decision correctness. It is the
integration layer on which you can build those policies explicitly.

## Documentation

Start with the [documentation index](docs/README.md), including:

- [Getting started](docs/guides/GETTING_STARTED.md), [customization](docs/guides/CUSTOMIZATION.md), and [custom providers](docs/guides/CUSTOM_PROVIDERS.md).
- [SDK](docs/reference/SDK.md), [configuration](docs/reference/CONFIGURATION.md), [errors](docs/reference/ERRORS.md), and the optional [command runner](docs/reference/CLI.md).
- [Contributor documentation](docs/development/README.md) and [security](SECURITY.md).

## Contributing and verification

Start with [CONTRIBUTING.md](CONTRIBUTING.md). User guides and API references live
under `docs/guides/` and `docs/reference/`; maintained contributor documentation
lives under `docs/development/`. See the [repository layout](docs/development/REPOSITORY_LAYOUT.md)
for the source and package contents.

From a source checkout, run `npm run verify` for routine code, contract, and
package checks. `npm run test:coverage` reruns the functional suite with coverage
floors; the [release guide](docs/development/RELEASING.md) gives a single-pass
verification sequence. These software checks use synthetic fixtures and local
HTTP servers; they do not measure model quality. The
[testing guide](docs/development/TESTING.md) covers code and package checks plus
an optional live integration smoke check. Package preparation is described in the
[release guide](docs/development/RELEASING.md).
Public behavior changes are recorded in the [changelog](CHANGELOG.md).

## License

This project is licensed under the [MIT License](LICENSE).
