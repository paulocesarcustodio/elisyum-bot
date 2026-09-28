#!/usr/bin/env bun
// Compatibility entry point: works before installing any JavaScript dependency.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url));
const child = spawn('python3', ['scripts/setup-local.py', ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.once(signal, () => child.kill(signal));
}
child.once('error', error => { console.error(error.message); process.exit(1); });
child.once('exit', (code, signal) => process.exit(code ?? (signal === 'SIGINT' ? 130 : 1)));
