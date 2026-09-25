import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, readdir, stat, symlink, link } from 'node:fs/promises';
import { join } from 'node:path';
import { runCli } from '../src/cli/main.mjs';
import { createWriter } from '../src/cli/io.mjs';
import { workspace, temporaryWorkspace, streams, one } from './support.mjs';
import { request } from './fixtures.mjs';

async function invoke(args, cwd) {
  const io = streams();
  const code = await runCli(args, { ...io, cwd, env: {} });
  return { code, stdout: io.output(), stderr: io.error() };
}

test('atomic output is private, exclusive and leaves no temporary files', async t => {
  const cwd = await workspace(t);
  const args = ['evaluate', 'request.json', '--provider-module', 'provider.mjs', '--output', 'out.json'];
  const result = await invoke(args, cwd);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(await readFile(join(cwd, 'out.json'), 'utf8')).answers.yes.noul, 0.42);
  if (process.platform !== 'win32') assert.equal((await stat(join(cwd, 'out.json'))).mode & 0o777, 0o600);
  assert.equal((await invoke(args, cwd)).code, 2);
  assert.equal((await invoke([...args, '--force'], cwd)).code, 0);
  assert.equal((await readdir(cwd)).some(name => name.endsWith('.tmp')), false);
});

test('failed evaluation does not leave an output artifact', async t => {
  const cwd = await workspace(t);
  const result = await invoke(['evaluate', 'request.json', '--output', 'out.json'], cwd);
  assert.equal(result.code, 2);
  assert.equal((await readdir(cwd)).includes('out.json'), false);
  assert.equal((await readdir(cwd)).some(name => name.endsWith('.tmp')), false);
});

test('output cannot replace the request input even with force', async t => {
  const cwd = await workspace(t);
  const result = await invoke(['evaluate', 'request.json', '--output', 'request.json', '--force'], cwd);
  assert.equal(result.code, 2);
  assert.deepEqual(JSON.parse(await readFile(join(cwd, 'request.json'), 'utf8')), one);
});

test('cancelled file writer never publishes a completed temporary file', async t => {
  const cwd = await temporaryWorkspace(t); const controller = new AbortController();
  const writer = await createWriter({ output: 'result.json', cwd, signal: controller.signal });
  try {
    await writer.write('{"ok":true}\n'); controller.abort();
    await assert.rejects(writer.finish(), { code: 'ABORTED' });
  } finally { await writer.abort(); }
  assert.deepEqual(await readdir(cwd), []);
});

test('cancelled file writer rejects further writes', async t => {
  const cwd = await temporaryWorkspace(t); const controller = new AbortController();
  const writer = await createWriter({ output: 'result.json', cwd, signal: controller.signal });
  try {
    controller.abort();
    await assert.rejects(writer.write('must not write'), { code: 'ABORTED' });
  } finally { await writer.abort(); }
  assert.deepEqual(await readdir(cwd), []);
});

test('input protection detects symlinked-directory aliases before overwriting', async t => {
  const cwd = await temporaryWorkspace(t); const before = JSON.stringify(request) + '\n';
  await writeFile(join(cwd, 'request.json'), before);
  await symlink(cwd, join(cwd, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  const io = streams();
  const code = await runCli(['validate', 'request.json', '--output', 'alias/request.json', '--force'], { ...io, cwd, env: {} });
  assert.equal(code, 2, io.error());
  assert.equal(JSON.parse(io.error()).error.code, 'USAGE_ERROR');
  assert.equal(await readFile(join(cwd, 'request.json'), 'utf8'), before);
});

test('input protection also rejects a hard-link alias', async t => {
  const cwd = await temporaryWorkspace(t); const before = JSON.stringify(request) + '\n';
  await writeFile(join(cwd, 'request.json'), before); await link(join(cwd, 'request.json'), join(cwd, 'other.json'));
  const io = streams();
  assert.equal(await runCli(['validate', 'request.json', '--output', 'other.json', '--force'], { ...io, cwd, env: {} }), 2);
  assert.equal(JSON.parse(io.error()).error.code, 'USAGE_ERROR');
  assert.equal(await readFile(join(cwd, 'request.json'), 'utf8'), before);
  assert.equal(await readFile(join(cwd, 'other.json'), 'utf8'), before);
});

test('pre-cancelled writer creates no temporary file', async t => {
  const cwd = await temporaryWorkspace(t); const controller = new AbortController(); controller.abort();
  await assert.rejects(createWriter({ output: 'result.json', cwd, signal: controller.signal }), { code: 'ABORTED' });
  assert.deepEqual(await readdir(cwd), []);
});
