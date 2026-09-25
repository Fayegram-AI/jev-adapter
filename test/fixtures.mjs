// Synthetic fixtures for local software tests. These are NOT measured Jev outputs.
export const request = {
  state: 'Local test input',
  questions: {
    route: { type: 'choice', instructions: 'Select a route.', criteria: { a: null, b: null } },
    yes: { type: 'noul', instructions: 'Is this a test?' },
    level: { type: 'score', instructions: 'Rate the level.', criteria: ['Low', 'High'] },
  },
};
export const response = {
  model: 'jev-test-fixture',
  answers: {
    route: { type: 'choice', choice: 'a', probabilities: { a: 0.8, b: 0.2 }, confidence: 0.6 },
    yes: { type: 'noul', noul: 0.7 },
    level: { type: 'score', score: 0.75, probabilities: { 0: 0.25, 1: 0.75 },
      legend: { 0: 'Low', 1: 'High' }, confidence: 0.5 },
  },
  usage: { input_tokens: 100, output_tokens: 0 },
};
export function jsonResponse(data = response, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}
export const copy = value => JSON.parse(JSON.stringify(value));
