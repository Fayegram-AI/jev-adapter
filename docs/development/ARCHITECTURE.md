# Architecture

## Stable boundary

```text
Application / CLI
  state + question definitions + optional model
        |
        v
  strict request snapshot and validation
        |
  ordered prepareState extensions
        |
  DecisionProvider.evaluate
        +-- Jev: native systemone
        +-- OpenAI-compatible / OpenRouter: schema-aware chat request
        +-- Anthropic: forced output-schema tool
        +-- custom provider
        |
  canonical result validation
        |
  immutable result + bounded observation
        |
  application policy / storage / downstream action
```

The adapter is not an autonomous agent. It does not choose tools to execute, own
project state, or interpret a model answer as permission. Policy is outside the
provider, so backend substitution does not silently change authorization behavior.

## Module map

| Module | Responsibility |
| --- | --- |
| `src/index.mjs`, `src/index.d.mts` | Public runtime exports and TypeScript contract |
| `src/adapter.mjs` | Orchestration, extension lifecycle, shared deadline, immutable results |
| `src/validation.mjs` | Lossless JSON snapshots, request and result invariants |
| `src/questions.mjs` | Typed native question builders |
| `src/schema.mjs` | Compact generative schema, prompt boundaries, result derivation |
| `src/providers/` | Provider-specific wire protocols and normalization |
| `src/transport.mjs` | Bounded fetch, safe HTTP errors, retries, body limits |
| `src/async.mjs` | Deadlines and cancellation races |
| `src/options.mjs` | Unknown-field/accessor rejection for options |
| `src/errors.mjs` | Stable public errors and safe diagnostics |
| `src/batch.mjs` | Ordered bounded-concurrency SDK arrays |
| `src/policy.mjs` | Explicit choice threshold policy, with no action execution |
| `src/cli/ordered.mjs` | Concurrent input/result observation with a bounded ordered window |
| `src/cli/`, `bin/jev.mjs` | Configuration, input/output, commands, process signals |

## Generative representation

A conventional model returns only probability data. The adapter computes argmax,
score expectation, and rubric legend in code, avoiding contradictory generated
copies of derived fields. It does not normalize incorrect distributions or insert
confidence. Native Jev responses take a separate path and retain native data.
This creates a common shape without claiming common statistical semantics.

## Reliability model

Requests and responses have strict JSON/byte limits. End-to-end provider deadlines
include retry backoff and body reading. Adapter deadlines cover preparation and
custom providers even when a returned promise ignores cancellation. This bounds
how long the adapter waits, not the lifetime of arbitrary plugin-side resources.

Retry is intentionally conservative. The library does not implement transparent
backend failover or exactly-once inference. CLI atomic files protect existing
results; they cannot undo remote calls or already emitted stdout.

## Configuration trust

Ordinary profiles are explicit JSON. Credentials are references to environment
variables. Arbitrary code executes only when the user explicitly chooses a custom
provider module. Custom origins do not inherit unrelated ambient keys. These are
credential-leak mitigations, not a multitenant security boundary or SSRF sandbox.

## Extensibility and non-goals

Add context/observations through extensions, a protocol through DecisionProvider,
and business routing after evaluation. Future cache or router providers should
preserve provenance, model identity, input/template revision, and failure semantics.

Not included: a server API, interactive TUI, browser SDK, chat transcript abstraction,
agent actions, streaming token UX, multimodal prompts, model training, persistent
state, automatic provider pagination, automated benchmarking against live accounts,
or a gateway adapter for a non-compatible evaluation protocol. These omissions are
explicit scope choices, not hidden stubs on a supposedly implemented path.
