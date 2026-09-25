import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync(new URL('../test/', import.meta.url)).filter(name => name.endsWith('.test.mjs')).sort().map(name => `test/${name}`);
const coverage = process.argv.includes('--coverage') ? ['--experimental-test-coverage', '--test-coverage-include=src/**', '--test-coverage-include=bin/**', '--test-coverage-lines=90', '--test-coverage-branches=80', '--test-coverage-functions=85'] : [];
const reporter = process.argv.includes('--tap') ? ['--test-reporter=tap'] : [];
const result = spawnSync(process.execPath, ['--test', ...reporter, ...coverage, ...files], { cwd: new URL('..', import.meta.url), stdio: 'inherit' });
process.exitCode = result.status ?? 1;
