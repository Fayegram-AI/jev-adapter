import { optionsObject } from './options.mjs';
import { requireCondition as check } from './errors.mjs';
import { isRecord, validateResult } from './validation.mjs';

/** Optional application policy; never executes an action or alters the model's answer. */
export function decideChoice(answer, options = {}) {
  const { minProbability, minMargin = 0, abstainOptions = [] } = optionsObject(
    options, ['minProbability', 'minMargin', 'abstainOptions'], 'Choice policy options');
  check(Number.isFinite(minProbability) && minProbability >= 0 && minProbability <= 1,
    'Supply minProbability explicitly in [0, 1].');
  check(Number.isFinite(minMargin) && minMargin >= 0 && minMargin <= 1, 'minMargin must be in [0, 1].');
  check(Array.isArray(abstainOptions) && abstainOptions.every(x => typeof x === 'string'),
    'abstainOptions must be an array of labels.');
  check(isRecord(answer) && answer.type === 'choice' && isRecord(answer.probabilities), 'A choice answer is required.');
  const criteria = Object.fromEntries(Object.keys(answer.probabilities).map(key => [key, null]));
  validateResult({ model: 'policy-validation', answers: { value: answer },
    usage: { input_tokens: 0, output_tokens: 0 } }, { value: { type: 'choice', criteria } });
  check(abstainOptions.every(label => Object.hasOwn(answer.probabilities, label)),
    'Every abstainOptions label must be an available choice.');
  const selectedProbability = answer.probabilities[answer.choice];
  const runnerUp = Math.max(0, ...Object.entries(answer.probabilities)
    .filter(([label]) => label !== answer.choice).map(([, p]) => p));
  const margin = selectedProbability - runnerUp;
  const reason = abstainOptions.includes(answer.choice) ? 'abstain_option'
    : selectedProbability < minProbability ? 'probability_below_threshold'
      : margin < minMargin ? 'margin_below_threshold' : null;
  return Object.freeze({
    status: reason === null ? 'selected' : 'review',
    choice: answer.choice,
    selectedProbability,
    margin,
    reason,
  });
}
