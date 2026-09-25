import { optionsObject } from './options.mjs';
import { setTimeout as sleep } from 'node:timers/promises';
import { AdapterError, requireCondition as check } from './errors.mjs';
import { deadline, withSignal } from './async.mjs';

const RETRY_STATUSES = new Set([429, 502, 503, 504, 529]);
const MAX_BYTES = 64 * 1024 * 1024;

export function parseBaseURL(baseURL, { originOnly = false } = {}) {
  check(typeof baseURL === 'string' && !baseURL.includes('\\'), 'Invalid baseURL.', 'CONFIGURATION_ERROR');
  let url;
  try { url = new URL(baseURL); }
  catch { throw new AdapterError('Invalid baseURL.', { code: 'CONFIGURATION_ERROR' }); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  check(url.protocol === 'https:' || (url.protocol === 'http:' && loopback),
    'Use HTTPS; HTTP is permitted only for loopback endpoints.', 'CONFIGURATION_ERROR');
  check(!url.username && !url.password && !url.search && !url.hash,
    'baseURL must not contain credentials, a query, or a fragment.', 'CONFIGURATION_ERROR');
  check(!originOnly || url.pathname === '/', 'This provider requires an origin-only baseURL.', 'CONFIGURATION_ERROR');
  return { baseURL: url.href.replace(/\/+$/, ''), loopback, origin: url.origin };
}

export function validateApiKey(value, label = 'API key') {
  check(typeof value === 'string' && value.trim().length > 0 && !/[\x00-\x20\x7f]/.test(value.trim()) &&
    !/^(replace_with_|your_actual_|your_real_|paste_)/i.test(value.trim()),
  `Set ${label} or supply a valid apiKey.`, 'CONFIGURATION_ERROR');
  return value.trim();
}

export function sanitizeId(value, secrets = []) {
  if (typeof value !== 'string') return undefined;
  let safe = value;
  for (const secret of secrets) if (secret) safe = safe.split(secret).join('[REDACTED]');
  return safe.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200) || undefined;
}

function retryDelay(headers, attempt) {
  const raw = headers.get('retry-after');
  if (raw !== null) {
    const seconds = Number(raw);
    const milliseconds = raw.trim() !== '' && Number.isFinite(seconds)
      ? seconds * 1000 : Date.parse(raw) - Date.now();
    if (Number.isFinite(milliseconds) && milliseconds >= 0) return milliseconds;
  }
  return Math.min(8000, 250 * 2 ** attempt) * (0.5 + Math.random());
}

async function readJson(response, maxBytes, signal) {
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) > maxBytes) {
    response.body?.cancel().catch(() => {});
    throw new AdapterError('Provider response exceeds the byte limit.', { code: 'RESPONSE_TOO_LARGE' });
  }
  const reader = response.body?.getReader();
  check(reader, 'Provider returned an empty body.', 'INVALID_RESPONSE');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await withSignal(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      check(size <= maxBytes, 'Provider response exceeds the byte limit.', 'RESPONSE_TOO_LARGE');
      chunks.push(Buffer.from(value));
    }
  } finally {
    // Do not await a malicious/custom stream's non-settling cancellation callback.
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw new AdapterError('Provider returned invalid UTF-8 or JSON.', { code: 'INVALID_RESPONSE' }); }
}

/** Shared bounded JSON transport. Provider-specific wire shapes live elsewhere. */
export class JsonTransport {
  #baseURL;
  #headers;
  #fetch;
  #options;
  #secrets;

  constructor({ baseURL, headers = {}, secrets = [], timeoutMs = 30000, maxRetries = 2,
    maxRequestBytes = 8 * 1024 * 1024, maxResponseBytes = 8 * 1024 * 1024,
    fetchImpl = globalThis.fetch } = {}) {
    this.#baseURL = parseBaseURL(baseURL).baseURL;
    check(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 2147483647,
      'timeoutMs must be a positive 32-bit integer.', 'CONFIGURATION_ERROR');
    check(Number.isSafeInteger(maxRetries) && maxRetries >= 0 && maxRetries <= 10,
      'maxRetries must be an integer from 0 to 10.', 'CONFIGURATION_ERROR');
    for (const bytes of [maxRequestBytes, maxResponseBytes]) {
      check(Number.isSafeInteger(bytes) && bytes > 0 && bytes <= MAX_BYTES,
        'Byte limits must be integers in [1, 67108864].', 'CONFIGURATION_ERROR');
    }
    check(typeof fetchImpl === 'function', 'fetchImpl must be a function.', 'CONFIGURATION_ERROR');
    this.#headers = Object.freeze({ ...headers });
    this.#secrets = [...secrets];
    this.#fetch = fetchImpl;
    this.#options = { timeoutMs, maxRetries, maxRequestBytes, maxResponseBytes };
  }

  async request(method, path, body, callOptions = {}) {
    const { signal } = optionsObject(callOptions, ['signal'], 'Provider call options');
    check(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') &&
      !/[\\?#]/.test(path), 'Invalid provider request path.', 'CONFIGURATION_ERROR');
    const started = performance.now();
    const budget = deadline(this.#options.timeoutMs, signal);
    let attempts = 0;
    let lastRequestId;
    try {
      const serialized = body === undefined ? undefined : JSON.stringify(body);
      check(serialized === undefined || Buffer.byteLength(serialized) <= this.#options.maxRequestBytes,
        'Provider request exceeds the byte limit.', 'REQUEST_TOO_LARGE');
      for (let retry = 0; ; retry++) {
        budget.signal.throwIfAborted();
        attempts++;
        const response = await withSignal(this.#fetch(`${this.#baseURL}${path}`, {
          method,
          headers: { accept: 'application/json', ...this.#headers,
            ...(serialized === undefined ? {} : { 'content-type': 'application/json' }) },
          body: serialized,
          signal: budget.signal,
          redirect: 'error',
        }), budget.signal);
        lastRequestId = sanitizeId(response.headers.get('x-request-id') ?? response.headers.get('request-id'), this.#secrets);
        if (response.ok) {
          const data = await readJson(response, this.#options.maxResponseBytes, budget.signal);
          return { data, meta: {
            attempts,
            durationMs: Math.round((performance.now() - started) * 1000) / 1000,
            ...(lastRequestId ? { requestId: lastRequestId } : {}),
          } };
        }
        response.body?.cancel().catch(() => {});
        if (!RETRY_STATUSES.has(response.status) || retry >= this.#options.maxRetries) {
          throw new AdapterError(`Provider returned HTTP ${response.status}.`, {
            code: 'HTTP_ERROR', status: response.status, attempts,
            ...(lastRequestId ? { requestId: lastRequestId } : {}),
          });
        }
        const delay = retryDelay(response.headers, retry);
        const remaining = this.#options.timeoutMs - (performance.now() - started);
        if (delay >= remaining) throw new AdapterError('Retry delay exceeds the remaining request deadline.', {
          code: 'RETRY_BUDGET_EXCEEDED', status: response.status, attempts,
          ...(lastRequestId ? { requestId: lastRequestId } : {}),
        });
        await sleep(delay, undefined, { signal: budget.signal });
      }
    } catch (error) {
      const diagnostics = { attempts, ...(lastRequestId ? { requestId: lastRequestId } : {}) };
      if (signal?.aborted) throw new AdapterError('Request cancelled by caller.', { code: 'ABORTED', ...diagnostics });
      if (budget.timedOut) throw new AdapterError('Provider request deadline exceeded.', { code: 'TIMEOUT', ...diagnostics });
      if (error instanceof AdapterError) {
        error.attempts ??= attempts;
        if (lastRequestId) error.requestId ??= lastRequestId;
        throw error;
      }
      throw new AdapterError('Network request failed; no automatic network retry was made.', {
        code: 'NETWORK_ERROR', attempts,
      });
    } finally { budget.close(); }
  }
}
