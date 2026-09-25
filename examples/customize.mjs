import { createAdapter, choice } from '../src/index.mjs';

/** Question templates are ordinary version-controlled functions. */
function failureQuestion(includeNetwork) {
  return choice('Classify the failure. Use unknown when evidence is insufficient.', {
    dependency: 'An installed package is absent or incompatible.',
    assertion: 'A test ran and an assertion failed.',
    ...(includeNetwork ? { network: 'A connection or network request failed.' } : {}),
    unknown: 'No supplied category is established.',
  });
}

try {
  const adapter = createAdapter();
  const result = await adapter.evaluate({
    state: { log: 'Connection to the package registry timed out.' },
    questions: { category: failureQuestion(true) },
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.code ?? 'ERROR', error.message);
  process.exitCode = 1;
}
