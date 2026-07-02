/**
 * worker.js — Entrypoint STANDALONE del bot "Cajero Estrella".
 *
 * Corre en un servicio Railway APARTE del backend API (whatsapp-web.js necesita
 * Chromium + una sesión persistente single-instance; no queremos eso dentro del
 * contenedor del API ni acoplar su ciclo de vida a cada deploy). Este proceso:
 *   1. Levanta el cliente de WhatsApp (initWhatsApp) — puppeteer usa el Chromium
 *      del sistema (PUPPETEER_EXECUTABLE_PATH) y la sesión vive en el volumen
 *      (WWEBJS_DATA_PATH).
 *   2. Expone un mini servidor HTTP para healthcheck y para VER/ESCANEAR el QR
 *      desde el navegador (GET /qr) sin depender de los logs.
 *   3. Crea las órdenes contra el backend API por HTTP (WHATSAPP_BOT_API_BASE),
 *      NO por localhost (aquí no vive el API).
 *
 * Env requeridas: GOOGLE_AI_API_KEY, DATABASE_URL, JWT_SECRET,
 *   WHATSAPP_BOT_API_BASE, WHATSAPP_BOT_RESTAURANT_ID.
 * Env de contenedor: PUPPETEER_EXECUTABLE_PATH, WWEBJS_DATA_PATH.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { initWhatsApp, getWhatsAppClient, getLatestQr, getIgnoredGroupInfo, refreshIgnoredGroup } = require('./client');

// Al correr con volumen persistente, Chromium deja archivos Singleton* (lock del
// perfil) en el userDataDir dentro del volumen. Como cada deploy es un contenedor
// nuevo (otra "máquina"), el nuevo Chromium ve el lock del anterior y se niega a
// lanzar: "The profile appears to be in use by another Chromium process". La
// sesión de WhatsApp NO se corrompe; solo hay que borrar el lock rancio al boot.
function limpiarLocksChromium(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (/^Singleton(Lock|Cookie|Socket)$/.test(e.name)) {
      try { fs.rmSync(full, { force: true }); console.log(`[WhatsApp Worker] Lock rancio removido: ${full}`); } catch {}
    } else if (e.isDirectory()) {
      limpiarLocksChromium(full);
    }
  }
}

// ── Validación de entorno (fail-fast y ruidoso) ──────────────────────────────
if (!process.env.GOOGLE_AI_API_KEY) {
  console.error('[WhatsApp Worker] Falta GOOGLE_AI_API_KEY. Abortando.');
  process.exit(1);
}
if (!process.env.WHATSAPP_BOT_API_BASE) {
  // El worker NO co-habita con el API: sin esta base, orderProcessor caería a
  // localhost (donde no hay backend) y ninguna orden se crearía.
  console.warn('[WhatsApp Worker] ADVERTENCIA: WHATSAPP_BOT_API_BASE no está seteada; las órdenes intentarán ir a localhost y fallarán. Apúntala al backend (p.ej. https://api.mrtpvrest.com).');
}
if (!process.env.WHATSAPP_BOT_RESTAURANT_ID) {
  console.warn('[WhatsApp Worker] ADVERTENCIA: WHATSAPP_BOT_RESTAURANT_ID no está seteada; el bot usaría el restaurante activo más viejo de la BD.');
}

// ── Mini servidor HTTP: healthcheck + visor de QR ────────────────────────────
const PORT = parseInt(process.env.PORT || '3005', 10);

function isReady() {
  const c = getWhatsAppClient();
  return !!(c && c.info && c.info.wid);
}

function qrPageHtml() {
  const qr = getLatestQr();
  if (isReady()) {
    return '<!doctype html><meta charset="utf-8"><title>WhatsApp Bot</title>' +
      '<body style="font-family:system-ui;text-align:center;padding:3rem">' +
      '<h1>✅ Conectado</h1><p>El bot ya tiene sesión de WhatsApp activa.</p></body>';
  }
  if (!qr) {
    return '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="5">' +
      '<title>WhatsApp Bot</title>' +
      '<body style="font-family:system-ui;text-align:center;padding:3rem">' +
      '<h1>⏳ Esperando QR…</h1><p>Aún no hay código. Esta página se recarga sola.</p></body>';
  }
  const img = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qr)}`;
  return '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="10">' +
    '<title>WhatsApp Bot — Escanea el QR</title>' +
    '<body style="font-family:system-ui;text-align:center;padding:2rem">' +
    '<h1>Escanea con WhatsApp</h1>' +
    '<p>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</p>' +
    `<img src="${img}" width="320" height="320" alt="QR"/>` +
    '<p style="color:#888">La página se recarga cada 10 s (el QR rota).</p></body>';
}

const healthServer = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/qr') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(qrPageHtml());
  }
  if (url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  // Diagnóstico del grupo ignorado: cuántos miembros detectó + una muestra.
  // ?refresh=1 fuerza una recarga del grupo antes de responder.
  if (url === '/debug/ignore-group') {
    const doRespond = () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(getIgnoredGroupInfo(), null, 2));
    };
    if ((req.url || '').includes('refresh=1')) {
      refreshIgnoredGroup().then(doRespond).catch(doRespond);
      return;
    }
    return doRespond();
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    service: 'whatsapp-bot-worker',
    ready: isReady(),
    hasQr: !!getLatestQr(),
    qrUrl: '/qr',
  }));
});

healthServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[WhatsApp Worker] Health/QR server en :${PORT} (GET /qr para escanear).`);
});

// ── Arranque del bot ─────────────────────────────────────────────────────────
// io = null: no hay Socket.io en el worker; el QR se ve por logs y por /qr.
console.log('[WhatsApp Worker] Iniciando bot Cajero Estrella…');
// Limpia locks de Chromium del deploy anterior antes de lanzar el navegador.
limpiarLocksChromium(process.env.WWEBJS_DATA_PATH || '.');
initWhatsApp(null);

// ── Apagado limpio ───────────────────────────────────────────────────────────
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[WhatsApp Worker] ${signal} recibido, cerrando…`);
  try {
    const c = getWhatsAppClient();
    if (c) await c.destroy();
  } catch (e) {
    console.error('[WhatsApp Worker] Error cerrando el cliente:', e.message);
  }
  healthServer.close(() => process.exit(0));
  // Backstop: si algo se cuelga, salir a la fuerza.
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
