import { spawnSync } from 'node:child_process';
import path from 'node:path';

function run(executable, args) {
  const result = spawnSync(executable, args, { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
if (process.platform === 'win32') run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.resolve('scripts/prepare-windows-build.ps1')]);
run(process.execPath, [path.resolve('node_modules/vinext/dist/cli.js'), 'build']);
run(process.execPath, [path.resolve('scripts/build-pwa.mjs')]);
