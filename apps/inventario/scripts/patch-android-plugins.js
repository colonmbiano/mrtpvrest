#!/usr/bin/env node
// Patch Capacitor Android plugins that still reference the old AGP proguard
// file. Idempotent and safe to run after every install.

const fs = require('fs');
const path = require('path');

const NEEDLE = 'proguard-android.txt';
const REPLACE = 'proguard-android-optimize.txt';

const SEARCH_ROOTS = [
  path.resolve(__dirname, '..', 'node_modules'),
  path.resolve(__dirname, '..', '..', '..', 'node_modules', '.pnpm'),
].filter((p) => fs.existsSync(p));

if (SEARCH_ROOTS.length === 0) {
  console.log('[patch-android-plugins] no node_modules to scan');
  process.exit(0);
}

let patched = 0;

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }

    if (entry.isFile() && entry.name === 'build.gradle' && full.includes(`${path.sep}android${path.sep}`)) {
      try {
        const src = fs.readFileSync(full, 'utf8');
        if (src.includes(`'${NEEDLE}'`) || src.includes(`"${NEEDLE}"`)) {
          const out = src
            .replace(new RegExp(`'${NEEDLE}'`, 'g'), `'${REPLACE}'`)
            .replace(new RegExp(`"${NEEDLE}"`, 'g'), `"${REPLACE}"`);
          fs.writeFileSync(full, out, 'utf8');
          patched += 1;
          console.log('[patch-android-plugins] patched:', full);
        }
      } catch (err) {
        console.warn('[patch-android-plugins] skip', full, err.message);
      }
    }
  }
}

for (const root of SEARCH_ROOTS) {
  walk(root);
}

console.log(`[patch-android-plugins] done. patched=${patched}`);
