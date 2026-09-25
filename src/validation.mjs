import { isDeepStrictEqual } from 'node:util';
import { requireCondition as check } from './errors.mjs';

const own = (value, key) => Object.hasOwn(value, key);
export const isRecord = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const isEntry = value => value === null || typeof value === 'string' ||
  Array.isArray(value) || isRecord(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

/** Reject lossy JSON conversion: cycles, NaN, undefined, Date, getters, etc. */
export function cloneJson(value, label = 'value', code = 'VALIDATION_ERROR') {
  const ancestors = new Set();
  let visited = 0;
  function visit(item, depth) {
    check(++visited <= 200000, `${label}: JSON exceeds 200000 nodes.`, code);
    check(depth <= 100, `${label}: JSON nesting exceeds 100 levels.`, code);
    if (item === null || ['string', 'boolean'].includes(typeof item)) return item;
    if (typeof item === 'number') {
      check(Number.isFinite(item), `${label}: numbers must be finite.`, code);
      return item;
    }
    check(Array.isArray(item) || isRecord(item), `${label}: use plain JSON values only.`, code);
    check(!ancestors.has(item), `${label}: cyclic values are not supported.`, code);
    check(Object.getOwnPropertySymbols(item).length === 0, `${label}: symbol keys are not supported.`, code);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(item) && key === 'length') continue;
      check('value' in descriptor && descriptor.enumerable,
        `${label}: accessors and non-enumerable properties are not supported.`, code);
    }
    ancestors.add(item);
    if (Array.isArray(item)) {
      const keys = Object.keys(item);
      check(keys.length === item.length && keys.every((key, i) => key === String(i)),
        `${label}: arrays must not be sparse or have extra properties.`, code);
    }
    const entries = [];
    for (const key of Object.keys(item)) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      check(descriptor && 'value' in descriptor, `${label}: getters are not supported.`, code);
      entries.push([key, visit(descriptor.value, depth + 1)]);
    }
    ancestors.delete(item);
    // Construct a copy without invoking user-defined toJSON methods.
    return Array.isArray(item) ? entries.map(([, child]) => child) : Object.fromEntries(entries);
  }
  return visit(value, 0);
}

export function freezeJson(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
  return value;
}

function exactKeys(value, expected, label, code) {
  check(isRecord(value), `${label}: expected an object.`, code);
  const actual = Object.keys(value);
  check(actual.length === expected.length && expected.every(key => own(value, key)),
    `${label}: keys do not match the request.`, code);
}

function allowedKeys(value, expected, label, code = 'VALIDATION_ERROR') {
  check(Object.keys(value).every(key => expected.includes(key)),
    `${label}: unknown field.`, code);
}

export function validateRequest(input, defaultModel = 'jev-latest') {
  const request = cloneJson(input, 'request');
  check(isRecord(request), 'request must be an object.');
  allowedKeys(request, ['state', 'questions', 'model'], 'request');
  check(own(request, 'state') && request.state !== null && isEntry(request.state),
    'state must be text, a JSON object, or an array.');
  if (own(request, 'model')) check(nonempty(request.model), 'model must be a nonempty string when provided.');
  const model = request.model ?? defaultModel;
  check(nonempty(model), 'model must be a nonempty string.');
  check(isRecord(request.questions) && Object.keys(request.questions).length > 0,
    'questions must be a nonempty object.');
  for (const [id, q] of Object.entries(request.questions)) {
    check(nonempty(id), 'Question IDs must be nonempty.');
    check(isRecord(q), 'Every question must be an object.');
    allowedKeys(q, ['type', 'instructions', 'criteria'], 'question');
    check(['choice', 'noul', 'score'].includes(q.type), 'Question type must be choice, noul, or score.');
    check(own(q, 'instructions') && q.instructions !== null && isEntry(q.instructions),
      'instructions are required and must be text, a JSON object, or an array.');
    if (typeof q.instructions === 'string') check(nonempty(q.instructions), 'instructions must not be empty.');
    if (q.type === 'choice') {
      check(isRecord(q.criteria) && Object.keys(q.criteria).length > 0 && Object.keys(q.criteria).length <= 255,
        'choice requires a criteria map with 1 to 255 options.');
      for (const [label, description] of Object.entries(q.criteria)) {
        check(nonempty(label) && isEntry(description), 'choice criteria require labels and text, structured JSON, or null descriptions.');
      }
    } else if (q.type === 'score') {
      check(Array.isArray(q.criteria) && q.criteria.length >= 2 && q.criteria.length <= 10,
        'score requires 2 to 10 ordered criteria.');
      check(q.criteria.every(value => value !== null && isEntry(value)),
        'score descriptions must be text or structured JSON, not null.');
    } else if (own(q, 'criteria')) {
      check(isRecord(q.criteria), 'noul criteria must be an object when provided.');
      allowedKeys(q.criteria, ['true', 'false'], 'noul criteria');
      check(Object.values(q.criteria).every(value => value !== null && isEntry(value)),
        'noul descriptions must be text or structured JSON, not null.');
    }
  }
  return { ...request, model };
}

function probability(value, label) {
  check(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1,
    `${label}: expected a probability in [0, 1].`, 'INVALID_RESPONSE');
}

function distribution(value, labels) {
  exactKeys(value, labels, 'probabilities', 'INVALID_RESPONSE');
  Object.values(value).forEach(item => probability(item, 'probabilities'));
  const total = Object.values(value).reduce((sum, item) => sum + item, 0);
  // Tolerate serialization rounding, but do not renormalize provider values.
  check(Math.abs(total - 1) <= 1e-3, 'probabilities must sum to 1 (tolerance 0.001).', 'INVALID_RESPONSE');
}

/** Validate, but do not invent, round, or normalize model results. */
export function validateResult(input, questions, options = {}) {
  check(isRecord(options), 'Result-validation options must be an object.', 'CONFIGURATION_ERROR');
  check(Object.getOwnPropertySymbols(options).length === 0 &&
    Object.entries(Object.getOwnPropertyDescriptors(options)).every(([key, d]) =>
      key === 'native' && d.enumerable && 'value' in d),
  'Result-validation options contain an unknown field or accessor.', 'CONFIGURATION_ERROR');
  const { native = false } = options;
  check(typeof native === 'boolean', 'native must be boolean.', 'CONFIGURATION_ERROR');
  const result = cloneJson(input, 'response', 'INVALID_RESPONSE');
  check(isRecord(result), 'Response must be an object.', 'INVALID_RESPONSE');
  allowedKeys(result, ['model', 'answers', 'usage', 'meta'], 'response', 'INVALID_RESPONSE');
  check(isRecord(questions) && Object.keys(questions).length > 0, 'questions must be a nonempty object.');
  check(nonempty(result.model), 'Response must include model.', 'INVALID_RESPONSE');
  exactKeys(result.answers, Object.keys(questions), 'answers', 'INVALID_RESPONSE');
  for (const [id, q] of Object.entries(questions)) {
    check(isRecord(q) && ['noul', 'choice', 'score'].includes(q.type), 'A valid question type is required.');
    if (q.type === 'choice') check(isRecord(q.criteria) && Object.keys(q.criteria).length > 0 &&
      Object.keys(q.criteria).length <= 255, 'choice requires 1 to 255 criteria.');
    if (q.type === 'score') check(Array.isArray(q.criteria) && q.criteria.length >= 2 && q.criteria.length <= 10, 'score requires 2–10 levels.');
    const answer = result.answers[id];
    check(isRecord(answer) && answer.type === q.type, 'Answer type must match its question.', 'INVALID_RESPONSE');
    allowedKeys(answer, q.type === 'noul' ? ['type', 'noul'] : q.type === 'choice'
      ? ['type', 'choice', 'probabilities', 'confidence'] : ['type', 'score', 'legend', 'probabilities', 'confidence'], 'answer', 'INVALID_RESPONSE');
    if (q.type === 'noul') {
      probability(answer.noul, 'noul');
      continue;
    }
    if (native || own(answer, 'confidence')) probability(answer.confidence, 'confidence');
    const labels = q.type === 'choice' ? Object.keys(q.criteria) : q.criteria.map((_, i) => String(i));
    distribution(answer.probabilities, labels);
    if (q.type === 'choice') {
      check(typeof answer.choice === 'string' && labels.includes(answer.choice), 'choice must be a supplied option.', 'INVALID_RESPONSE');
      const selected = answer.probabilities[answer.choice];
      check(selected + 1e-6 >= Math.max(...Object.values(answer.probabilities)),
        'choice must select a highest-probability option.', 'INVALID_RESPONSE');
    } else {
      exactKeys(answer.legend, labels, 'legend', 'INVALID_RESPONSE');
      check(labels.every((label, i) => isDeepStrictEqual(answer.legend[label], q.criteria[i])),
        'Score legend does not match the supplied rubric.', 'INVALID_RESPONSE');
      check(typeof answer.score === 'number' && Number.isFinite(answer.score) &&
        answer.score >= 0 && answer.score <= q.criteria.length - 1,
        'score is outside the rubric range.', 'INVALID_RESPONSE');
      const mean = labels.reduce((sum, key) => sum + Number(key) * answer.probabilities[key], 0);
      check(Math.abs(mean - answer.score) <= 0.02 * q.criteria.length,
        'score is inconsistent with its probability-weighted mean.', 'INVALID_RESPONSE');
    }
  }
  check(isRecord(result.usage), 'Response must include usage.', 'INVALID_RESPONSE');
  allowedKeys(result.usage, ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'], 'usage', 'INVALID_RESPONSE');
  for (const field of ['cache_creation_input_tokens', 'cache_read_input_tokens']) {
    if (own(result.usage, field)) check(Number.isSafeInteger(result.usage[field]) && result.usage[field] >= 0, 'Invalid cache token count.', 'INVALID_RESPONSE');
  }
  for (const field of ['input_tokens', 'output_tokens']) {
    check((!native && result.usage[field] === null) ||
      (Number.isSafeInteger(result.usage[field]) && result.usage[field] >= 0),
      'Token counts must be nonnegative safe integers.', 'INVALID_RESPONSE');
  }
  if (result.meta !== undefined) check(isRecord(result.meta), 'meta must be an object.', 'INVALID_RESPONSE');
  return result;
}

