import { isRecord } from '../validation.mjs';
import { requireCondition as check } from '../errors.mjs';
import { AdapterError } from '../errors.mjs';
import { JevProvider } from './jev.mjs';
import { OpenAICompatibleProvider, OpenRouterProvider } from './openai-compatible.mjs';
import { AnthropicProvider } from './anthropic.mjs';

export { JevProvider, OpenAICompatibleProvider, OpenRouterProvider, AnthropicProvider };

/** Programmatic factory. Custom providers are passed directly to createAdapter. */
export function createProvider(configuration = {}) {
  check(isRecord(configuration), 'Provider configuration must be a plain object.', 'CONFIGURATION_ERROR');
  check(Object.getOwnPropertySymbols(configuration).length === 0 &&
    Object.values(Object.getOwnPropertyDescriptors(configuration)).every(d => d.enumerable && 'value' in d),
  'Provider configuration must not contain accessors or symbol keys.', 'CONFIGURATION_ERROR');
  const { type = 'jev', ...options } = configuration;
  switch (type) {
    case 'jev': return new JevProvider(options);
    case 'openai-compatible': return new OpenAICompatibleProvider(options);
    case 'openrouter': return new OpenRouterProvider(options);
    case 'anthropic': return new AnthropicProvider(options);
    default: throw new AdapterError('Unknown provider type.', { code: 'CONFIGURATION_ERROR' });
  }
}
