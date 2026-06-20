#!/usr/bin/env node
// Genera un bundle OTA de MODA+ y lo publica en api.mrtpvrest.com.
//
// Uso:
//   pnpm --filter @mrtpvrest/moda ota:release [--version 1.0.5] [--channel production] [--notes "..."]
//
// Vars de entorno:
//   OTA_API_URL        (default https://api.mrtpvrest.com)
//   OTA_PUBLISH_TOKEN  token de servicio estático (igual al del backend). Recomendado.
//   OTA_ADMIN_TOKEN    alternativa: JWT de SUPER_ADMIN (caduca pronto).
//
// El versionado normal lo hace el CI (1.0.<nº commits apps/moda>); este script es
// para publicar a mano. La versión DEBE ser > la nativa del APK (1.0.0).

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const modaRoot = join(__dirname, '..');

function parseArgs() {
  const out = { channel: 'production', notes: null, version: null };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--version') out.version = process.argv[++i];
    else if (a === '--channel') out.channel = process.argv[++i];
    else if (a === '--notes') out.notes = process.argv[++i];
  }
  return out;
}

function readPkgVersion() {
  return JSON.parse(readFileSync(join(modaRoot, 'package.json'), 'utf8')).version;
}

function run(cmd, args) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  execSync(`${cmd} ${args.join(' ')}`, { stdio: 'inherit', cwd: modaRoot });
}

async function zipDir(srcDir) {
  let archiver;
  try {
    archiver = (await import('archiver')).default;
  } catch {
    throw new Error('Falta `archiver`. Instala: pnpm --filter @mrtpvrest/moda add -D archiver');
  }
  const { PassThrough } = await import('node:stream');
  const chunks = [];
  const stream = new PassThrough();
  stream.on('data', (c) => chunks.push(c));
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => { throw err; });
  archive.pipe(stream);
  archive.directory(srcDir, false);
  await archive.finalize();
  await new Promise((r) => stream.on('end', r));
  return Buffer.concat(chunks);
}

async function main() {
  const args = parseArgs();
  const version = args.version || readPkgVersion();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`Versión inválida: ${version} (esperado X.Y.Z)`);
    process.exit(1);
  }
  const apiBase = process.env.OTA_API_URL || 'https://api.mrtpvrest.com';
  const token = process.env.OTA_PUBLISH_TOKEN || process.env.OTA_ADMIN_TOKEN || process.env.OTA_BUILD_SECRET;
  if (!token) {
    console.error('Falta credencial: OTA_PUBLISH_TOKEN, OTA_ADMIN_TOKEN u OTA_BUILD_SECRET.');
    process.exit(1);
  }

  console.log(`\n>>> Release OTA MODA+ v${version} (channel=${args.channel})`);
  console.log('\n[1/3] next build (export)…');
  run('npx', ['cross-env', 'CAPACITOR_BUILD=true', 'next', 'build']);

  const outDir = join(modaRoot, 'out');
  try { statSync(outDir); } catch { console.error(`No existe ${outDir}.`); process.exit(1); }

  console.log('\n[2/3] zip out/…');
  const zipBuf = await zipDir(outDir);
  console.log(`   bundle: ${(zipBuf.length / 1024 / 1024).toFixed(2)} MB`);

  console.log('\n[3/3] upload…');
  const form = new FormData();
  form.append('bundle', new Blob([zipBuf], { type: 'application/zip' }), `moda-${version}.zip`);
  form.append('appId', 'com.mrtpvrest.moda');
  form.append('version', version);
  form.append('channel', args.channel);
  if (args.notes) form.append('notes', args.notes);

  const headers = {};
  if (process.env.OTA_BUILD_SECRET) headers['X-OTA-Build-Token'] = process.env.OTA_BUILD_SECRET;
  else headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${apiBase}/api/ota/publish`, { method: 'POST', headers, body: form });
  if (!res.ok) { console.error(`Falló publish: ${res.status} ${await res.text()}`); process.exit(1); }
  console.log('\n✓ Publicado:', JSON.stringify((await res.json()).bundle, null, 2));
}

main().catch((e) => { console.error('release-ota failed:', e); process.exit(1); });
