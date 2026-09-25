import { createAdapter, OpenRouterProvider, noul } from '../src/index.mjs';

try {
  if (!process.env.DECISION_MODEL?.trim()) throw Error('Set DECISION_MODEL to your available OpenRouter model ID.');
  const adapter = createAdapter({ provider: new OpenRouterProvider({ model: process.env.DECISION_MODEL }) });
  const result = await adapter.evaluate({ state: 'Test report: two assertions failed.',
    questions: { failure: noul('Does the report explicitly state that a test failed?') } });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.code ?? 'ERROR', error.message);
  process.exitCode = 1;
}
