import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapOrdered } from '../src/cli/ordered.mjs';

async function collect(iterable) { const result = []; for await (const row of iterable) result.push(row); return result; }

test('ordered window bounds concurrency and emits in source order', async () => {
  let active = 0; let maximum = 0;
  async function* source() { for (let i = 0; i < 12; i++) yield i; }
  const actual = await collect(mapOrdered(source(), async i => {
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, i === 0 ? 20 : 1));
    active--; return i;
  }, { concurrency: 4 }));
  assert.deepEqual(actual, Array.from({ length: 12 }, (_, i) => i));
  assert.equal(maximum, 4);
  assert.equal(active, 0);
});

test('ordered window handles empty source', async () => {
  async function* source() {}
  assert.deepEqual(await collect(mapOrdered(source(), () => { throw Error('Unexpected dispatch.'); }, { concurrency: 2 })), []);
});

test('ordered window propagates a mapping error and closes the source', async () => {
  let closed = false;
  async function* source() { try { yield 1; yield 2; yield 3; } finally { closed = true; } }
  await assert.rejects(collect(mapOrdered(source(), () => { throw Error('fixture mapping failure'); }, { concurrency: 2 })), /fixture mapping failure/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, true);
});

test('ordered window propagates input failure', async () => {
  async function* source() { throw Error('fixture input failure'); }
  await assert.rejects(collect(mapOrdered(source(), v => v, { concurrency: 2 })), /fixture input failure/);
});

test('ordered window pre-abort never reads or maps', async () => {
  const controller = new AbortController(); controller.abort(); let reads = 0;
  async function* source() { reads++; yield 1; }
  await assert.rejects(collect(mapOrdered(source(), v => v, { concurrency: 2, signal: controller.signal })), { code: 'ABORTED' });
  assert.equal(reads, 0);
});

test('ordered window can be cancelled during an idle input read', async () => {
  const controller = new AbortController(); let closed = false;
  const source = { [Symbol.asyncIterator]() { return this; },
    next() { controller.abort(); return new Promise(() => {}); },
    return() { closed = true; return Promise.reject(Error('fixture cleanup failure')); },
  };
  await assert.rejects(collect(mapOrdered(source, v => v, { concurrency: 2, signal: controller.signal })), { code: 'ABORTED' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, true);
});

test('ordered window consumer closing early closes its source', async () => {
  let closed = false;
  async function* source() { try { yield 1; yield 2; } finally { closed = true; } }
  for await (const value of mapOrdered(source(), v => v, { concurrency: 1 })) {
    assert.equal(value, 1); break;
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, true);
});
