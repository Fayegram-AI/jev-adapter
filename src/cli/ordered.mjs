import { withSignal, abortError } from '../async.mjs';

/**
 * Ordered bounded window, independently observing input and the oldest result.
 * A completed result must not wait for the producer to send another line/EOF.
 * Internal helper: concurrency has already been validated by the CLI.
 */
export async function* mapOrdered(source, map, { concurrency, signal }) {
  const iterator = source[Symbol.asyncIterator]();
  const pending = [];
  let reading;
  let ended = false;
  const failed = error => ({ kind: 'error', error });
  try {
    while (!ended || pending.length) {
      if (signal?.aborted) throw abortError();
      if (!ended && !reading && pending.length < concurrency) {
        reading = Promise.resolve().then(() => iterator.next())
          .then(row => ({ kind: 'input', row }), failed);
      }
      const ready = await withSignal(Promise.race([
        ...(reading ? [reading] : []), ...(pending.length ? [pending[0]] : []),
      ]), signal);
      if (ready.kind === 'error') throw ready.error;
      if (ready.kind === 'input') {
        reading = undefined;
        ended = ready.row.done;
        if (!ended) pending.push(Promise.resolve().then(() => {
          if (signal?.aborted) throw abortError();
          return map(ready.row.value);
        }).then(value => ({ kind: 'output', value }), failed));
      } else {
        pending.shift();
        yield ready.value;
      }
    }
  } finally {
    // The CLI cancels its shared signal on errors, including output failures.
    // An async iterator may have an outstanding read: do not await its return().
    // Every dispatched promise already has a rejection handler.
    Promise.resolve().then(() => iterator.return?.()).catch(() => {});
  }
}
