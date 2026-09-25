import { optionsObject, TRANSPORT_FIELDS } from '../options.mjs';
import { withResponseMeta, requireCondition as check } from '../errors.mjs';
import { isRecord, validateRequest, validateResult } from '../validation.mjs';
import { JsonTransport, parseBaseURL, validateApiKey } from '../transport.mjs';

/** Native TypeSafe HTTP provider: one shared-state request, no chat emulation. */
export class JevProvider {
  name = 'typesafe';
  probabilitySource = 'native';
  #transport;

  constructor(options = {}) {
    const { apiKey,
    model = process.env.JEV_MODEL?.trim() || 'jev-latest',
    baseURL = 'https://api.typesafe.ai', ...transportOptions } = optionsObject(options,
      ['apiKey', 'model', 'baseURL', ...TRANSPORT_FIELDS], 'Jev options');
    const endpointInfo = parseBaseURL(baseURL, { originOnly: true });
    const supplied = apiKey === undefined && endpointInfo.origin === 'https://api.typesafe.ai'
      ? process.env.TYPESAFE_API_KEY : apiKey;
    const key = validateApiKey(supplied, 'TYPESAFE_API_KEY');
    check(typeof model === 'string' && model.trim(), 'model must be nonempty.', 'CONFIGURATION_ERROR');
    const endpoint = endpointInfo.baseURL;
    this.defaultModel = model.trim();
    this.#transport = new JsonTransport({ ...transportOptions, baseURL: endpoint,
      headers: { authorization: `Bearer ${key}` }, secrets: [key] });
  }

  async evaluate(input, options = {}) {
    const request = validateRequest(input, this.defaultModel);
    const { data, meta } = await this.#transport.request('POST', '/v1/systemone', request, options);
    const result = withResponseMeta(meta, () => validateResult(data, request.questions, { native: true }));
    return { ...result, meta: { ...meta, provider: this.name, requestedModel: request.model,
      probabilitySource: 'native', confidenceSource: 'native', modelSource: 'reported' } };
  }

  async listModels(options = {}) {
    const { data, meta } = await this.#transport.request('GET', '/v1/models', undefined, options);
    return withResponseMeta(meta, () => {
      check(isRecord(data) && Array.isArray(data.models) && data.models.every(m =>
        isRecord(m) && typeof m.name === 'string' && m.name.trim()),
      'Model-list response must contain a models array.', 'INVALID_RESPONSE');
      return data;
    });
  }
}
