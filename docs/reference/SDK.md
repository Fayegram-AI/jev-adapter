# JavaScript SDK reference

Import from `@fayegram-ai/jev-adapter` in your application after package installation.
See [getting started](../guides/GETTING_STARTED.md) for a complete JavaScript call,
TypeScript setup, and CommonJS dynamic import. The source-tree entry point is
`src/index.mjs`. The package exposes ESM. Public
TypeScript declarations are in `src/index.d.mts`; runtime JavaScript is authoritative
and checked independently of those declarations.

## Create an adapter

```javascript
import { createAdapter } from '@fayegram-ai/jev-adapter';

const adapter = createAdapter({
  // Omit provider and jev entirely for direct Jev using TYPESAFE_API_KEY.
  jev: { model: 'jev-latest', timeoutMs: 30000, maxRetries: 2 },
  timeoutMs: 60000,
  observerTimeoutMs: 1000,
  extensions: [],
});
```

Use either `provider` (a `DecisionProvider`) or `jev` (native provider options),
not both. The adapter's `provider` and `defaultModel` properties are read-only.
Unknown options are errors, not ignored settings. Provider credentials are resolved
at construction time; create a new provider after rotating credentials.

### `adapter.evaluate(request, options?)`

`request` has exactly `state`, `questions`, and optional `model`. The request model
wins over the provider's default. No default is assumed for a generative provider.
`options` accepts `signal: AbortSignal` and `timeoutMs`, overriding the adapter's
60-second evaluation budget for this call. It does not mutate the provider's
independent HTTP timeout.

The adapter snapshots and freezes its input, runs sequential state preparation,
invokes the provider once, validates the result, then observes an immutable result.
Built-in HTTP providers can retry eligible responses within that invocation.

### `adapter.listModels(options?)`

Calls the provider's listing operation. Returns `{ models: [{ name, ... }], ... }`.
Pagination markers are preserved; this is not a promise of an exhaustive catalog.
A custom provider without listing support throws `UNSUPPORTED_OPERATION`.

## Request data

`state` is a string, plain JSON object, or array. It may be empty, but not null,
a top-level number, or a top-level boolean. Values nested within objects/arrays can
be any JSON values. JSON snapshots reject `undefined`, cycles, non-finite numbers,
functions, dates, class instances, accessors, symbols, sparse arrays, and extra or
non-enumerable array/object properties. Limits: nesting depth 100, 200,000 nodes.

`questions` is a nonempty object keyed by application-owned identifiers. Every
question requires non-null `instructions`: nonempty text, a JSON object, or an
array. Descriptions can be text or structured JSON. Only choice descriptions permit
raw null. IDs and choice labels must be nonempty. Request and question unknown fields are rejected.

### Question builders

```javascript
const q1 = choice('Which queue should receive this?', {
  billing: 'Invoices or payment problems.',
  engineering: 'Technical defects.',
  unknown: 'Insufficient evidence.',
});
const q2 = noul('Does the evidence show a failed test?', {
  true: 'At least one executed test failed.',
  false: 'No executed test is shown to have failed.',
});
const q3 = score('How far did processing progress?', [
  'Not started.', 'Started but incomplete.', 'Completed.',
]);
```

Builders return immutable question objects. `choice(instructions, criteria)` accepts
a label map containing 1 to 255 options. `noul(instructions, criteria?)` accepts an
optional criteria object,
with only `true` and `false` keys. `score(instructions, criteria)` accepts **2–10**
ordered levels; numeric level indices are zero-based. There is no boolean alias:
`noul` means a probability, not a thresholded truth value.

## Returned data

```text
EvaluationResult
  model                     Reported model identity, or explicitly marked fallback
  answers.<question-id>     Typed answer, matched to that input question
  usage                     Token counts; unreported generic counts are null
  meta                      Provenance, version, timings, diagnostics
```

**Choice:** `{ type: 'choice', choice, probabilities, confidence? }`.
The probability keys must exactly match the options, all values must be in [0,1],
and the sum must be within 0.001 of 1. The selected option must be maximal within
rounding tolerance. Native Jev requires its confidence field. Generative adapters
derive the selected option from the distribution and omit confidence. Ties choose
the first label in JavaScript property enumeration order; numeric-looking keys
follow JavaScript's numeric property ordering.

**Noul:** `{ type: 'noul', noul }`, with a number in [0,1]. The library never
thresholds this into true/false without application code.

**Score:** `{ type: 'score', score, probabilities, legend, confidence? }`.
For N levels, keys are `'0'` through `String(N-1)`. The score is the weighted mean
of these indices; validation tolerance is `0.02 * N` (accommodating 2-decimal rounded probability distributions from live services). `legend` must match the input
rubric exactly. Generative adapters calculate score and legend locally. Native
values are validated and preserved, not normalized or replaced.

**Usage:** `input_tokens` and `output_tokens` are nonnegative integers or null.
Native Jev requires reported integer counts. Anthropic cache creation/read counts
are preserved separately when provided. No total price, inferred cache saving, or
estimated token count is fabricated.

**Metadata:**

| Field | Meaning |
| --- | --- |
| `provider` | Adapter backend name; native Jev reports `typesafe` |
| `requestedModel` | Resolved model requested by the caller |
| `probabilitySource` | `native`, `elicited`, or custom/`unspecified` provenance |
| `confidenceSource` | `native` or `unavailable` for built-in providers |
| `modelSource` | `reported` or `requested` fallback for built-in providers |
| `adapterVersion`, `schemaVersion` | Package version and result contract version |
| `attempts`, `requestId` | HTTP diagnostics when supplied |
| `durationMs` | Provider HTTP duration, including retries/body reading |
| `totalDurationMs` | Adapter duration through observation |
| `observerDurationMs` | Observation phase duration; initially zero inside observers |
| `observerFailures` | Names of failed/timed-out observers |

Metadata can have additional JSON fields. Application logic should not assume
unavailable metadata exists. Result objects and nested data returned by the adapter
are immutable. Standalone validation functions return snapshots, not frozen values.

## Extensions

An extension has a unique printable `name` (maximum 100 characters), optional
`prepareState(state, context)`, and optional `onResult(result, context)`.

Preparation returns replacement state or `undefined` to leave it unchanged.
Preparation exceptions fail before inference with `EXTENSION_ERROR`; transformed
state is revalidated. It cannot rewrite question definitions or switch the model.
Construct the request directly for those changes.

Observers run after successful inference; their failures are collected in
`meta.observerFailures`. They do not change answers, fail the successful request,
or trigger another billed call. Each observer gets its own timeout, default 1,000
milliseconds. Results shown to observers precede final timing/failure aggregation.

`context` contains `provider`, `model`, frozen `questionIds`, and an `AbortSignal`.
Custom callbacks should honor the signal. The adapter can stop waiting for ignored
signals, but cannot terminate arbitrary user code or its external side effects.
See [customization](../guides/CUSTOMIZATION.md) for runnable examples.

## Cancellation and deadlines

```javascript
const controller = new AbortController();
const resultPromise = adapter.evaluate(request, {
  signal: controller.signal,
  timeoutMs: 15000,
});
// controller.abort() cancels the in-flight request when needed.
```

An HTTP deadline covers attempts, backoff, and body reading. An adapter deadline
also covers preparation and the provider. The first applicable deadline wins.
Observer time is additional and bounded separately. Aborting after a successful
inference while observing preserves the successful result and records observer
failure; it does not pretend the billed evaluation failed.

## SDK batch evaluation

```javascript
const records = await evaluateBatch(adapter, requests, {
  concurrency: 4,
  stopOnError: false,
  signal: controller.signal,
});
```

This array API validates all requests before dispatch. Maximum array length is
10,000; concurrency is 1–64. Records retain input order and are either
`{ index, ok: true, result }` or `{ index, ok: false, error }`.
With `stopOnError`, already-started work completes and new work is marked
`BATCH_SKIPPED`. Cancellation marks undispatched records `ABORTED`. There is no
automatic model fallback. The CLI has a separate streaming JSONL implementation.

## Additional exports

- `createProvider(config)`: factory with `type` equal to `jev` (default),
  `openai-compatible`, `openrouter`, or `anthropic`.
- `JevProvider`, `OpenAICompatibleProvider`, `OpenRouterProvider`,
  `AnthropicProvider`: built-in provider classes.
- `validateRequest(input, defaultModel = 'jev-latest')`: snapshot and validate.
  Use an explicit default when validating another provider's requests.
- `validateResult(input, questions, { native = false })`: validate the canonical
  result; native mode requires confidence and reported counts.
- `buildResponseSchema(questions)`: compact JSON Schema used by generative providers.
- `decideChoice(answer, { minProbability, minMargin = 0, abstainOptions = [] })`:
  returns a policy result, never executes an action. `minProbability` is required.
- `AdapterError`, `publicError(error)`: public structured failure handling.

`decideChoice` returns `status: 'selected' | 'review'`, the model's choice, selected
probability, margin to the runner-up, and a reason. Thresholds are your policy;
no default claims of safety or empirical calibration are implied.

## Validation guarantees (retained and extended in 0.1.0)

Choice questions allow at most 255 options, matching the native contract. Noul
criteria must be omitted or an object; its present true/false descriptions cannot
be raw null. Score levels likewise cannot be raw null (nested null JSON values are
still allowed). These invalid forms now fail before provider dispatch.

`decideChoice()` rejects unknown option names and abstention labels not present in
the answer. `evaluateBatch()` validates array holes as invalid requests before any
item is dispatched, rather than spending on adjacent valid entries.

The optional third argument to `validateResult()` must be a plain options object
with only an optional boolean `native` field. Unknown keys, accessors, symbol keys,
non-enumerable fields and non-boolean settings are rejected as `CONFIGURATION_ERROR`.
An omitted or explicitly undefined `native` value keeps the default `false`.
Extension arrays must be dense; a hole is not an omitted extension.

Native provider cancellation/timeout errors preserve the last observed sanitized
request ID and attempt count when available. The adapter may settle its own
cancellation race before the provider returns diagnostics; do not require those
optional fields on every `ABORTED` or `TIMEOUT` error.
