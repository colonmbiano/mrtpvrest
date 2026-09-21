#!/usr/bin/env node

const { readdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const backendRoot = resolve(__dirname, '..');
const repoRoot = resolve(backendRoot, '..', '..');
const roots = [
  join(backendRoot, 'src'),
  join(backendRoot, 'scripts'),
  join(repoRoot, 'packages', 'database'),
];

function collectJavaScriptFiles(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collectJavaScriptFiles(path, files);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
  }
  return files;
}

const files = roots.flatMap((root) => collectJavaScriptFiles(root));
let failures = 0;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit',
  });
  if (result.status !== 0) failures += 1;
}

if (failures > 0) {
  console.error(`Syntax check failed for ${failures} JavaScript file(s).`);
  process.exit(1);
}

console.log(`Syntax check passed for ${files.length} JavaScript file(s).`);
