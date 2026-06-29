#!/usr/bin/env node
// Build and publish an Inventario OTA bundle to api.mrtpvrest.com.

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const APP_ID = 'com.mrtpvrest.inventario';
const APP_SLUG = 'inventario';
const APP_LABEL = 'Inventario';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, '..');

function parseArgs() {
  const out = { channel: 'production', notes: null, version: null };
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === '--version') out.version = process.argv[++i];
    else if (arg === '--channel') out.channel = process.argv[++i];
    else if (arg === '--notes') out.notes = process.argv[++i];
  }
  return out;
}

function readPkgVersion() {
  return JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')).version;
}

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execSync(`${cmd} ${args.join(' ')}`, { stdio: 'inherit', cwd: appRoot, ...opts });
}

async function zipDir(srcDir) {
  let archiver;
  try {
    archiver = (await import('archiver')).default;
  } catch {
    throw new Error(`Missing archiver. Run: pnpm --filter @mrtpvrest/${APP_SLUG} add -D archiver`);
  }

  const { PassThrough } = await import('node:stream');
  const chunks = [];
  const stream = new PassThrough();
  stream.on('data', (chunk) => chunks.push(chunk));

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('warning', (err) => console.warn('[zip warn]', err));
  archive.on('error', (err) => {
    throw err;
  });
  archive.pipe(stream);
  archive.directory(srcDir, false);
  await archive.finalize();
  await new Promise((resolve) => stream.on('end', resolve));

  return Buffer.concat(chunks);
}

async function main() {
  const args = parseArgs();
  const version = args.version || readPkgVersion();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`Invalid version: ${version}. Expected X.Y.Z`);
    process.exit(1);
  }

  const apiBase = process.env.OTA_API_URL || 'https://api.mrtpvrest.com';
  const token = process.env.OTA_PUBLISH_TOKEN || process.env.OTA_ADMIN_TOKEN || process.env.OTA_BUILD_SECRET;
  if (!token) {
    console.error('Missing credential: set OTA_PUBLISH_TOKEN, OTA_ADMIN_TOKEN, or OTA_BUILD_SECRET.');
    process.exit(1);
  }

  console.log(`\n>>> Release OTA ${APP_LABEL} v${version} (channel=${args.channel})`);

  console.log('\n[1/3] Building Next.js export...');
  run('npx', ['cross-env', 'CAPACITOR_BUILD=true', 'next', 'build']);

  const outDir = join(appRoot, 'out');
  try {
    statSync(outDir);
  } catch {
    console.error(`Missing ${outDir} after build.`);
    process.exit(1);
  }

  console.log('\n[2/3] Zipping out/...');
  const zipBuf = await zipDir(outDir);
  console.log(`   bundle: ${(zipBuf.length / 1024 / 1024).toFixed(2)} MB`);

  console.log('\n[3/3] Uploading to backend...');
  const form = new FormData();
  form.append('bundle', new Blob([zipBuf], { type: 'application/zip' }), `${APP_SLUG}-${version}.zip`);
  form.append('appId', APP_ID);
  form.append('version', version);
  form.append('channel', args.channel);
  if (args.notes) form.append('notes', args.notes);

  const headers = {};
  if (process.env.OTA_BUILD_SECRET) headers['X-OTA-Build-Token'] = process.env.OTA_BUILD_SECRET;
  else headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${apiBase}/api/ota/publish`, { method: 'POST', headers, body: form });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Publish failed: ${res.status} ${text}`);
    process.exit(1);
  }

  const json = await res.json();
  console.log('\nRelease published:');
  console.log(JSON.stringify(json.bundle, null, 2));
}

main().catch((err) => {
  console.error('release-ota failed:', err);
  process.exit(1);
});
