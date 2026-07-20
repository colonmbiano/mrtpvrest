#!/usr/bin/env node
/**
 * Regenera la guía de usuario en PDF a partir de docs/guia-usuario.md.
 *
 * Uso:
 *   node scripts/build-guia-pdf.js            # genera docs/pdf/guia-usuario.pdf
 *   node scripts/build-guia-pdf.js otra.md salida.pdf
 *   pnpm docs:guia-pdf
 *
 * Requisitos (ya en el repo):
 *   - marked            (devDependency)
 *   - @playwright/test  (devDependency) + navegador Chromium instalado
 *       Si falla por falta de navegador: `pnpm exec playwright install chromium`
 *
 * Nota: el PDF es una foto del .md. Si cambias una pantalla del POS/panel y
 * actualizas la captura en docs/img/guia/, vuelve a correr este script para
 * mantener el PDF al día (y commitea el resultado).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');

const SRC = path.resolve(process.argv[2] || path.join(DOCS, 'guia-usuario.md'));
const OUT = path.resolve(process.argv[3] || path.join(DOCS, 'pdf', 'guia-usuario.pdf'));
// La ruta base para resolver imágenes relativas del Markdown (img/guia/...).
const ASSET_BASE = path.dirname(SRC);

let marked;
try {
  ({ marked } = require('marked'));
} catch (e) {
  console.error('Falta "marked". Instala dependencias con: pnpm install');
  process.exit(1);
}
let chromium;
try {
  ({ chromium } = require('@playwright/test'));
} catch (e) {
  console.error('Falta "@playwright/test". Instala dependencias con: pnpm install');
  process.exit(1);
}

if (!fs.existsSync(SRC)) {
  console.error(`No existe el archivo fuente: ${SRC}`);
  process.exit(1);
}

let md = fs.readFileSync(SRC, 'utf8');

// --- Avisos estilo GitHub (> [!TIP] ...) → recuadros de color -----------------
const ALERT = {
  NOTE: 'nota',
  TIP: 'consejo',
  IMPORTANT: 'importante',
  WARNING: 'atención',
  CAUTION: 'cuidado',
};
function transformAlerts(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/);
    if (m) {
      const kind = m[1];
      i++;
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      const inner = marked.parse(buf.join('\n'), { gfm: true });
      out.push(
        `<div class="callout callout-${kind.toLowerCase()}">` +
          `<div class="callout-title">${ALERT[kind]}</div>${inner}</div>`
      );
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out.join('\n');
}
md = transformAlerts(md);

// --- Markdown → HTML, con imágenes embebidas como data URI --------------------
let bodyHtml = marked.parse(md, { gfm: true, breaks: false });

bodyHtml = bodyHtml.replace(/<img([^>]*?)src="([^"]+)"([^>]*)>/g, (full, pre, src, post) => {
  if (/^data:|^https?:/i.test(src)) return full;
  const file = path.isAbsolute(src) ? src : path.join(ASSET_BASE, src);
  try {
    const data = fs.readFileSync(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime =
      ext === 'webp'
        ? 'image/webp'
        : ext === 'png'
        ? 'image/png'
        : ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'svg'
        ? 'image/svg+xml'
        : 'image/' + ext;
    return `<img${pre}src="data:${mime};base64,${data.toString('base64')}"${post}>`;
  } catch (e) {
    console.warn(`⚠ No se pudo embeber la imagen: ${src}`);
    return full;
  }
});

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<style>
  :root { --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; --brand:#16a34a; --code-bg:#f6f8fa; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
         color: var(--ink); line-height: 1.6; font-size: 10.5pt; margin: 0; }
  .wrap { padding: 0 2px; }
  p[align="center"], h1[align="center"] { text-align: center; }
  h1 { font-size: 22pt; line-height:1.15; margin: 4px 0 6px; letter-spacing:-0.02em; }
  h2 { font-size: 15pt; margin: 26px 0 10px; padding: 10px 0 0;
       border-top: 2px solid var(--brand); color:#0b3d1e; break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 16px 0 6px; color:#0b3d1e; break-after: avoid; }
  p { margin: 7px 0; }
  a { color: var(--brand); text-decoration: none; }
  sub { color: var(--muted); font-size: 8.6pt; display:block; margin-top:2px; }
  img { max-width: 100%; height: auto; display:block; margin: 10px auto;
        border: 1px solid var(--line); border-radius: 10px; }
  p[align="center"] img { border:none; margin: 0 auto 6px; }
  code { font-family: "SF Mono","DejaVu Sans Mono",Menlo,Consolas,monospace; font-size: 9pt;
         background: var(--code-bg); padding: 1px 5px; border-radius: 4px; }
  pre { background: var(--code-bg); border: 1px solid var(--line); border-radius: 8px;
        padding: 10px 12px; overflow-x: auto; font-size: 8.6pt; }
  pre code { background:none; padding:0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 9.2pt; break-inside: avoid; }
  th, td { border: 1px solid var(--line); padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background:#f1f5f9; font-weight:600; }
  tr:nth-child(even) td { background:#fafbfc; }
  ul, ol { margin: 7px 0; padding-left: 22px; }
  li { margin: 4px 0; }
  hr { border:none; border-top:1px solid var(--line); margin: 20px 0; }
  blockquote { margin: 10px 0; padding: 8px 14px; border-left: 4px solid var(--muted);
        background:#f8fafc; color:#334155; border-radius: 4px; }
  .callout { margin: 12px 0; padding: 10px 14px; border-radius: 10px; border: 1px solid;
             break-inside: avoid; font-size: 9.8pt; }
  .callout p:first-child { margin-top: 0; } .callout p:last-child { margin-bottom: 0; }
  .callout-title { font-weight: 700; font-size: 8.4pt; text-transform: uppercase;
        letter-spacing: .06em; margin-bottom: 4px; }
  .callout-tip       { background:#f0fdf4; border-color:#bbf7d0; }
  .callout-tip .callout-title { color:#15803d; }
  .callout-note      { background:#eff6ff; border-color:#bfdbfe; }
  .callout-note .callout-title { color:#1d4ed8; }
  .callout-important { background:#faf5ff; border-color:#e9d5ff; }
  .callout-important .callout-title { color:#7e22ce; }
  .callout-warning   { background:#fffbeb; border-color:#fde68a; }
  .callout-warning .callout-title { color:#b45309; }
  .callout-caution   { background:#fef2f2; border-color:#fecaca; }
  .callout-caution .callout-title { color:#b91c1c; }
  figure, img { break-inside: avoid; }
</style>
</head>
<body><div class="wrap">${bodyHtml}</div></body>
</html>`;

// Busca un ejecutable de Chromium ya instalado (por si el navegador que espera
// @playwright/test no está descargado). Permite forzarlo con GUIA_PDF_CHROMIUM.
function findChromium() {
  if (process.env.GUIA_PDF_CHROMIUM) return process.env.GUIA_PDF_CHROMIUM;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const candidates = [];
    for (const dir of fs.readdirSync(base)) {
      if (!/^chromium-/.test(dir)) continue;
      for (const rel of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
        const p = path.join(base, dir, rel);
        if (fs.existsSync(p)) candidates.push(p);
      }
    }
    return candidates.sort().pop() || null; // el build más reciente
  } catch (e) {
    return null;
  }
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (err) {
    const exe = findChromium();
    if (exe) return chromium.launch({ executablePath: exe });
    console.error(
      'No se encontró un navegador Chromium. Instálalo con:\n' +
        '  pnpm exec playwright install chromium\n' +
        'o exporta GUIA_PDF_CHROMIUM=/ruta/a/chrome'
    );
    throw err;
  }
}

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.pdf({
      path: OUT,
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '16mm', left: '16mm', right: '16mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%; font-size:7.5pt; color:#94a3b8; padding:0 16mm; ' +
        'display:flex; justify-content:space-between;">' +
        '<span>MRTPV Retail · Guía de uso</span>' +
        '<span>Pág. <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    });
  } finally {
    await browser.close();
  }
  console.log(`✔ PDF generado: ${path.relative(ROOT, OUT)}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
