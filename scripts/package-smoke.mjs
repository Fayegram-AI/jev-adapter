import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { readdirSync } from 'node:fs';
import { npmCommand } from './toolchain.mjs';
import { isLocalOnlyPath } from './layout.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'decision package '));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('DECISION_') &&
  !['TYPESAFE_API_KEY', 'JEV_MODEL', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY'].includes(key)));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw Error(`${command} failed (${result.status}): ${result.stderr || result.error}`);
  return result.stdout;
}
function runNpm(args, cwd) {
  const npm = npmCommand();
  return run(npm.command, [...npm.prefix, ...args], cwd);
}
try {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 2 && args[0] === '--tarball'),
    'Usage: node scripts/package-smoke.mjs [--tarball FILE]');
  const parsedPack = args.length ? null
    : JSON.parse(runNpm(['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], root));
  const pack = args.length ? { filename: resolve(args[1]) }
    : (Array.isArray(parsedPack) ? parsedPack[0] : Object.values(parsedPack)[0]);
  if (pack.files) assert(!pack.files.some(file => /(^|\/)\.env$|\.git\/|node_modules\/|^test\//.test(file.path)));
  const tarball = resolve(temporary, pack.filename);
  const consumer = join(temporary, 'consumer'); mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), '{"name":"package-smoke-consumer","private":true,"type":"module"}\n');
  runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--offline', tarball], consumer);
  const { name, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const script = `import assert from 'node:assert/strict';
import { createAdapter, noul, createProvider, buildResponseSchema } from ${JSON.stringify(name)};
const adapter = createAdapter({ provider: { name: 'package-test-fixture', defaultModel: 'fixture', async evaluate(r) {
  return { model: r.model, answers: { yes: { type: 'noul', noul: 0.5 } }, usage: { input_tokens: null, output_tokens: null } };
} } });
const result = await adapter.evaluate({ state: 'Local package test, not live inference.', questions: { yes: noul('True?') } });
assert.equal(result.answers.yes.noul, 0.5);
assert.equal(result.meta.adapterVersion, ${JSON.stringify(version)});
assert.equal(typeof createProvider, 'function');
assert.equal(buildResponseSchema({ yes: noul('True?') }).type, 'object');
console.log('Installed SDK imports and evaluates a local test fixture.');\n`;
  writeFileSync(join(consumer, 'smoke.mjs'), script);
  console.log(run(process.execPath, ['smoke.mjs'], consumer).trim());
  const installed = join(consumer, 'node_modules', name);
  assert.equal(run(process.execPath, [join(installed, 'bin/jev.mjs'), '--version'], consumer).trim(), version);
  assert.equal(JSON.parse(run(process.execPath, [join(installed, 'bin/jev.mjs'), 'validate'], consumer)).valid, true);
  const binShim = join(consumer, 'node_modules/.bin', process.platform === 'win32' ? 'jev-decision.cmd' : 'jev-decision');
  assert(existsSync(binShim));
  const installedCli = (...args) => run(process.execPath, [join(installed, 'bin/jev.mjs'), ...args], consumer);
  assert.equal(runNpm(['exec', '--offline', '--', 'jev-decision', '--version'], consumer).trim(), version);
  assert.match(installedCli('--help'), /Usage:\s*jev-decision init/);
  assert.equal(runNpm(['exec', '--offline', '--', 'decision', '--version'], consumer).trim(), version);
  const initialized = JSON.parse(runNpm(['exec', '--offline', '--', 'jev-decision', 'init', './my-decisions'], consumer));
  assert.equal(initialized.initialized, true);
  for (const file of ['decision.config.json', 'request.json', '.env.example', '.gitignore']) {
    assert(existsSync(join(consumer, 'my-decisions', file)), `Installed CLI did not create ${file}.`);
  }
  assert.equal(JSON.parse(runNpm(['exec', '--offline', '--', 'jev-decision', 'validate', './my-decisions/request.json'], consumer)).valid, true);
  assert.equal(JSON.parse(installedCli('schema', './my-decisions/request.json')).type, 'object');
  // Exercise installed commands without contacting a model account.
  writeFileSync(join(consumer, 'provider.mjs'), `export function createProvider() {
    return {
      name: 'package-cli-fixture', defaultModel: 'fixture', probabilitySource: 'synthetic',
      async evaluate(request) {
        return { model: request.model, answers: { yes: { type: 'noul', noul: 0.5 } },
          usage: { input_tokens: null, output_tokens: null } };
      },
      async listModels() { return { models: [{ name: 'fixture' }] }; },
    };
  }\n`);
  const offlineRequest = { state: 'package check', questions: { yes: { type: 'noul', instructions: 'True?' } } };
  writeFileSync(join(consumer, 'request.json'), JSON.stringify(offlineRequest));
  assert.equal(JSON.parse(installedCli('evaluate', './request.json', '--provider-module', './provider.mjs'))
    .answers.yes.noul, 0.5);
  assert.equal(JSON.parse(installedCli('models', '--provider-module', './provider.mjs'))
    .models[0].name, 'fixture');
  writeFileSync(join(consumer, 'requests.jsonl'), `${JSON.stringify(offlineRequest)}\n${JSON.stringify(offlineRequest)}\n`);
  const batch = installedCli('batch', './requests.jsonl', '--provider-module', './provider.mjs')
    .trim().split('\n').map(JSON.parse);
  assert.deepEqual(batch.map(record => [record.line, record.ok, record.result.answers.yes.noul]),
    [[1, true, 0.5], [2, true, 0.5]]);
  assert(existsSync(join(installed, 'src/index.d.mts')));
  // Verify actual installed bytes and every relative Markdown link, not just an import.
  function files(directory, prefix = '') {
    return readdirSync(directory, { withFileTypes: true }).flatMap(item => {
      const name = prefix + item.name;
      assert(!item.isSymbolicLink(), 'Unexpected symlink in installed package.');
      return item.isDirectory() ? files(join(directory, item.name), name + '/') : [name];
    });
  }
  const installedFiles = files(installed);
  assert(installedFiles.includes('README.md'), 'README.md missing from installed package.');
  assert(!installedFiles.includes('.npmrc'), 'Project npm configuration leaked into installed package.');
  for (const name of installedFiles) {
    assert(!isLocalOnlyPath(name), `Local material leaked into npm package: ${name}`);
    assert(!/(^|\/)\.env$|^(?:test|scripts|benchmarks|\.github)\//.test(name), `Development-only file in npm package: ${name}`);
    assert(existsSync(join(root, name)), `Unexpected installed file: ${name}`);
    assert.deepEqual(readFileSync(join(installed, name)), readFileSync(join(root, name)), `Installed content mismatch: ${name}`);
    if (!name.endsWith('.md')) continue;
    for (const match of readFileSync(join(installed, name), 'utf8').matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      assert(existsSync(resolve(dirname(join(installed, name)), decodeURIComponent(target))), `Broken installed-doc link: ${name} -> ${target}`);
    }
  }
  for (const directory of ['src', 'bin', 'docs', 'examples']) {
    for (const name of files(join(root, directory), directory + '/')) {
      if (/(^|\/)\.gitignore$/.test(name)) continue;
      assert(installedFiles.includes(name), `Missing installed file: ${name}`);
    }
  }
  console.log(`Installed package bytes and documentation links verified (${installedFiles.length} files).`);
  console.log(`npm tarball ${pack.filename}: clean offline installation, CLI commands, SDK exports, bundled sample and declarations passed.`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
