# Design rationale

## Native decisions as the application contract

Keep Jev-style state and independent typed questions instead of exposing chat as
the public abstraction. This gives applications a stable decision interface and
makes customization explicit at each call. Generative protocols are implementation
details behind a provider. Consequence: not every model can satisfy this contract
reliably; compatibility and quality must be tested separately.

## ESM JavaScript with declarations and no runtime dependencies

Use native Node.js fetch, streams, JSON, test runner, and argument parser. Ship
source plus `.d.mts` types without a transpilation build. Consequence: Node 22.16+
is required and TypeScript declaration synchronization needs its own tests. A
browser build and CommonJS entry point are not claimed.

## Provenance is part of the result

Native versus elicited probabilities are tagged. Generative confidence is absent;
unreported token counts are null. Derive choice/score from distributions instead
of generating redundant fields. Consequence: applications must handle optional
confidence/usage, and identical output schemas do not imply interchangeable
calibration or correctness.

## Fail explicitly instead of silently repairing or falling back

Reject invalid JSON, extra fields, wrong labels, non-normalized probabilities,
truncation, and refusals. Require explicit output modes and models. Consequence:
some calls fail that a permissive wrapper might guess at, but failures remain
observable and cannot silently change budgets or decision policies.

## Trusted extensions and explicit configuration

Read JSON config only when named. Load custom ESM only when explicitly selected.
Protect credential destinations and expose bounded callbacks. Consequence: plugins
are powerful and must be trusted; cancellation is not a JavaScript sandbox.

## Conservative retries and independent observations

Retry selected explicit transient HTTP statuses within a deadline. Do not retry
ambiguous network failures, malformed decisions, or observer failures. Consequence:
users can choose manual retry policies, but exactly-once billing cannot be promised.

## MIT licensing and coordinated distribution

Publish the maintained source under the MIT License, with the copyright notice
in `LICENSE` and matching SPDX identifiers in package metadata. Release the source
repository and npm package together. Consequence: source and package recipients
have the same MIT permissions and obligations; building an archive alone does not
publish a release.

## Verified npm package artifact

Build a versioned npm tarball from the source package and retain it only after an
offline installation check of the exact archive. Publish that verified artifact
to the public npm registry as part of the coordinated source and package release;
building alone never publishes it. Consequence: consumers install the release from
npm, while maintainers verify the exact archive before publication.
