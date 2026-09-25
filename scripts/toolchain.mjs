import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Prefer the npm JavaScript entry point: never interpolate paths into cmd.exe. */
export function npmCommand({ env = process.env, execPath = process.execPath, platform = process.platform } = {}) {
  const candidates = [env.npm_execpath,
    resolve(dirname(execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  const entry = candidates.find(path => typeof path === 'string' && existsSync(path));
  if (entry) return { command: execPath, prefix: [entry] };
  if (platform !== 'win32') return { command: 'npm', prefix: [] };
  throw Error('Cannot locate npm-cli.js. Install npm and run this check through npm run verify.');
}
