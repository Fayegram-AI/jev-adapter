import { OpenAICompatibleProvider } from '../src/index.mjs';

/** Explicitly loaded delegation example; all evaluations use the real backend. */
export function createProvider(options = {}) {
  const backend = new OpenAICompatibleProvider(options);
  return {
    name: 'project-compatible-endpoint',
    defaultModel: backend.defaultModel,
    probabilitySource: backend.probabilitySource,
    evaluate: (request, callOptions) => backend.evaluate(request, callOptions),
    listModels: callOptions => backend.listModels(callOptions),
  };
}
