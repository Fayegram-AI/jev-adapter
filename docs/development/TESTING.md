# Testing

Run these commands from a source checkout. An installed npm package contains
runtime code and documentation, but does not contain tests or development scripts.

## Automated code and package checks

Use Node.js 22.16 or newer. Runtime and ordinary functional tests require no npm
dependencies. Type checking uses a local TypeScript compiler or `tsc` on PATH;
CI installs TypeScript 5.8.3. To use the same version:

```text
npm install --global typescript@5.8.3
```

| Command | Verification |
| --- | --- |
| `npm run check` | Public-source layout, JavaScript syntax, JSON, formatting, local doc links, versions |
| `npm test` | SDK, CLI, provider, and file/transport behavior using fixtures and loopback servers |
| `npm run test:coverage` | The functional suite with production source/bin coverage floors |
| `npm run typecheck` | Positive and expected-negative TypeScript API contracts |
| `npm run test:package` | Pack, offline install, package contents, docs, SDK, and offline CLI commands |
| `npm run build` | Retain a versioned npm tarball after checking its offline installation |
| `npm run verify` | Source checks, tests, type contracts, and package smoke check |

`verify` is a convenience command for routine changes. It already runs `npm test`
and `test:package`; running coverage and build immediately after it repeats
those checks. CI and the release guide run `check`, `test:coverage`,
`typecheck`, and `build` once each.

These commands validate code behavior and package integrity. Model-quality
evaluation is a separate activity, not part of the test suite: these commands do
not score model answers, measure provider speed, or use paid inference. Coverage
floors are 90% lines, 80% branches, and 85% functions. Coverage does not establish model
quality, correctness of every path, or current hosted compatibility.
The CI configuration targets Linux, Windows, and macOS on Node 22.16 and Node 24;
consult actual run results for a particular commit instead of treating the matrix
as evidence that every environment passed.

## Suite ownership

- `contract.test.mjs`: request/result contracts, builders, decision policy, and JSON safety.
- `adapter.test.mjs`: SDK evaluation, extensions, observers, deadlines, and batches.
- `providers.test.mjs`: provider wire formats, response parsing, model listing, and configuration.
- `transport.test.mjs`: HTTP policy, limits, retries, cancellation, and deadlines.
- `config.test.mjs`: file/environment/flag precedence and provider transitions.
- `cli.test.mjs`: commands, streams, exit codes, modules, and signals.
- `io.test.mjs`: atomic output, file aliases, and cancellation.
- `ordered.test.mjs`: ordered streaming and bounded concurrency.
- `support.mjs` and `fixtures.mjs`: local test setup and synthetic domain data.
- `types.mts`, `providers.types.mts`: public type inference and rejected API usage.

Node's reported test count includes each row of a parameterized input table. It
is not a count of independent features; retain separate rows when they protect
different contract or protocol paths.

All model responses used by ordinary tests are synthetic. HTTP integration servers
listen on loopback. Tests do not require account keys or make paid model calls.
Test workspaces are temporary.

## Optional authenticated provider smoke check

Live inference is explicitly opted in and can incur charges. Configure credentials
locally, then on POSIX shells:

```bash
RUN_LIVE_TESTS=1 npm run smoke:live -- --env-file .env
```

On PowerShell:

```powershell
$env:RUN_LIVE_TESTS = '1'
npm run smoke:live -- --env-file .env
Remove-Item Env:RUN_LIVE_TESTS
```

Forward provider/model/config options for the selected account. The helper refuses
to infer without the opt-in flag and returns real results or errors. It checks a
configured inference path, not model quality or throughput. For model listing
alone, use `node bin/jev.mjs models --env-file .env`.

## Package verification

To test a specific local tarball against this source checkout:

```text
node scripts/package-smoke.mjs --tarball /path/to/fayegram-ai-jev-adapter-VERSION.tgz
```

The check installs the specified archive offline and compares installed bytes,
documentation links, exports, CLI shims, and the bundled sample. It also rejects
local archives and development-only files leaking into the runtime package.
