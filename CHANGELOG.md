# Changelog

Notable user-facing changes by version.

## 0.1.0

Initial public release of Jev Adapter:

### Added

- A provider-neutral JavaScript SDK and Node command interface for `choice`, `noul`, and `score`
  decisions, including ordered batch evaluation and TypeScript declarations.
- Native Jev, OpenAI-compatible, OpenRouter, Anthropic, and custom providers,
  with explicit probability provenance and nullable generative-model usage.
- Configurable deadlines, cancellation, bounded retries, validation, and
  explicit credential selection for custom origins.
- Source documentation, examples, a cross-platform CI workflow, and an offline
  npm package-install check.

### Distribution

- MIT licensing and no runtime dependencies.
- The `Fayegram-AI/jev-adapter` source repository and
  `@fayegram-ai/jev-adapter` npm package as one coordinated release. The package
  tarball is built with `npm run build` and verified by offline installation.
