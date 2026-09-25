import { runCli } from '../src/cli/main.mjs';
import { fileURLToPath } from 'node:url';
if (process.env.RUN_LIVE_TESTS !== '1') {
  console.error('Live inference is opt-in and may incur charges. Set RUN_LIVE_TESTS=1 and provide the intended provider credentials.');
  process.exitCode = 2;
} else {
  process.exitCode = await runCli(['evaluate', fileURLToPath(new URL('../examples/request.json', import.meta.url)), ...process.argv.slice(2)]);
}
