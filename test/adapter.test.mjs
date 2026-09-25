import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createAdapter, evaluateBatch, AdapterError, publicError, noul } from '../src/index.mjs';
import { request, response, jsonResponse, copy } from './fixtures.mjs';
import { one } from './support.mjs';

function adapter(extra = {}) {
  return createAdapter({ jev: { apiKey: 'test-only-not-a-real-key', model: 'jev-latest', fetchImpl: async () => jsonResponse() }, ...extra });
}
function fakeProvider(evaluate = async () => copy(response)) {
  return { name: 'fixture-custom', defaultModel: 'fixture-model', evaluate };
}
const fake = () => ({ name: 'test-fixture', defaultModel: 'fixture', evaluate: async () => copy(response) });
const batchFixtureProvider = { name: 'test-fixture', defaultModel: 'fixture', async evaluate(request) {
  return { model: request.model, answers: { yes: { type: 'noul', noul: 0.5 } }, usage: { input_tokens: null, output_tokens: null } };
} };
const fixture = { name: 'test-fixture', defaultModel: 'fixture', async evaluate() { return response; } };

test('default Jev provider posts the native request and preserves model answers', async () => {
  let seen;
  const client = createAdapter({ jev: { apiKey: 'test-only-not-a-real-key', model: 'jev-latest', fetchImpl: async (url, init) => {
    seen = { url, init };
    return jsonResponse(response, 200, { 'x-request-id': 'local-fixture-id' });
  } } });
  const result = await client.evaluate(request);
  assert.equal(seen.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.authorization, 'Bearer test-only-not-a-real-key');
  assert.equal(seen.init.redirect, 'error');
  assert.deepEqual(JSON.parse(seen.init.body), { ...request, model: 'jev-latest' });
  assert.deepEqual(result.answers, response.answers);
  assert.deepEqual(result.usage, response.usage);
  assert.equal(result.model, 'jev-test-fixture');
  assert.equal(result.meta.provider, 'typesafe');
  assert.equal(result.meta.requestedModel, 'jev-latest');
  assert.equal(result.meta.requestId, 'local-fixture-id');
  assert.equal(result.meta.attempts, 1);
  assert(result.meta.durationMs >= 0);
  assert(Object.isFrozen(result.answers.route.probabilities));
});

test('explicit model override is sent without being replaced by the default', async () => {
  let model;
  const client = createAdapter({ jev: { apiKey: 'test', model: 'default-version', fetchImpl: async (_, init) => {
    model = JSON.parse(init.body).model; return jsonResponse();
  } } });
  const result = await client.evaluate({ ...request, model: 'pinned-version' });
  assert.equal(model, 'pinned-version');
  assert.equal(result.meta.requestedModel, 'pinned-version');
});

test('extensions run in order and do not mutate caller state', async () => {
  let received;
  const observed = [];
  const client = createAdapter({ jev: { apiKey: 'test', fetchImpl: async (_, init) => {
    received = JSON.parse(init.body); return jsonResponse();
  } }, extensions: [
    { name: 'first', prepareState: state => ({ original: state, one: 1 }) },
    { name: 'second', prepareState: state => ({ ...state, two: 2 }),
      onResult: result => { observed.push(result.model); } },
  ] });
  const result = await client.evaluate(request);
  assert.deepEqual(received.state, { original: request.state, one: 1, two: 2 });
  assert.equal(request.state, 'Local test input');
  assert.deepEqual(observed, ['jev-test-fixture']);
  assert.deepEqual(result.meta.observerFailures, []);
});

test('failed preparation prevents inference', async () => {
  let calls = 0;
  const client = createAdapter({ jev: { apiKey: 'test', fetchImpl: async () => { calls++; return jsonResponse(); } },
    extensions: [{ name: 'broken', prepareState() { throw Error('private details'); } }] });
  await assert.rejects(client.evaluate(request), error => error.code === 'EXTENSION_ERROR' && !error.message.includes('private'));
  assert.equal(calls, 0);
});

test('invalid prepared state is revalidated', async () => {
  const client = adapter({ extensions: [{ name: 'invalid', prepareState: () => 42 }] });
  await assert.rejects(client.evaluate(request), { code: 'VALIDATION_ERROR' });
});

test('observer failure is reported without losing the successful inference', async () => {
  const client = adapter({ extensions: [{ name: 'metrics', onResult() { throw Error('down'); } }] });
  const result = await client.evaluate(request);
  assert.deepEqual(result.answers, response.answers);
  assert.deepEqual(result.meta.observerFailures, ['metrics']);
});

test('observers cannot alter native probabilities', async () => {
  const client = adapter({ extensions: [{ name: 'mutator', onResult(result) { result.answers.route.probabilities.a = 1; } }] });
  const result = await client.evaluate(request);
  assert.equal(result.answers.route.probabilities.a, 0.8);
  assert.deepEqual(result.meta.observerFailures, ['mutator']);
});

test('a custom backend needs no TypeSafe key and uses the same validated contract', async () => {
  const provider = {
    name: 'test-provider', defaultModel: 'local-fixture',
    async evaluate(req) { assert.equal(req.model, 'local-fixture'); return copy(response); },
  };
  const client = createAdapter({ provider });
  const result = await client.evaluate(request);
  assert.equal(result.meta.provider, 'test-provider');
  assert.deepEqual(result.answers, response.answers);
  await assert.rejects(client.listModels(), { code: 'UNSUPPORTED_OPERATION' });
});

test('custom provider responses are validated, not blindly trusted', async () => {
  const client = createAdapter({ provider: { name: 'bad', defaultModel: 'bad',
    async evaluate() { return { model: 'bad', answers: {}, usage: response.usage }; } } });
  await assert.rejects(client.evaluate(request), { code: 'INVALID_RESPONSE' });
});

test('duplicate extension names fail configuration', () => {
  assert.throws(() => adapter({ extensions: [{ name: 'same' }, { name: 'same' }] }), { code: 'CONFIGURATION_ERROR' });
});

test('default construction reads TYPESAFE_API_KEY and JEV_MODEL', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import { createAdapter } from './src/index.mjs';
    const adapter = createAdapter();
    console.log(typeof adapter.evaluate);
  `], { cwd: new URL('..', import.meta.url), encoding: 'utf8', env: {
    ...process.env, TYPESAFE_API_KEY: 'local-test-key', JEV_MODEL: 'test-version',
  } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'function');
});

test('structured read-only templates can be reused without mutation', async () => {
  const questions = Object.freeze({ yes: noul({ task: 'Is this true?', examples: ['x'] }) });
  const client = createAdapter({ provider: { name: 'fixture', defaultModel: 'm', async evaluate(r) {
    assert.equal(Object.isFrozen(r.questions.yes.instructions.examples), true);
    return { model: r.model, answers: { yes: { type: 'noul', noul: 0.5 } }, usage: { input_tokens: null, output_tokens: null } };
  } } });
  const result = await client.evaluate({ state: { nested: ['data'] }, questions });
  assert.equal(result.meta.probabilitySource, 'unspecified');
  assert.equal(result.meta.adapterVersion, '0.1.0');
  assert.equal(Object.isFrozen(result.answers.yes), true);
});

test('a stalled preparation hook is bounded by the adapter deadline', async () => {
  let calls = 0;
  const client = createAdapter({ provider: fakeProvider(async () => { calls++; return copy(response); }), timeoutMs: 25,
    extensions: [{ name: 'stall', prepareState: () => new Promise(() => {}) }] });
  await assert.rejects(client.evaluate(request), { code: 'TIMEOUT' });
  assert.equal(calls, 0);
});

test('abort during preparation remains cancellation rather than an extension error', async () => {
  const controller = new AbortController();
  const client = createAdapter({ provider: fakeProvider(), extensions: [{ name: 'cancel', prepareState() {
    controller.abort(); return new Promise(() => {});
  } }] });
  await assert.rejects(client.evaluate(request, { signal: controller.signal }), { code: 'ABORTED' });
});

test('stalled observers cannot block successful evaluations indefinitely', async () => {
  const client = createAdapter({ provider: fakeProvider(), observerTimeoutMs: 20,
    extensions: [{ name: 'stall', onResult: () => new Promise(() => {}) }] });
  const result = await client.evaluate(request);
  assert.deepEqual(result.meta.observerFailures, ['stall']);
  assert.equal(result.answers.yes.noul, 0.7);
});

test('custom provider rejecting after timeout does not create an unhandled rejection', async () => {
  const client = createAdapter({ provider: fakeProvider(() => new Promise((_, reject) => setTimeout(() => reject(Error('late secret')), 25))), timeoutMs: 5 });
  await assert.rejects(client.evaluate(request), { code: 'TIMEOUT' });
  await new Promise(resolve => setTimeout(resolve, 35));
});

test('unknown custom errors are sanitized', async () => {
  const client = createAdapter({ provider: fakeProvider(async () => { throw Error('private-token'); }) });
  await assert.rejects(client.evaluate(request), e => e.code === 'PROVIDER_ERROR' && !JSON.stringify(e).includes('private-token'));
  assert.deepEqual(publicError(Error('private')), { code: 'UNEXPECTED_ERROR', message: 'Unexpected adapter failure.' });
  assert.deepEqual(new AdapterError('Safe', { code: 'CUSTOM', status: 502, attempts: 1 }).toJSON(),
    { code: 'CUSTOM', message: 'Safe', status: 502, attempts: 1 });
});

test('call timeout and AbortSignal options are validated', async () => {
  const client = createAdapter({ provider: fakeProvider() });
  await assert.rejects(client.evaluate(request, { signal: {} }), { code: 'CONFIGURATION_ERROR' });
  await assert.rejects(client.evaluate(request, { timeoutMs: 0 }), { code: 'CONFIGURATION_ERROR' });
  assert.throws(() => createAdapter({ provider: fakeProvider(), observerTimeoutMs: -1 }), { code: 'CONFIGURATION_ERROR' });
});

test('custom model listing is bounded by the adapter deadline', async () => {
  const provider = { ...fakeProvider(), listModels: () => new Promise(() => {}) };
  await assert.rejects(createAdapter({ provider, timeoutMs: 10 }).listModels(), { code: 'TIMEOUT' });
});

test('batch respects concurrency and returns input order', async () => {
  let active = 0;
  let maximum = 0;
  const client = createAdapter({ provider: fakeProvider(async r => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, r.state === '0' ? 25 : 2));
    active--; return { ...copy(response), model: r.state };
  }) });
  const results = await evaluateBatch(client, Array.from({ length: 7 }, (_, i) => ({ ...request, state: String(i) })), { concurrency: 3 });
  assert.equal(maximum, 3);
  assert.deepEqual(results.map(r => r.result.model), ['0', '1', '2', '3', '4', '5', '6']);
  assert.deepEqual(results.map(r => r.index), [0, 1, 2, 3, 4, 5, 6]);
});

test('batch validates all requests before dispatch', async () => {
  let calls = 0;
  const client = createAdapter({ provider: fakeProvider(async () => { calls++; return copy(response); }) });
  await assert.rejects(evaluateBatch(client, [request, { state: 1, questions: request.questions }]), { code: 'VALIDATION_ERROR' });
  assert.equal(calls, 0);
  assert.deepEqual(await evaluateBatch(client, []), []);
});

test('batch stopOnError preserves failures and marks undispatched requests skipped', async () => {
  let calls = 0;
  const client = createAdapter({ provider: fakeProvider(async () => {
    if (++calls === 1) throw new AdapterError('Failure', { code: 'HTTP_ERROR' });
    return copy(response);
  }) });
  const results = await evaluateBatch(client, [request, request, request], { concurrency: 1, stopOnError: true });
  assert.equal(calls, 1);
  assert.deepEqual(results.map(r => r.error.code), ['HTTP_ERROR', 'BATCH_SKIPPED', 'BATCH_SKIPPED']);
});

test('batch pre-abort sends no requests and records aborted rows', async () => {
  let calls = 0;
  const controller = new AbortController(); controller.abort();
  const client = createAdapter({ provider: fakeProvider(async () => { calls++; return copy(response); }) });
  const result = await evaluateBatch(client, [request, request], { signal: controller.signal });
  assert.equal(calls, 0);
  assert.deepEqual(result.map(row => row.error.code), ['ABORTED', 'ABORTED']);
});

for (const config of [{ concurrency: 0 }, { concurrency: 65 }, { concurrency: 1.5 }, { stopOnError: 'yes' }]) {
  test(`invalid batch options ${JSON.stringify(config)}`, async () => {
    await assert.rejects(evaluateBatch(createAdapter({ provider: fakeProvider() }), [], config), { code: 'CONFIGURATION_ERROR' });
  });
}

test('observers receive metadata matching the public contract', async () => {
  let seen;
  const adapter = createAdapter({ provider: fake(), extensions: [{ name: 'observe', onResult(result) { seen = result; } }] });
  const result = await adapter.evaluate(request);
  assert.equal(seen.meta.observerDurationMs, 0);
  assert.equal(Object.isFrozen(seen.meta), true);
  assert.equal(typeof result.meta.observerDurationMs, 'number');
});

test('model listing snapshots without freezing provider-owned data', async () => {
  const data = { models: [{ name: 'fixture' }] };
  const result = await createAdapter({ provider: { ...fake(), listModels: async () => data } }).listModels();
  assert.equal(Object.isFrozen(result.models[0]), true);
  assert.equal(Object.isFrozen(data.models[0]), false);
  data.models[0].name = 'changed';
  assert.equal(result.models[0].name, 'fixture');
});

test('SDK sparse batch is rejected before any paid dispatch', async () => {
  let calls = 0;
  const adapter = createAdapter({ provider: { ...batchFixtureProvider, async evaluate(r) { calls++; return batchFixtureProvider.evaluate(r); } } });
  const requests = [one]; requests.length = 2;
  await assert.rejects(evaluateBatch(adapter, requests), { code: 'VALIDATION_ERROR' });
  assert.equal(calls, 0);
});

test('sparse extensions fail at construction with a configuration error', () => {
  assert.throws(() => createAdapter({ provider: fixture, extensions: new Array(1) }), { code: 'CONFIGURATION_ERROR' });
});
