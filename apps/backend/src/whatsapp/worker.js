/**
 * worker.js — Entrypoint STANDALONE del bot "Cajero Estrella".
 *
 * Decision operativa Master Burguers: se usa WhatsApp Web vinculado por QR para
 * conservar WhatsApp en el celular. No reemplazar este worker por Cloud API,
 * WHAPI u otro proveedor oficial para el numero principal sin aprobacion
 * explicita del negocio.
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

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const botConfig = require('./botConfig');
const { authorized, qrSvg } = require('./workerHttp');
const { initWhatsApp, destroyWhatsApp, clearAllHandoffs, getWhatsAppClient, getLatestQr, getSessionState, getIgnoredGroupInfo, refreshIgnoredGroup, getOperationalStatus } = require('./client');

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

// ── Validación de entorno ────────────────────────────────────────────────────
if (!process.env.GOOGLE_AI_API_KEY && !process.env.GROQ_API_KEY && process.env.OLLAMA_ENABLED === 'false') {
  console.error('[WhatsApp Worker] Falta proveedor de IA (Ollama local, GROQ_API_KEY o GOOGLE_AI_API_KEY). Abortando.');
  process.exit(1);
}
if (!process.env.WHATSAPP_BOT_API_BASE) {
  console.warn('[WhatsApp Worker] ADVERTENCIA: WHATSAPP_BOT_API_BASE no está seteada; las órdenes irán a localhost:3001.');
}
if (!process.env.WHATSAPP_BOT_RESTAURANT_ID) {
  console.warn('[WhatsApp Worker] ADVERTENCIA: WHATSAPP_BOT_RESTAURANT_ID no está seteada; el bot usaría el restaurante activo más viejo de la BD.');
}

// ── Mini servidor HTTP: healthcheck + visor de QR ────────────────────────────
const PORT = parseInt(process.env.PORT || '3005', 10);

function isReady() {
  return getSessionState() === 'ready';
}

function qrPageHtml() {
  if (!botConfig.shouldRunHere()) {
    return '<!doctype html><meta charset="utf-8"><title>WhatsApp Bot — Standby</title>' +
      '<body style="font-family:system-ui;text-align:center;padding:3rem">' +
      `<h1>⏸️ Modo Standby (${botConfig.getRunMode()})</h1>` +
      '<p>Este entorno está en espera para no chocar con la sesión activa en tu PC local.</p></body>';
  }
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
  const svg = qrSvg(qr);
  return '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="10">' +
    '<title>WhatsApp Bot — Escanea el QR</title>' +
    '<body style="font-family:system-ui;text-align:center;padding:2rem">' +
    '<h1>Escanea con WhatsApp</h1>' +
    '<p>WhatsApp → Dispositivos vinculados → Vincular un dispositivo</p>' +
    svg +
    '<p style="color:#888">La página se recarga cada 10 s (el QR rota).</p></body>';
}

const healthServer = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
  const protectedPaths = ['/qr', '/clear-handoffs', '/export-recent-chats', '/debug/ignore-group'];
  if (protectedPaths.includes(url)) {
    const token = process.env.WHATSAPP_BOT_ADMIN_TOKEN || process.env.WHATSAPP_BOT_DEBUG_TOKEN;
    if (!authorized(req, token, url === '/qr')) {
      res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Basic realm="WhatsApp admin"' });
      return res.end(JSON.stringify({ error: 'Autenticación requerida' }));
    }
    const mutation = ['/clear-handoffs', '/export-recent-chats'].includes(url) || (url === '/debug/ignore-group' && (req.url || '').includes('refresh=1'));
    if (mutation && req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); return res.end(); }
  }
  if (url === '/qr') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(qrPageHtml());
  }
  if (url === '/clear-handoffs') {
    const cleared = clearAllHandoffs();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, cleared }));
  }
  if (url === '/export-recent-chats') {
    const c = getWhatsAppClient();
    if (!c || !isReady() || !c.pupPage) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'WhatsApp client or page not ready' }));
    }
    (async () => {
      try {
        console.log('[WhatsApp Worker] Extrayendo chats via pupPage.evaluate...');
        const extracted = await c.pupPage.evaluate(() => {
          try {
            const chatStore = window.Store?.Chat || (window.require && window.require('WAWebCollections')?.Chat);
            if (!chatStore) return { error: 'No Chat store found in window.Store' };
            const models = typeof chatStore.getModelsArray === 'function' ? chatStore.getModelsArray() : chatStore.models;
            if (!models || !Array.isArray(models)) return { error: 'No models array found' };

            const list = [];
            for (const chat of models) {
              const id = chat.id?._serialized || String(chat.id || '');
              if (!id || chat.isGroup || id.includes('@broadcast') || id.includes('@newsletter')) continue;
              
              const rawMsgs = chat.msgs?.models || chat.msgs?._models || [];
              const msgs = [];
              for (const m of rawMsgs.slice(-20)) {
                if (!m) continue;
                msgs.push({
                  fromMe: !!(m.id?.fromMe || m.fromMe),
                  body: String(m.body || m.caption || ''),
                  type: String(m.type || ''),
                  timestamp: m.t || null,
                });
              }

              list.push({
                id,
                name: chat.name || chat.formattedTitle || null,
                unreadCount: chat.unreadCount || 0,
                timestamp: chat.t || null,
                messages: msgs,
              });
              if (list.length >= 100) break;
            }
            return { ok: true, chats: list };
          } catch (e) {
            return { error: e.message || String(e) };
          }
        });

        if (extracted.error) {
          console.error('[WhatsApp Worker] Error en evaluate:', extracted.error);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: extracted.error }));
        }

        const outPath = path.join(process.cwd(), '..', '..', 'logs', 'recent-chats.json');
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, JSON.stringify(extracted.chats, null, 2), 'utf8');
        console.log(`[WhatsApp Worker] Exportados exitosamente ${extracted.chats.length} chats a ${outPath}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, count: extracted.chats.length, file: outPath }));
      } catch (err) {
        console.error('[WhatsApp Worker] Error exportando chats:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    })();
    return;
  }
  if (url === '/healthz') {
    // Healthcheck de DEPLOY de Railway: 200 mientras el PROCESO viva (no acopla
    // la salud de la SESIÓN, para no romper la fase QR del primer deploy).
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  if (url === '/livez') {
    const state = getSessionState();
    const operations = getOperationalStatus();
    const ok = (state === 'ready' && operations.active && operations.exclusionsReady && operations.outbox.needsReview === 0) || !botConfig.shouldRunHere();
    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok, state, ...operations, runMode: botConfig.getRunMode(), standby: !botConfig.shouldRunHere() }));
  }
  // Diagnóstico del grupo ignorado: cuántos miembros detectó + una muestra.
  // GATEADO por token (expone teléfonos del staff). Requiere ?token= que iguale
  // WHATSAPP_BOT_DEBUG_TOKEN; sin la env, el endpoint queda deshabilitado.
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
    ...getOperationalStatus(),
    revision: 'wa-audit-fixes-2026-10-20',
    standby: !botConfig.shouldRunHere(),
    runMode: botConfig.getRunMode(),
    active: botConfig.getActive(),
    hasQr: !!getLatestQr(),
    qrUrl: '/qr',
  }));
});

healthServer.listen(PORT, process.env.WHATSAPP_BOT_BIND || (botConfig.isRailwayRuntime() ? '0.0.0.0' : '127.0.0.1'), () => {
  console.log(`[WhatsApp Worker] Health/QR server en :${PORT} (GET /qr para escanear).`);
});

// ── Arranque del bot con protección anti-choque Railway <-> PC Local ────────
(async () => {
  await botConfig.init();
  const dataDir = process.env.WWEBJS_DATA_PATH || '.';
  if (botConfig.shouldRunHere()) {
    console.log('[WhatsApp Worker] Iniciando bot Cajero Estrella en este entorno…');
    limpiarLocksChromium(dataDir);
    initWhatsApp(null);
  } else {
    console.log(`[WhatsApp Worker] STANDBY: runMode="${botConfig.getRunMode()}" — este entorno (${botConfig.isRailwayRuntime() ? 'Railway' : 'PC Local'}) NO abre WhatsApp para no chocar con la otra instancia.`);
  }

  // Vigilar cada 15s por si cambia runMode en BD:
  setInterval(async () => {
    try {
      const hasClient = !!getWhatsAppClient();
      if (!botConfig.shouldRunHere() && hasClient) {
        console.log('[WhatsApp Worker] Cambio a STANDBY detectado; cerrando sesión de WhatsApp en este entorno para evitar choque.');
        await destroyWhatsApp();
      } else if (botConfig.shouldRunHere() && !hasClient) {
        console.log('[WhatsApp Worker] Salida de STANDBY detectada; iniciando cliente de WhatsApp en este entorno.');
        limpiarLocksChromium(dataDir);
        initWhatsApp(null);
      }
    } catch (e) {
      console.error('[WhatsApp Worker] Error en monitor de standby:', e?.message || e);
    }
  }, 15000).unref?.();

  // Heartbeat cada 20s para reportar al panel admin que el bot local está en línea:
  const rid = process.env.WHATSAPP_BOT_RESTAURANT_ID;
  if (rid) {
    const { prisma } = require('@mrtpvrest/database');
    setInterval(async () => {
      try {
        if (getSessionState() === 'ready' && botConfig.shouldRunHere()) {
          await prisma.integrationConfig.updateMany({
            where: { restaurantId: rid, type: 'WHATSAPP_ASSISTANT' },
            data: { lastSync: new Date() },
          });
        }
      } catch (e) {}
    }, 20000).unref?.();
  }
})();

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

// Redes de seguridad: en Node 22 un unhandledRejection/uncaughtException MATA el
// proceso por defecto. Los logueamos para no caernos por un error operacional
// transitorio (un blip de red/BD no debe tumbar el bot). Errores realmente
// fatales igual se notarán en logs; el ciclo de vida del cliente lo cubren los
// handlers 'disconnected'/'auth_failure' en client.js.
process.on('unhandledRejection', (reason) => {
  console.error('[WhatsApp Worker] unhandledRejection (contenido, no se cae):', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[WhatsApp Worker] uncaughtException (contenido, no se cae):', err?.message || err);
});
