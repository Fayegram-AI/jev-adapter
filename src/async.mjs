import { AdapterError, requireCondition as check } from './errors.mjs';

export function validateSignal(signal) {
  check(signal === undefined || signal instanceof AbortSignal,
    'signal must be an AbortSignal.', 'CONFIGURATION_ERROR');
}

export function abortError() {
  return new AdapterError('Request cancelled by caller.', { code: 'ABORTED' });
}

/** Bound caller-visible waiting even when user-supplied code ignores the signal. */
export function withSignal(promise, signal) {
  if (!signal) return Promise.resolve(promise);
  if (signal.aborted) {
    Promise.resolve(promise).catch(() => {});
    return Promise.reject(abortError());
  }
  return new Promise((resolve, reject) => {
    const aborted = () => { cleanup(); reject(abortError()); };
    const cleanup = () => signal.removeEventListener('abort', aborted);
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(promise).then(
      value => { cleanup(); resolve(value); },
      error => { cleanup(); reject(error); },
    );
  });
}

export function deadline(timeoutMs, parent) {
  validateSignal(parent);
  check(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 2147483647,
    'timeoutMs must be a positive 32-bit integer.', 'CONFIGURATION_ERROR');
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (parent?.aborted) cancel();
  parent?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  return {
    signal: controller.signal,
    get timedOut() { return timedOut; },
    close() { clearTimeout(timer); parent?.removeEventListener('abort', cancel); },
  };
}
