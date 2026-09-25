import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { AdapterError, requireCondition as check } from '../errors.mjs';
import { cloneJson, isRecord } from '../validation.mjs';
import { deadline, withSignal, abortError } from '../async.mjs';
import { createProvider } from '../providers/index.mjs';

const FIELDS = new Set(['schemaVersion', 'provider', 'model', 'baseURL', 'apiKeyEnv', 'noAuth',
  'timeoutMs', 'maxRetries', 'maxRequestBytes', 'maxResponseBytes', 'maxTokens', 'responseFormat',
  'tokenParameter', 'parameters', 'module', 'options']);
const ENV_FIELDS = {
  DECISION_PROVIDER: 'provider', DECISION_MODEL: 'model', DECISION_BASE_URL: 'baseURL',
  DECISION_API_KEY_ENV: 'apiKeyEnv', DECISION_TIMEOUT_MS: 'timeoutMs',
  DECISION_MAX_RETRIES: 'maxRetries', DECISION_RESPONSE_FORMAT: 'responseFormat',
};
const NUMERIC = new Set(['timeoutMs', 'maxRetries', 'maxRequestBytes', 'maxResponseBytes', 'maxTokens']);
const KEY_ENVS = { jev: 'TYPESAFE_API_KEY', 'openai-compatible': 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY', anthropic: 'ANTHROPIC_API_KEY' };

async function boundedFile(path, maxBytes, label) {
  try {
    const info = await stat(path);
    check(info.isFile() && info.size <= maxBytes, `${label} must be a regular file within its size limit.`, 'CONFIGURATION_ERROR');
    const buffer = await readFile(path);
    check(buffer.length <= maxBytes, `${label} exceeds its size limit.`, 'CONFIGURATION_ERROR');
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (error) {
    if (error instanceof AdapterError) throw error;
    throw new AdapterError(`Cannot read ${label}; check its path, permissions, and UTF-8 encoding.`, { code: 'CONFIGURATION_ERROR' });
  }
}

export function validateConfig(input) {
  const config = cloneJson(input, 'configuration', 'CONFIGURATION_ERROR');
  check(isRecord(config) && Object.keys(config).every(key => FIELDS.has(key)),
    'Configuration contains an unknown field; inline credentials are not permitted.', 'CONFIGURATION_ERROR');
  check(config.schemaVersion === undefined || config.schemaVersion === 1,
    'Unsupported configuration schemaVersion.', 'CONFIGURATION_ERROR');
  check(config.provider === undefined || ['jev', 'openai-compatible', 'openrouter', 'anthropic', 'custom'].includes(config.provider),
    'Unknown configured provider.', 'CONFIGURATION_ERROR');
  for (const field of ['model', 'baseURL', 'apiKeyEnv', 'module']) {
    check(config[field] === undefined || (typeof config[field] === 'string' && config[field].trim()),
      'Configuration string fields must be nonempty.', 'CONFIGURATION_ERROR');
  }
  if (config.apiKeyEnv !== undefined) check(/^[A-Za-z_][A-Za-z0-9_]*$/.test(config.apiKeyEnv),
    'apiKeyEnv must name an environment variable, not contain a credential.', 'CONFIGURATION_ERROR');
  check(config.noAuth === undefined || typeof config.noAuth === 'boolean', 'noAuth must be boolean.', 'CONFIGURATION_ERROR');
  for (const field of NUMERIC) {
    if (config[field] === undefined) continue;
    check(Number.isSafeInteger(config[field]), 'Numeric configuration fields must be safe integers.', 'CONFIGURATION_ERROR');
    const min = field === 'maxRetries' ? 0 : 1;
    const max = field === 'maxRetries' ? 10 : field === 'maxTokens' ? 1048576
      : field.endsWith('Bytes') ? 67108864 : 2147483647;
    check(config[field] >= min && config[field] <= max, 'Numeric configuration field is out of range.', 'CONFIGURATION_ERROR');
  }
  check(config.responseFormat === undefined || ['json_schema', 'json_object', 'text'].includes(config.responseFormat),
    'Unsupported responseFormat.', 'CONFIGURATION_ERROR');
  check(config.tokenParameter === undefined || ['max_tokens', 'max_completion_tokens'].includes(config.tokenParameter),
    'Unsupported tokenParameter.', 'CONFIGURATION_ERROR');
  for (const field of ['parameters', 'options']) check(config[field] === undefined || isRecord(config[field]),
    'parameters and options must be JSON objects.', 'CONFIGURATION_ERROR');
  return config;
}

/** Explicit file only. Flags > DECISION_* environment > file > defaults. */
export async function loadConfig({ configPath, envFile, overrides = {}, cwd = process.cwd(), env = process.env } = {}) {
  const effectiveEnv = { ...env };
  if (envFile) {
    const text = await boundedFile(resolve(cwd, envFile), 65536, 'environment file');
    let parsed;
    try { parsed = parseEnv(text); }
    catch { throw new AdapterError('Invalid environment file.', { code: 'CONFIGURATION_ERROR' }); }
    for (const [key, value] of Object.entries(parsed)) if (effectiveEnv[key] === undefined) effectiveEnv[key] = value;
  }
  let fileConfig = {};
  let moduleBase = cwd;
  if (configPath) {
    const path = resolve(cwd, configPath);
    const text = await boundedFile(path, 1048576, 'configuration file');
    try { fileConfig = JSON.parse(text); }
    catch { throw new AdapterError('Configuration file is not valid JSON.', { code: 'CONFIGURATION_ERROR' }); }
    fileConfig = validateConfig(fileConfig);
    moduleBase = dirname(path);
  }
  const environment = {};
  for (const [key, field] of Object.entries(ENV_FIELDS)) {
    if (effectiveEnv[key] === undefined) continue;
    const value = effectiveEnv[key];
    if (NUMERIC.has(field)) check(typeof value === 'string' && /^\d+$/.test(value),
      'Numeric DECISION_* variables must contain decimal integers.', 'CONFIGURATION_ERROR');
    environment[field] = NUMERIC.has(field) ? Number(value) : value;
  }
  // Merge each precedence layer separately. A flag switching away from an
  // environment-selected provider must not inherit that provider's key/endpoint.
  function mergeProviderLayer(base, layer) {
    const next = { ...base };
    if (layer.provider !== undefined && layer.provider !== (base.provider ?? 'jev')) {
      for (const key of ['baseURL', 'apiKeyEnv', 'model', 'maxTokens', 'parameters',
        'responseFormat', 'tokenParameter', 'module', 'options', 'noAuth']) delete next[key];
      // Custom providers own their transport options; only the adapter timeout
      // has a shared meaning across custom/built-in boundaries.
      if (layer.provider === 'custom' || base.provider === 'custom') {
        for (const key of ['maxRetries', 'maxRequestBytes', 'maxResponseBytes']) delete next[key];
      }
    }
    return { ...next, ...layer };
  }
  if (overrides.module !== undefined) moduleBase = cwd;
  const config = validateConfig(mergeProviderLayer(mergeProviderLayer(
    { schemaVersion: 1, provider: 'jev', ...fileConfig }, environment), overrides));
  if (config.provider === 'jev' && config.model === undefined && effectiveEnv.JEV_MODEL?.trim()) {
    config.model = effectiveEnv.JEV_MODEL.trim();
  }
  return { config, env: effectiveEnv, moduleBase };
}

export async function configuredProvider({ config, env, moduleBase }, { signal } = {}) {
  const type = config.provider ?? 'jev';
  const keyEnv = config.apiKeyEnv ?? KEY_ENVS[type];
  const isCustomURL = config.baseURL !== undefined;
  // A custom endpoint must explicitly choose its credential source.
  check(!isCustomURL || config.apiKeyEnv !== undefined || config.noAuth === true,
    'A custom baseURL requires apiKeyEnv or explicit noAuth.', 'CONFIGURATION_ERROR');
  check(!config.noAuth || type === 'openai-compatible', 'noAuth is supported only for local OpenAI-compatible endpoints.', 'CONFIGURATION_ERROR');
  const apiKey = config.noAuth ? null : keyEnv ? env[keyEnv] : undefined;
  if (type === 'custom') {
    check(config.module, 'custom provider requires an explicit module path.', 'CONFIGURATION_ERROR');
    check(['baseURL', 'maxRetries', 'maxRequestBytes', 'maxResponseBytes', 'maxTokens',
      'responseFormat', 'tokenParameter', 'parameters', 'noAuth'].every(key => config[key] === undefined),
    'Custom provider transport/generation settings belong inside options.', 'CONFIGURATION_ERROR');
    const budget = deadline(config.timeoutMs ?? 30000, signal);
    try {
      if (budget.signal.aborted) throw abortError();
      let namespace;
      try { namespace = await withSignal(import(pathToFileURL(resolve(moduleBase, config.module)).href), budget.signal); }
      catch { throw new AdapterError('Cannot load the explicitly configured provider module.', { code: 'CONFIGURATION_ERROR' }); }
      const factory = namespace.createProvider;
      check(typeof factory === 'function', 'Provider module must export createProvider(options).', 'CONFIGURATION_ERROR');
      try {
        return await withSignal(Promise.resolve().then(() => factory({ ...config.options,
          ...(apiKey === undefined ? {} : { apiKey }), ...(config.model === undefined ? {} : { model: config.model }) })), budget.signal);
      } catch { throw new AdapterError('Custom provider initialization failed.', { code: 'CONFIGURATION_ERROR' }); }
    } catch (error) {
      if (signal?.aborted) throw abortError();
      if (budget.timedOut) throw new AdapterError('Custom provider initialization deadline exceeded.', { code: 'TIMEOUT' });
      throw error;
    } finally { budget.close(); }
  }
  check(!config.module && !config.options, 'module/options require provider custom.', 'CONFIGURATION_ERROR');
  if (type === 'jev') check(config.maxTokens === undefined && config.parameters === undefined &&
    config.responseFormat === undefined && config.tokenParameter === undefined,
  'Generation settings are not supported by the native Jev provider.', 'CONFIGURATION_ERROR');
  if (type === 'anthropic') check(config.responseFormat === undefined && config.tokenParameter === undefined,
    'Anthropic uses its native forced-tool response format.', 'CONFIGURATION_ERROR');
  if (type === 'openrouter') check(config.baseURL === undefined,
    'The OpenRouter preset has a fixed endpoint; use openai-compatible for another gateway.', 'CONFIGURATION_ERROR');
  const options = Object.fromEntries(Object.entries(config).filter(([key]) => ![
    'schemaVersion', 'provider', 'apiKeyEnv', 'noAuth', 'module', 'options',
  ].includes(key)));
  // Explicitly pass a missing key as an empty value: do not fall back to process.env,
  // which might differ from the environment file/testing environment we resolved.
  return createProvider({ type, ...options, apiKey: apiKey === undefined ? '' : apiKey });
}
