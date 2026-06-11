#!/usr/bin/env node
// Patch automático para plugins Capacitor Android que aún usan
// `getDefaultProguardFile('proguard-android.txt')`. AGP 9+ falla el
// build con:
//   `getDefaultProguardFile('proguard-android.txt')` is no longer
//   supported since it includes `-dontoptimize`...
//
// Reemplaza in-place a `proguard-android-optimize.txt` en cualquier
// build.gradle bajo node_modules. Idempotente.
//
// Se ejecuta vía script "postinstall" del package.json de delivery.
// Necesario desde que delivery incluye @capgo/capacitor-updater, cuyo
// build.gradle nativo trae el proguard file viejo.

const fs = require('fs');
const path = require('path');

const NEEDLE   = "proguard-android.txt";
const REPLACE  = "proguard-android-optimize.txt";

// pnpm hoists todo a <repo-root>/node_modules/.pnpm. apps/delivery/node_modules
// solo tiene symlinks. Recorremos AMBOS para cubrir cualquier layout
// (workspace pnpm + npm-style flat).
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
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    // Saltar symlinks para evitar loops y duplicar trabajo (pnpm).
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      walk(full);
    } else if (e.isFile() && e.name === 'build.gradle' && full.includes(`${path.sep}android${path.sep}`)) {
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

for (const r of SEARCH_ROOTS) {
  walk(r);
}
console.log(`[patch-android-plugins] done. patched=${patched}`);
