# Documentation

Start with [using the SDK in your application](../README.md#use-in-your-application)
for installation and a complete first call. This index separates usage guides,
API reference, and contributor documentation.

Jev Adapter is a JavaScript SDK with an optional command runner. It evaluates
supplied `state` and `questions` with Jev or a selected model backend and returns
validated, structured decisions.

## Use the adapter

| Guide | Purpose |
| --- | --- |
| [Getting started](guides/GETTING_STARTED.md) | Package installation, credentials, JavaScript/TypeScript integration, and first evaluation |
| [Platforms](guides/PLATFORMS.md) | Windows, macOS, and Linux setup |
| [Switching models](guides/SWITCHING_MODELS.md) | Backend and model selection |
| [Customization](guides/CUSTOMIZATION.md) | Questions, templates, extensions, and policies |
| [Custom providers](guides/CUSTOM_PROVIDERS.md) | SDK contract and explicit CLI module loading |
| [Troubleshooting](guides/TROUBLESHOOTING.md) | Configuration, network, model, and output errors |

## Reference

| Document | Purpose |
| --- | --- |
| [SDK](reference/SDK.md) | Exports, types, cancellation, and batching |
| [Command runner](reference/CLI.md) | Optional commands, flags, streams, and exit codes |
| [Configuration](reference/CONFIGURATION.md) | Precedence, credentials, and profiles |
| [Providers](reference/PROVIDERS.md) | Protocols and probability provenance |
| [Errors](reference/ERRORS.md) | Error codes and retry behavior |
| [Sources](reference/SOURCES.md) | Primary protocol documentation |

## Contribute

Read [CONTRIBUTING.md](../CONTRIBUTING.md), then the
[contributor documentation](development/README.md) for architecture, design
choices, testing, and packaging. The
[repository layout](development/REPOSITORY_LAYOUT.md) explains source and package
contents.

The [security policy](../SECURITY.md) and [changelog](../CHANGELOG.md) cover
operational boundaries and public compatibility history.
