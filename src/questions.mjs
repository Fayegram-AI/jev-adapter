import { freezeJson, validateRequest } from './validation.mjs';

function build(question) {
  const { questions } = validateRequest({ state: '', questions: { value: question } });
  return freezeJson(questions.value);
}

export const choice = (instructions, criteria) => build({ type: 'choice', instructions, criteria });
export const noul = (instructions, criteria) => build({
  type: 'noul', instructions, ...(criteria === undefined ? {} : { criteria }),
});
export const score = (instructions, criteria) => build({ type: 'score', instructions, criteria });
