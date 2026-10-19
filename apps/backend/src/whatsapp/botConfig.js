'use strict';

// Config del bot editable desde el ADMIN (sin tocar Railway ni redeploy).
//
// Fuente de verdad: fila IntegrationConfig type='WHATSAPP_ASSISTANT' del tenant
// fijado en WHATSAPP_BOT_RESTAURANT_ID. El admin la escribe (PUT
// /admin/whatsapp-assistant); el bot la lee aquí en caliente (refresco cada 60s)
// y expone getters SÍNCRONOS para no meter awaits en el hot-path del handler.
//
// Compatibilidad hacia atrás (cero-regresión):
//  - Si NO hay fila en BD, se usan los env de siempre (WHATSAPP_BOT_*). El bot
//    sigue corriendo idéntico aunque nadie haya abierto la página del admin.
//  - Al primer arranque con env seteadas y sin fila, se AUTO-SIEMBRA la fila con
//    la config actual de env, para que la página del admin muestre de una vez la
//    config real que ya opera (y no arranque en blanco / la pise al guardar).
//  - Campo vacío en BD → cae al env (merge por-campo, no todo-o-nada).

const { prisma } = require('@mrtpvrest/database');
const botApi = require('./botApi');

const TYPE = 'WHATSAPP_ASSISTANT';
const REFRESH_MS = 15 * 1000;

function restaurantId() {
  return process.env.WHATSAPP_BOT_RESTAURANT_ID || null;
}

function isRailwayRuntime() {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_PROJECT_ID ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.WWEBJS_DATA_PATH === '/data/.wwebjs_auth'
  );
}

// Config tal como vive en los env (fallback y semilla inicial).
function fromEnv() {
  return {
    active: true,
    runMode: (process.env.WHATSAPP_BOT_RUN_MODE || 'cloud').trim().toLowerCase(),
    extraInstructions: (process.env.WHATSAPP_BOT_EXTRA_INSTRUCTIONS || '').trim(),
    ignoreNumbers: (process.env.WHATSAPP_BOT_IGNORE_NUMBERS || '')
      .split(',').map((s) => s.trim()).filter(Boolean),
    ignoreGroupName: (process.env.WHATSAPP_BOT_IGNORE_GROUP_NAME || '').trim(),
  };
}

// Snapshot vivo. Arranca con active=false hasta que init() lea la BD/API,
// evitando que el bot conteste mensajes durante el arranque o antes de saber
// si está pausado en el panel admin.
let snapshot = { ...fromEnv(), active: false };
let seeded = false;

function parseRow(row, envCfg) {
  let cfg = {};
  try { cfg = row?.config ? JSON.parse(row.config) : {}; } catch { cfg = {}; }
  const nums = Array.isArray(cfg.ignoreNumbers)
    ? cfg.ignoreNumbers.map((s) => String(s).trim()).filter(Boolean)
    : null;
  const instr = typeof cfg.extraInstructions === 'string' ? cfg.extraInstructions.trim() : '';
  const grp = typeof cfg.ignoreGroupName === 'string' ? cfg.ignoreGroupName.trim() : '';
  const mode = typeof cfg.runMode === 'string' && cfg.runMode.trim()
    ? cfg.runMode.trim().toLowerCase()
    : envCfg.runMode;
  const effectiveMode = mode || 'cloud';
  // Si runMode==='local' y estamos en la PC local (!isRailwayRuntime()), permitimos
  // activar el bot local con cfg.localEnabled=true manteniendo row.enabled=false en BD
  // para que cualquier instancia en Railway quede 100% silenciada al instante.
  const isActive = (effectiveMode === 'local' && !isRailwayRuntime() && cfg.localEnabled === true)
    ? true
    : (row?.enabled !== false);
  return {
    active: isActive,
    runMode: effectiveMode,
    extraInstructions: instr || envCfg.extraInstructions,
    ignoreNumbers: (nums && nums.length) ? nums : envCfg.ignoreNumbers,
    ignoreGroupName: grp || envCfg.ignoreGroupName,
  };
}

// Modo API-only: la config viene del backend (GET /api/bot/config), sin BD.
async function loadFromApi() {
  try {
    const c = await botApi.getConfig();
    snapshot = {
      active: c.active !== false,
      runMode: typeof c.runMode === 'string' && c.runMode.trim() ? c.runMode.trim().toLowerCase() : (process.env.WHATSAPP_BOT_RUN_MODE || 'cloud'),
      extraInstructions: typeof c.extraInstructions === 'string' ? c.extraInstructions.trim() : '',
      ignoreNumbers: Array.isArray(c.ignoreNumbers) ? c.ignoreNumbers.map((s) => String(s).trim()).filter(Boolean) : [],
      ignoreGroupName: typeof c.ignoreGroupName === 'string' ? c.ignoreGroupName.trim() : '',
    };
  } catch (e) {
    console.error('[botConfig] Error leyendo /api/bot/config:', e?.message || e);
    // Conserva el snapshot previo (o el de env del primer arranque).
  }
}

async function loadFromDb() {
  if (botApi.useApi()) return loadFromApi();
  const rid = restaurantId();
  if (!rid) return; // sin tenant fijado: solo env (dev)
  const envCfg = fromEnv();
  let row = null;
  try {
    row = await prisma.integrationConfig.findUnique({
      where: { restaurantId_type: { restaurantId: rid, type: TYPE } },
    });
  } catch (e) {
    console.error('[botConfig] Error leyendo IntegrationConfig:', e?.message || e);
    return; // conserva el snapshot previo (o env)
  }

  if (!row) {
    // Auto-sembrar UNA vez: persistir la config de env para que el admin la vea.
    if (!seeded) {
      seeded = true;
      try {
        await prisma.integrationConfig.create({
          data: {
            restaurantId: rid,
            type: TYPE,
            enabled: true,
            mode: 'production',
            config: JSON.stringify({
              extraInstructions: envCfg.extraInstructions,
              ignoreNumbers: envCfg.ignoreNumbers,
              ignoreGroupName: envCfg.ignoreGroupName,
            }),
            lastSync: new Date(),
          },
        });
        console.log('[botConfig] Fila WHATSAPP_ASSISTANT auto-sembrada desde env.');
      } catch (e) {
        // Carrera con el admin/otra instancia: no es fatal, seguimos con env.
        console.warn('[botConfig] No se pudo auto-sembrar (probable carrera):', e?.message || e);
      }
    }
    snapshot = { ...envCfg };
    return;
  }

  snapshot = parseRow(row, envCfg);
}

let initialized = false;
async function init() {
  await loadFromDb();
  if (!initialized) {
    initialized = true;
    setInterval(() => { loadFromDb().catch(() => {}); }, REFRESH_MS).unref?.();
  }
  console.log(`[botConfig] Config cargada (active=${snapshot.active}, runMode=${snapshot.runMode}, shouldRunHere=${shouldRunHere()}, instr=${snapshot.extraInstructions.length}c, ignore#=${snapshot.ignoreNumbers.length}, grupo="${snapshot.ignoreGroupName}").`);
}

function getRunMode() {
  return snapshot.runMode || 'cloud';
}

function shouldRunHere() {
  const mode = getRunMode();
  if (mode === 'local') {
    return !isRailwayRuntime();
  }
  return true;
}

// ── Getters síncronos (hot-path) ─────────────────────────────────────────────
function getActive() { return snapshot.active !== false && shouldRunHere(); }
function getExtraInstructions() { return snapshot.extraInstructions || ''; }
function getIgnoreNumbers() { return snapshot.ignoreNumbers || []; }
function getIgnoreNumbersCsv() { return (snapshot.ignoreNumbers || []).join(','); }
function getIgnoreGroupName() { return snapshot.ignoreGroupName || ''; }

module.exports = {
  init,
  getActive,
  getRunMode,
  shouldRunHere,
  isRailwayRuntime,
  getExtraInstructions,
  getIgnoreNumbers,
  getIgnoreNumbersCsv,
  getIgnoreGroupName,
};
