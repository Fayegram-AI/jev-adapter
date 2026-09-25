import { parseArgs } from 'node:util';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, unlink, lstat } from 'node:fs/promises';
import { AdapterError, requireCondition as check, publicError } from '../errors.mjs';
import { createAdapter } from '../adapter.mjs';
import { abortError } from '../async.mjs';
import { VERSION } from '../version.mjs';
import { validateRequest } from '../validation.mjs';
import { buildResponseSchema } from '../schema.mjs';
import { loadConfig, configuredProvider } from './config.mjs';
import { assertDistinctFiles, createWriter, readJson, readJsonLines } from './io.mjs';
import { mapOrdered } from './ordered.mjs';

const SAMPLE_PATH = fileURLToPath(new URL('../../examples/request.json', import.meta.url));
const BOOLS = ['help', 'version', 'pretty', 'compact', 'no-auth', 'force'];
const STRINGS = ['config', 'env-file', 'provider', 'model', 'base-url', 'api-key-env', 'timeout-ms',
  'retries', 'max-tokens', 'response-format', 'token-parameter', 'input', 'output', 'concurrency', 'provider-module'];
const FIELD_MAP = { provider: 'provider', model: 'model', 'base-url': 'baseURL', 'api-key-env': 'apiKeyEnv',
  'timeout-ms': 'timeoutMs', retries: 'maxRetries', 'max-tokens': 'maxTokens',
  'response-format': 'responseFormat', 'token-parameter': 'tokenParameter', 'provider-module': 'module' };

export const HELP = `jev-decision ${VERSION} — typed decisions, Jev by default

Usage:
  jev-decision init [directory] [--provider NAME] [--model MODEL]
  jev-decision evaluate [request.json | -] [options]    (aliases: eval, ask)
  jev-decision validate [request.json | -] [options]    (offline)
  jev-decision schema [request.json | -] [options]      (offline generative schema)
  jev-decision models [options]
  jev-decision batch requests.jsonl [--concurrency 4] [options]

Providers: jev, openai-compatible, openrouter, anthropic, custom

Options:
  --config FILE             Explicit JSON configuration; never auto-discovered
  --env-file FILE           Explicit .env file; existing environment takes precedence
  --provider NAME           Select backend; default jev
  --model ID                Override even the model in the input request
  --base-url URL            API base URL; custom endpoints need --api-key-env
  --api-key-env NAME        Read credential from this environment variable
  --no-auth                 Local OpenAI-compatible endpoint only
  --timeout-ms N            End-to-end evaluation/provider deadline
  --retries N               HTTP retry count, 0–10; default 2
  --max-tokens N            Generative output-token budget; default 4096
  --response-format FORMAT  json_schema (default), json_object, or text
  --token-parameter NAME    max_completion_tokens or max_tokens
  --provider-module FILE    Explicit trusted local ESM provider module
  --input FILE              Alternative to positional request filename
  --output FILE, -o FILE    Atomic file output (0600); default stdout
  --force                   Explicitly replace an existing --output file
  --concurrency N           Batch maximum in-flight calls, 1–64; default 4
  --pretty / --compact      JSON layout; default pretty (batch is always JSONL)
  --help, -h / --version, -v

Without an input file, evaluate/validate/schema use the bundled sample.
No credentials, file reads, or network calls are needed for help/version.
All API calls are explicit; evaluate/models/batch may access paid services.
Exit codes: 0 success; 1 provider/partial-batch failure; 2 input/config/IO;
            130 interrupted. A closed downstream pipe exits 0.
`;

function argumentsFor(argv) {
  try {
    const options = Object.fromEntries([
      ...BOOLS.map(name => [name, { type: 'boolean', ...(name === 'help' ? { short: 'h' } : name === 'version' ? { short: 'v' } : {}) }]),
      ...STRINGS.map(name => [name, { type: 'string', ...(name === 'output' ? { short: 'o' } : {}) }]),
    ]);
    const parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true, tokens: true });
    const seen = new Set();
    for (const token of parsed.tokens) if (token.kind === 'option') {
      check(!seen.has(token.name), 'Duplicate CLI option.', 'USAGE_ERROR');
      seen.add(token.name);
    }
    for (const name of STRINGS) if (parsed.values[name] !== undefined) {
      check(parsed.values[name].trim().length > 0, 'String CLI options must not be empty.', 'USAGE_ERROR');
    }
    return parsed;
  } catch (error) {
    if (error instanceof AdapterError) throw error;
    throw new AdapterError('Invalid CLI arguments. Run --help for supported options.', { code: 'USAGE_ERROR' });
  }
}

function overridesFor(values) {
  const overrides = {};
  for (const [flag, field] of Object.entries(FIELD_MAP)) if (values[flag] !== undefined) {
    const value = values[flag];
    if (['timeoutMs', 'maxRetries', 'maxTokens'].includes(field)) {
      check(/^\d+$/.test(value), 'Numeric flags require decimal integers.', 'USAGE_ERROR');
      overrides[field] = Number(value);
    } else overrides[field] = value;
  }
  if (values['no-auth']) overrides.noAuth = true;
  if (overrides.module !== undefined) {
    check(overrides.provider === undefined || overrides.provider === 'custom',
      '--provider-module requires provider custom.', 'USAGE_ERROR');
    overrides.provider = 'custom';
  }
  return overrides;
}

async function initialize(directory, config) {
  check(config.provider !== 'custom', 'Configure custom providers explicitly after initialization.', 'CONFIGURATION_ERROR');
  try { await mkdir(directory, { recursive: true }); }
  catch { throw new AdapterError('Cannot create initialization directory.', { code: 'IO_ERROR' }); }
  const defaultKey = { jev: 'TYPESAFE_API_KEY', 'openai-compatible': 'OPENAI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY', anthropic: 'ANTHROPIC_API_KEY' }[config.provider];
  const template = { ...config, apiKeyEnv: config.apiKeyEnv ?? defaultKey,
    ...(config.provider === 'jev' && config.model === undefined ? { model: 'jev-latest' } : {}) };
  const request = { state: "ModuleNotFoundError: No module named 'pytest'", questions: {
    category: { type: 'choice', instructions: 'Classify the failure using only the supplied evidence.',
      criteria: { dependency: 'A required package or module is unavailable.',
        network: 'A network operation failed.', assertion: 'A test assertion failed.', unknown: 'Insufficient evidence.' } },
    missing_dependency: { type: 'noul', instructions: 'Does this indicate a missing Python package?' },
  } };
  const files = {
    'decision.config.json': JSON.stringify(template, null, 2) + '\n',
    'request.json': JSON.stringify(request, null, 2) + '\n',
    '.env.example': `${template.apiKeyEnv}=replace_with_your_api_key\n`,
    '.gitignore': '.env\n.env.*\n!.env.example\nnode_modules/\n*.tmp\n',
  };
  for (const name of Object.keys(files)) {
    try { await lstat(join(directory, name)); throw new AdapterError('Initialization would overwrite existing files.', { code: 'IO_ERROR' }); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
  }
  const created = [];
  try {
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(directory, name), content, { flag: 'wx', mode: 0o600 });
      created.push(name);
    }
  } catch {
    await Promise.all(created.map(name => unlink(join(directory, name)).catch(() => {})));
    throw new AdapterError('Cannot initialize files; existing files were preserved.', { code: 'IO_ERROR' });
  }
  return { initialized: true, directory, files: Object.keys(files), provider: template.provider };
}

const INPUT_CODES = new Set(['USAGE_ERROR', 'CONFIGURATION_ERROR', 'VALIDATION_ERROR', 'IO_ERROR', 'INPUT_TOO_LARGE', 'REQUEST_TOO_LARGE']);
export function exitCode(error) {
  return error?.code === 'ABORTED' ? 130 : INPUT_CODES.has(error?.code) ? 2 : 1;
}

function scrub(value, env, explicitSecret) {
  const secrets = Object.entries(env).filter(([name, secret]) => typeof secret === 'string' &&
    secret.length >= 4 && /(?:KEY|TOKEN|SECRET|PASSWORD)/i.test(name)).map(([, secret]) => secret);
  if (typeof explicitSecret === 'string' && explicitSecret) secrets.push(explicitSecret);
  function visit(item) {
    if (typeof item === 'string') {
      for (const secret of secrets) item = item.split(secret).join('[REDACTED]');
      return item;
    }
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child)]));
    return item;
  }
  return visit(value);
}

export async function runCli(argv, { stdin = process.stdin, stdout = process.stdout, stderr = process.stderr,
  cwd = process.cwd(), env = process.env, signal } = {}) {
  let writer;
  let activeEnv = env;
  let explicitSecret;
  const internal = new AbortController();
  const cancelled = () => internal.abort();
  if (signal?.aborted) cancelled();
  signal?.addEventListener('abort', cancelled, { once: true });
  try {
    const { values, positionals } = argumentsFor(argv);
    if (values.help || (positionals.length === 0 && !values.version)) { stdout.write(HELP); return 0; }
    if (values.version) { stdout.write(VERSION + '\n'); return 0; }
    const aliases = { eval: 'evaluate', ask: 'evaluate' };
    const command = aliases[positionals[0]] ?? positionals[0];
    if (command === 'help') { stdout.write(HELP); return 0; }
    if (internal.signal.aborted) throw abortError();
    check(['evaluate', 'validate', 'schema', 'models', 'init', 'batch'].includes(command), 'Unknown command. Run --help.', 'USAGE_ERROR');
    check(positionals.length <= (command === 'models' ? 1 : 2), 'Too many positional arguments.', 'USAGE_ERROR');
    check(!(values.input && positionals[1]), 'Supply either --input or a positional file, not both.', 'USAGE_ERROR');
    check(!(values.pretty && values.compact), 'Choose --pretty or --compact, not both.', 'USAGE_ERROR');
    check(!values.concurrency || command === 'batch', '--concurrency applies only to batch.', 'USAGE_ERROR');
    check(!values.force || (values.output && values.output !== '-'), '--force requires a file output.', 'USAGE_ERROR');
    check(command !== 'init' || (!values.input && !values.output), 'init does not accept --input or --output.', 'USAGE_ERROR');
    check(command !== 'models' || !values.input, 'models does not accept --input.', 'USAGE_ERROR');
    let concurrency;
    if (command === 'batch') {
      check(values.input || positionals[1], 'batch requires an explicit JSONL filename or -.', 'USAGE_ERROR');
      check(values.concurrency === undefined || /^\d+$/.test(values.concurrency), 'concurrency requires a decimal integer.', 'USAGE_ERROR');
      concurrency = Number(values.concurrency ?? 4);
      check(Number.isSafeInteger(concurrency) && concurrency >= 1 && concurrency <= 64,
        'concurrency must be from 1 to 64.', 'USAGE_ERROR');
    }
    const loaded = await loadConfig({ configPath: values.config, envFile: values['env-file'],
      overrides: overridesFor(values), cwd, env });
    activeEnv = loaded.env;
    explicitSecret = loaded.config.apiKeyEnv ? activeEnv[loaded.config.apiKeyEnv] : undefined;
    const inputPath = values.input ?? positionals[1] ?? SAMPLE_PATH;
    if (values.output && values.output !== '-' && inputPath !== '-') {
      await assertDistinctFiles(inputPath, values.output, cwd);
    }
    writer = await createWriter({ output: values.output, force: values.force, stdout, cwd, signal: internal.signal });
    const writeJson = value => writer.write(JSON.stringify(value, null, values.compact ? 0 : 2) + '\n');
    const context = { stdin, cwd, signal: internal.signal };
    const withModel = input => values.model === undefined ? input :
      (input && typeof input === 'object' && !Array.isArray(input) ? { ...input, model: values.model } : input);
    if (command === 'init') {
      await writeJson(await initialize(resolve(cwd, positionals[1] ?? '.'), loaded.config));
    } else if (command === 'validate' || command === 'schema') {
      const raw = withModel(await readJson(inputPath, context));
      const selectedModel = raw?.model ?? loaded.config.model ?? (loaded.config.provider === 'jev' ? 'jev-latest' : null);
      const request = validateRequest(raw, selectedModel ?? 'validation-only');
      await writeJson(command === 'schema' ? buildResponseSchema(request.questions)
        : { valid: true, questionCount: Object.keys(request.questions).length, model: selectedModel });
    } else {
      let request;
      if (command === 'evaluate') {
        // Validate before constructing a provider or issuing any network request.
        request = withModel(await readJson(inputPath, context));
        // Validate structure without inventing the custom provider's default model.
        // The actual model is resolved by adapter.evaluate after provider creation.
        validateRequest(request, loaded.config.model ?? 'validation-only');
      }
      const provider = await configuredProvider(loaded, { signal: internal.signal });
      const adapter = createAdapter({ provider, timeoutMs: loaded.config.timeoutMs ?? 60000 });
      if (command === 'models') await writeJson(await adapter.listModels({ signal: internal.signal }));
      else if (command === 'evaluate') await writeJson(await adapter.evaluate(request, { signal: internal.signal }));
      else {
        let failed = false;
        async function evaluateLine(row) {
          if (row.error) return { line: row.line, ok: false, error: row.error };
          try { return { line: row.line, ok: true, result: await adapter.evaluate(withModel(row.input), { signal: internal.signal }) }; }
          catch (error) { return { line: row.line, ok: false, error: scrub(publicError(error), activeEnv, explicitSecret) }; }
        }
        try {
          for await (const record of mapOrdered(readJsonLines(inputPath, context), evaluateLine,
            { concurrency, signal: internal.signal })) {
            if (!record.ok) failed = true;
            await writer.write(JSON.stringify(record) + '\n');
          }
        } catch (error) {
          internal.abort();
          throw error;
        }
        await writer.finish();
        return internal.signal.aborted ? 130 : failed ? 1 : 0;
      }
    }
    await writer.finish();
    return 0;
  } catch (error) {
    internal.abort();
    await writer?.abort();
    if (error?.code === 'EPIPE') return 0;
    const safe = scrub(publicError(error), activeEnv, explicitSecret);
    stderr.write(JSON.stringify({ error: safe }) + '\n');
    return exitCode(error);
  } finally { signal?.removeEventListener('abort', cancelled); }
}
