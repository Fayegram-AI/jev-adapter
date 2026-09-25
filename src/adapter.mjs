import { optionsObject } from './options.mjs';
import { VERSION } from './version.mjs';
import { AdapterError, requireCondition as check } from './errors.mjs';
import { JevProvider } from './providers/jev.mjs';
import { cloneJson, freezeJson, isRecord, validateRequest, validateResult } from './validation.mjs';
import { abortError, deadline, withSignal } from './async.mjs';

const elapsed = start => Math.round((performance.now() - start) * 1000) / 1000;

/** Stable interface. Prepare context, evaluate, validate, then observe immutable results. */
export function createAdapter(options = {}) {
  const { provider, jev, extensions = [], timeoutMs = 60000, observerTimeoutMs = 1000 } =
    optionsObject(options, ['provider', 'jev', 'extensions', 'timeoutMs', 'observerTimeoutMs'], 'Adapter options');
  check(!(provider && jev), 'Configure either provider or jev, not both.', 'CONFIGURATION_ERROR');
  const backend = provider ?? new JevProvider(jev);
  check(backend && typeof backend.name === 'string' && backend.name.trim() &&
    (backend.defaultModel === undefined || (typeof backend.defaultModel === 'string' && backend.defaultModel.trim())) &&
    typeof backend.evaluate === 'function',
  'A provider requires name, evaluate(), and an optional nonempty defaultModel.', 'CONFIGURATION_ERROR');
  for (const ms of [timeoutMs, observerTimeoutMs]) check(Number.isSafeInteger(ms) && ms > 0 && ms <= 2147483647,
    'Adapter timeouts must be positive 32-bit integers.', 'CONFIGURATION_ERROR');
  check(Array.isArray(extensions), 'extensions must be an array.', 'CONFIGURATION_ERROR');
  const registered = Array.from(extensions, extension => {
    optionsObject(extension, ['name', 'prepareState', 'onResult'], 'Extension');
    check(isRecord(extension) && typeof extension.name === 'string' && extension.name.trim() &&
      extension.name.length <= 100 && !/[\x00-\x1f\x7f]/.test(extension.name),
    'Each extension requires a printable name up to 100 characters.', 'CONFIGURATION_ERROR');
    for (const method of ['prepareState', 'onResult']) check(extension[method] === undefined || typeof extension[method] === 'function',
      'Extension handlers must be functions.', 'CONFIGURATION_ERROR');
    return { ...extension };
  });
  check(new Set(registered.map(e => e.name)).size === registered.length,
    'Extension names must be unique.', 'CONFIGURATION_ERROR');

  return Object.freeze({
    provider: backend.name,
    defaultModel: backend.defaultModel,

    async evaluate(input, callOptions = {}) {
      const { signal, timeoutMs: callTimeoutMs = timeoutMs } = optionsObject(callOptions, ['signal', 'timeoutMs'], 'Call options');
      const started = performance.now();
      const budget = deadline(callTimeoutMs, signal);
      let request;
      let context;
      let result;
      try {
        if (budget.signal.aborted) throw abortError();
        request = freezeJson(validateRequest(input, backend.defaultModel ?? ''));
        context = Object.freeze({ provider: backend.name, model: request.model,
          questionIds: Object.freeze(Object.keys(request.questions)), signal: budget.signal });
        for (const extension of registered) {
          if (budget.signal.aborted) throw abortError();
          if (!extension.prepareState) continue;
          let state;
          try {
            state = await withSignal(Promise.resolve().then(() => extension.prepareState(request.state, context)), budget.signal);
          } catch (error) {
            if (budget.signal.aborted) throw error;
            throw new AdapterError(`State preparation failed in extension ${extension.name}.`, { code: 'EXTENSION_ERROR' });
          }
          if (state !== undefined) request = freezeJson(validateRequest({ ...request, state }, backend.defaultModel ?? ''));
        }
        if (budget.signal.aborted) throw abortError();
        let response;
        try {
          response = await withSignal(Promise.resolve().then(() => backend.evaluate(request, { signal: budget.signal })), budget.signal);
        } catch (error) {
          if (error instanceof AdapterError) throw error;
          throw new AdapterError('Custom provider evaluation failed.', { code: 'PROVIDER_ERROR' });
        }
        response = validateResult(response, request.questions);
        result = freezeJson({ ...response, meta: {
          ...response.meta, provider: backend.name, requestedModel: request.model,
          probabilitySource: response.meta?.probabilitySource ?? backend.probabilitySource ?? 'unspecified',
          adapterVersion: VERSION, schemaVersion: 1,
          totalDurationMs: elapsed(started), observerDurationMs: 0, observerFailures: [],
        } });
      } catch (error) {
        if (signal?.aborted) throw abortError();
        if (budget.timedOut) throw new AdapterError('Adapter evaluation deadline exceeded.', { code: 'TIMEOUT' });
        throw error;
      } finally { budget.close(); }

      const observationStarted = performance.now();
      const failures = [];
      for (const extension of registered) {
        if (!extension.onResult) continue;
        const observation = deadline(observerTimeoutMs, signal);
        try {
          if (observation.signal.aborted) throw abortError();
          await withSignal(Promise.resolve().then(() => extension.onResult(result,
            Object.freeze({ ...context, signal: observation.signal }))), observation.signal);
        } catch { failures.push(extension.name); }
        finally { observation.close(); }
      }
      // Observation failure must not induce retries of a successful billed call.
      return freezeJson({ ...result, meta: { ...result.meta,
        totalDurationMs: elapsed(started), observerDurationMs: elapsed(observationStarted), observerFailures: failures } });
    },

    async listModels(callOptions = {}) {
      const { signal, timeoutMs: callTimeoutMs = timeoutMs } = optionsObject(callOptions, ['signal', 'timeoutMs'], 'Call options');
      check(typeof backend.listModels === 'function', 'This provider does not implement listModels().', 'UNSUPPORTED_OPERATION');
      const budget = deadline(callTimeoutMs, signal);
      try {
        if (budget.signal.aborted) throw abortError();
        const data = await withSignal(Promise.resolve().then(() => backend.listModels({ signal: budget.signal })), budget.signal);
        check(isRecord(data) && Array.isArray(data.models), 'Provider must return a models array.', 'INVALID_RESPONSE');
        const snapshot = cloneJson(data, 'model list', 'INVALID_RESPONSE');
        check(snapshot.models.every(model => isRecord(model) && typeof model.name === 'string' && model.name.trim()),
          'Each listed model requires a name.', 'INVALID_RESPONSE');
        return freezeJson(snapshot);
      } catch (error) {
        if (signal?.aborted) throw abortError();
        if (budget.timedOut) throw new AdapterError('Model-list deadline exceeded.', { code: 'TIMEOUT' });
        if (error instanceof AdapterError) throw error;
        throw new AdapterError('Provider model listing failed.', { code: 'PROVIDER_ERROR' });
      } finally { budget.close(); }
    },
  });
}
