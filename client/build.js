const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const clientDirectory = __dirname;
const distDirectory = path.join(clientDirectory, 'dist');
const watch = process.argv.includes('--watch');

fs.mkdirSync(distDirectory, { recursive: true });
fs.copyFileSync(
  path.join(clientDirectory, 'src/scripts/client.js'),
  path.join(distDirectory, 'client.js'),
);
fs.copyFileSync(
  path.join(clientDirectory, 'src/styles/client.css'),
  path.join(distDirectory, 'client.css'),
);

const args = [
  '-o',
  'dist/index.html',
  '--head=src/head-content.html',
  'project/twee',
];

if (watch) args.push('-w');

const result = spawnSync('tweego', args, {
  cwd: clientDirectory,
  stdio: 'inherit',
});

if (result.error) {
  throw new Error(`Unable to run Tweego: ${result.error.message}`, {
    cause: result.error,
  });
}

if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
