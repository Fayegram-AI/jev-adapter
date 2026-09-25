# Command runner reference

The optional command runner evaluates files using the same adapter available in
the SDK. For application integration, start with the [SDK guide](../guides/GETTING_STARTED.md).

After installing the package from npm in your project, run:

```bash
npm exec -- jev-decision --help
npm exec -- jev-decision validate
```

The examples below use `jev-decision` as shorthand: prefix it with `npm exec --`
for a local installation, use it directly after a global installation, or replace
it with `node bin/jev.mjs` from a source checkout. `decision` is an alias.
`--help` and `--version` do not access credentials or services.

## Commands

| Command | Behavior |
| --- | --- |
| `init [DIRECTORY]` | Create JSON config, sample request, environment template, and gitignore; never overwrite |
| `evaluate [FILE\|-]` | One evaluation; aliases `eval` and `ask` |
| `validate [FILE\|-]` | Validate input locally; does not call a provider |
| `schema [FILE\|-]` | Print the generative response schema for these questions; local only |
| `models` | List the configured provider's models; may be paginated |
| `batch FILE\|-` | Stream JSONL inputs and ordered JSONL result/error records |

No input filename on `evaluate`, `validate`, or `schema` selects the bundled sample,
not stdin. Use `-` explicitly for stdin. Empty invocation prints help. Configuration
and credential errors do not cause fallback to another backend.

```bash
cat request.json | jev-decision evaluate - --env-file .env --compact
jev-decision evaluate request.json --env-file .env --output result.json
jev-decision batch requests.jsonl --env-file .env --concurrency 4 --output results.jsonl
```

On PowerShell, `Get-Content -Raw request.json | jev-decision evaluate - --env-file .env`
is an alternative for stdin. File arguments avoid shell encoding differences.

## Flags

| Flag | Meaning |
| --- | --- |
| `--config FILE` | Explicit JSON configuration; never autodiscovered |
| `--env-file FILE` | Load an explicit environment file without changing the parent shell |
| `--provider NAME` | `jev`, `openai-compatible`, `openrouter`, `anthropic`, `custom` |
| `--model ID` | Overrides input JSON model and provider default |
| `--base-url URL` | Custom endpoint; requires explicit credential selection |
| `--api-key-env NAME` | Environment variable name, never the key itself |
| `--no-auth` | Only for a loopback OpenAI-compatible endpoint |
| `--timeout-ms N` | HTTP and adapter deadline for each evaluation/listing |
| `--retries N` | Number of additional eligible HTTP attempts; 0–10 |
| `--max-tokens N` | Generative output budget; default 4096 |
| `--response-format MODE` | `json_schema`, `json_object`, or `text`; compatible providers only |
| `--token-parameter NAME` | `max_completion_tokens` or `max_tokens` |
| `--provider-module FILE` | Explicit trusted ESM module; implies custom provider |
| `--input FILE` | Alternative to positional request filename |
| `--output FILE`, `-o FILE` | Atomic file output; `-` means stdout |
| `--force` | Replace existing output; valid only with `--output` |
| `--concurrency N` | Batch in-flight limit 1–64; default 4 |
| `--pretty`, `--compact` | JSON formatting; pretty by default; batches always JSONL |
| `--help`, `-h`, `--version`, `-v` | Informational commands |

Unknown or duplicate flags fail. Provider-inapplicable flags fail instead of being
ignored. `--model` wins over request.model; otherwise request.model wins over the
configured model. See [configuration](CONFIGURATION.md) for full precedence.

## JSON output contract

Single evaluation stdout is exactly the result object plus a newline. It is not
wrapped in a progress log or Markdown. Errors are `{ "error": { "code", "message",
... } }` on stderr. No debug stacks or raw HTTP error bodies are printed.

A batch emits one compact record per nonblank input line:

```text
{"line":1,"ok":true,"result":{...}}
{"line":2,"ok":false,"error":{"code":"VALIDATION_ERROR","message":"..."}}
```

This is a schematic shape, not an inference example. `line` is the original
one-based physical line number, including blank lines in the numbering. Blank
lines produce no record. Malformed JSON on a single line is a failed record and
processing continues. Evaluation failures likewise remain explicit records.

The CLI streams input with a bounded, ordered window. A completed oldest result
is emitted even when stdin remains open and the producer has not sent another
line; the window does not have to fill before output begins. A slow earlier request can
hold back emission and dispatch even when later requests finish; this prioritizes
bounded memory and stable ordering over maximum throughput. Up to `concurrency`
requests may already be running when a failure is encountered. There is no CLI
`stopOnError` flag; the SDK array batch API provides that policy.

Invalid UTF-8, input-size violations, unreadable input, or interrupted execution are
global failures. Work already sent to a provider may have been billed. Do not assume
that a failed batch sent no requests: unlike the SDK array API, streaming CLI input
is not entirely prevalidated before execution.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success; also a closed downstream pipe (EPIPE) |
| 1 | Provider/evaluation failure or at least one failed batch record |
| 2 | Usage, input, configuration, or filesystem failure |
| 130 | Caller interruption/cancellation, including handled SIGINT/SIGTERM |

Both signals are handled as cancellation by this CLI; it intentionally does not
use 143 for SIGTERM. Cancellation also interrupts a blocked stdout write. The
POSIX subprocess SIGINT check is excluded on Windows, where console signal
delivery needs separate validation.

## I/O and resource limits

Single JSON input: **8 MiB**. JSONL: **8 MiB per line, 64 MiB total**. Config:
**1 MiB**. Environment file: **64 KiB**. Provider request and response default to
8 MiB each, configurable to at most 64 MiB. These are client limits, not a promise
that every remote model has an equivalent context window.

Output files are written to a same-directory exclusive temporary file with mode
0600, synced, then committed. Existing paths are protected unless `--force` is
explicit. A batch containing ordinary failed records still produces a complete
JSONL file and exits 1. A global failure removes the unfinished temporary output.
Stdout cannot be rolled back and may contain a valid prefix after interruption.
No parent output directories are created automatically. Filesystems without hard
link support can reject no-clobber finalization; the error is explicit. File mode
and atomic filesystem semantics remain operating-system/filesystem dependent.

## Input and cancellation boundaries

String-valued flags cannot be empty or whitespace-only, including `--config`,
`--env-file`, `--input` and `--output`. Such values return `USAGE_ERROR` before
configuration loading or paid calls, rather than selecting an unintended default.
Valid paths with embedded spaces remain supported.

The input/output check resolves existing paths and file identities, so directory
symlinks/junctions and hard-link aliases cannot bypass the input-overwrite guard.
This is an accidental-overwrite safeguard, not a filesystem sandbox against
another process racing to change paths.

Already-cancelled CLI work does not initialize a project or create an output file.
File writers check cancellation before writes and before submitting the atomic
commit. A commit already submitted to the operating system cannot be undone;
cancellation does not roll back a completed write or remote inference billing.
