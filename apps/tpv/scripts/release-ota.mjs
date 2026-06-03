#!/usr/bin/env node
// Genera un bundle OTA del TPV y lo publica en api.mrtpvrest.com.
//
// Uso:
//   pnpm --filter @mrtpvrest/tpv ota:release [--version 1.0.5] [--channel production] [--notes "..."]
//
// Vars de entorno requeridas:
//   OTA_API_URL       (default https://api.mrtpvrest.com)
//   OTA_PUBLISH_TOKEN token de servicio estático (igual al del backend). Recomendado.
//   OTA_ADMIN_TOKEN   alternativa: JWT de SUPER_ADMIN (login en admin → localStorage 'token'). Caduca a los 15 min.
//
// Pasos:
//   1) Lee versión de package.json (o de --version)
//   2) Corre `next build` con CAPACITOR_BUILD=true para generar `out/`
//   3) Empaqueta `out/` en un zip
//   4) POST multipart al backend → /api/ota/publish
//
// Diseño: el zip se queda en memoria; no escribimos archivo intermedio.

import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tpvRoot = join(__dirname, '..');

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
  const pkg = JSON.parse(readFileSync(join(tpvRoot, 'package.json'), 'utf8'));
  return pkg.version;
}

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = execSync(`${cmd} ${args.join(' ')}`, { stdio: 'inherit', cwd: tpvRoot, ...opts });
  return r;
}

async function zipDir(srcDir) {
  // Usa el zip nativo de Node 22+ vía `node:zlib` no — más simple: invocar
  // PowerShell Compress-Archive en Windows o `zip` en *nix. Para portable
  // usamos `archiver` si está disponible, si no fallback a CLI.
  let archiver;
  try {
    archiver = (await import('archiver')).default;
  } catch {
    throw new Error(
      'Falta la dep `archiver`. Instala con: pnpm --filter @mrtpvrest/tpv add -D archiver'
    );
  }

  const { PassThrough } = await import('node:stream');
  const chunks = [];
  const stream = new PassThrough();
  stream.on('data', (c) => chunks.push(c));

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('warning', (err) => console.warn('[zip warn]', err));
  archive.on('error', (err) => {
    throw err;
  });
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
    console.error(`Versión inválida: ${version}. Formato esperado X.Y.Z`);
    process.exit(1);
  }

  const apiBase = process.env.OTA_API_URL || 'https://api.mrtpvrest.com';
  // Preferimos el token de servicio estático (no caduca); como fallback,
  // un JWT humano de SUPER_ADMIN copiado del admin.
  const token = process.env.OTA_PUBLISH_TOKEN || process.env.OTA_ADMIN_TOKEN;
  if (!token) {
    console.error('Falta credencial: setea OTA_PUBLISH_TOKEN (token de servicio) o OTA_ADMIN_TOKEN (JWT SUPER_ADMIN del admin).');
    process.exit(1);
  }

  console.log(`\n>>> Release OTA TPV v${version} (channel=${args.channel})`);

  console.log('\n[1/3] Building Next.js export…');
  run('npx', ['cross-env', 'CAPACITOR_BUILD=true', 'next', 'build']);

  const outDir = join(tpvRoot, 'out');
  try {
    statSync(outDir);
  } catch {
    console.error(`No existe ${outDir} tras el build.`);
    process.exit(1);
  }

  console.log('\n[2/3] Zipping out/…');
  const zipBuf = await zipDir(outDir);
  console.log(`   bundle: ${(zipBuf.length / 1024 / 1024).toFixed(2)} MB`);

  console.log('\n[3/3] Uploading to backend…');
  const form = new FormData();
  const blob = new Blob([zipBuf], { type: 'application/zip' });
  form.append('bundle', blob, `tpv-${version}.zip`);
  form.append('appId', 'com.mrtpvrest.tpv');
  form.append('version', version);
  form.append('channel', args.channel);
  if (args.notes) form.append('notes', args.notes);

  const res = await fetch(`${apiBase}/api/ota/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Falló publish: ${res.status} ${text}`);
    process.exit(1);
  }

  const json = await res.json();
  console.log('\n✓ Release publicado:');
  console.log(JSON.stringify(json.bundle, null, 2));
}

main().catch((e) => {
  console.error('release-ota failed:', e);
  process.exit(1);
});
