const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const clientDirectory = __dirname;
const distDirectory = path.join(clientDirectory, 'dist');
const watch = process.argv.includes('--watch');

// Combine matching source files in filename order so every stylesheet and
// script is included consistently in the generated client bundles.
const bundleSourceFiles = (sourceDirectory, extension) => fs.readdirSync(sourceDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && path.extname(entry.name) === extension)
  .sort((left, right) => left.name.localeCompare(right.name))
  .map((entry) => fs.readFileSync(path.join(sourceDirectory, entry.name), 'utf8'))
  .join('\n\n');

// Create the generated output folder and copy browser assets beside the story
// so the Express server can serve them from the same directory.
fs.mkdirSync(distDirectory, { recursive: true });
fs.writeFileSync(
  path.join(distDirectory, 'client.js'),
  bundleSourceFiles(path.join(clientDirectory, 'src/scripts'), '.js'),
);
fs.writeFileSync(
  path.join(distDirectory, 'client.css'),
  bundleSourceFiles(path.join(clientDirectory, 'src/styles'), '.css'),
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
