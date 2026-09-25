import { requireCondition as check } from './errors.mjs';
import { isRecord } from './validation.mjs';

/** Reject misspelled runtime options instead of silently calling the wrong backend. */
export function optionsObject(value, allowed, label = 'options') {
  check(isRecord(value), `${label} must be a plain object.`, 'CONFIGURATION_ERROR');
  check(Object.getOwnPropertySymbols(value).length === 0, `${label} must not contain symbol keys.`, 'CONFIGURATION_ERROR');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  check(Object.entries(descriptors).every(([key, descriptor]) => allowed.includes(key) &&
    descriptor.enumerable && 'value' in descriptor),
  `${label} contains an unknown field or accessor.`, 'CONFIGURATION_ERROR');
  return value;
}

export const TRANSPORT_FIELDS = ['timeoutMs', 'maxRetries', 'maxRequestBytes', 'maxResponseBytes', 'fetchImpl'];
