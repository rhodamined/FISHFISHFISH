const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const clientDirectory = __dirname;
const distDirectory = path.join(clientDirectory, 'dist');
const watch = process.argv.includes('--watch');

// Create the generated output folder and copy browser assets beside the story
// so the Express server can serve them from the same directory.
fs.mkdirSync(distDirectory, { recursive: true });
fs.copyFileSync(
  path.join(clientDirectory, 'src/scripts/client.js'),
  path.join(distDirectory, 'client.js'),
);
fs.copyFileSync(
  path.join(clientDirectory, 'src/styles/client.css'),
  path.join(distDirectory, 'client.css'),
);

// Tell Tweego to compile the Twee source, inject the shared head markup, and
// write the resulting playable HTML file to the generated output folder.
const args = [
  '-o',
  'dist/index.html',
  '--head=src/head-content.html',
  'project/twee',
];

if (watch) args.push('-w');

// Run Tweego from the client root so its input, output, and head paths resolve
// consistently for both the one-time build and watch mode.
const result = spawnSync('tweego', args, {
  cwd: clientDirectory,
  stdio: 'inherit',
});

// Fail explicitly if Tweego is unavailable or exits unsuccessfully, preserving
// its exit status so npm scripts and other callers can detect a failed build.
if (result.error) {
  throw new Error(`Unable to run Tweego: ${result.error.message}`, {
    cause: result.error,
  });
}

if (result.status !== 0) {
  process.exitCode = result.status ?? 1;
}
