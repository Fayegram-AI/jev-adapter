# Platforms and installation

## Compatibility and verification

The server-side JavaScript SDK and optional command runner target native Windows, macOS and Linux with
Node.js **22.16 or newer**. Runtime uses Node built-ins, with no native add-ons,
third-party runtime dependencies, compilation step or Bash dependency. WSL is not
required. This is a Node package, not a standalone `.exe`, `.app`, or browser SDK.

For application integration, follow the [SDK quickstart](GETTING_STARTED.md).
The shell-specific source commands below are for working in a source checkout.

The CI matrix targets Windows, macOS, and Linux with Node 22.16 and Node 24.
Consult run results for the exact commit and environment being evaluated;
the matrix itself is not a completed platform check. ARM machines require a
compatible native Node runtime. See [testing](../development/TESTING.md).

## Windows / PowerShell

Open PowerShell at the cloned repository or extracted source directory:

```powershell
cd "C:\path\to\jev-adapter-0.1.0"
node --version
node bin/jev.mjs validate examples/request.json
Copy-Item .env.example .env
notepad .env
```

Replace the placeholder value for `TYPESAFE_API_KEY` in `.env` and save it locally.
The following file-based commands work without shell-specific continuation or
stdin encoding rules:

```powershell
node bin/jev.mjs models --env-file .env
node bin/jev.mjs evaluate examples/request.json --env-file .env
```

`npm run models` and `npm run ask` are equivalent convenience commands. If a local
PowerShell execution policy blocks the npm PowerShell shim, use `npm.cmd test` /
`npm.cmd run ask`, or the direct `node` commands above. Do not weaken your system's
execution policy merely to run this project. Paths containing spaces should be
quoted. A project copied across operating systems should be re-extracted from
the archive rather than reusing generated `node_modules` or executable shims.

## macOS / Linux

```bash
cd "/path/to/jev-adapter-0.1.0"
node --version
node bin/jev.mjs validate examples/request.json
cp .env.example .env
```

Edit `.env` locally, then:

```bash
node bin/jev.mjs models --env-file .env
node bin/jev.mjs evaluate examples/request.json --env-file .env
```

Use a currently maintained, compatible Node release according to your organization’s
runtime policy; the minimum here describes this package's API requirements, not a
security recommendation to remain on an old patch release.

## Install in another project

Install the package from npm in the consuming project:

```text
npm install @fayegram-ai/jev-adapter
```

Import from `@fayegram-ai/jev-adapter` in ESM JavaScript, or invoke the installed
command runner through npm from your application directory:

```text
npm exec -- jev-decision --version
npm exec -- jev-decision init ./my-decisions
npm exec -- jev-decision validate ./my-decisions/request.json
```

A CommonJS application can use `await import('@fayegram-ai/jev-adapter')` from an async
function; this package exports an ESM entry point, not a native `require()` entry.
The runtime package includes implementation, examples, type declarations and
maintained documentation. Use a source checkout for tests and CI. Node/npm and
the development TypeScript compiler are external prerequisites, not bundled
executables.

## Filesystems, streams, and limits

Output files use exclusive temporary files and no-clobber finalization by default.
Some filesystems do not support hard links; such no-clobber output fails explicitly
rather than falling back to overwriting. Unix mode 0600 is applied where supported;
on Windows, secure the working directory using your normal Windows permissions.

Input/output JSON is UTF-8. File arguments are the most portable way to avoid
shell pipeline encoding differences. A POSIX subprocess test covers SIGINT;
Windows console signal delivery still needs native validation.
Cancellation can stop waiting and close a blocked CLI output pipe, but cannot undo
an API request that already ran or force arbitrary custom-provider resources to
terminate. See [CLI I/O](../reference/CLI.md).
