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

const TYPE = 'WHATSAPP_ASSISTANT';
const REFRESH_MS = 60 * 1000;

function restaurantId() {
  return process.env.WHATSAPP_BOT_RESTAURANT_ID || null;
}

// Config tal como vive en los env (fallback y semilla inicial).
function fromEnv() {
  return {
    active: true,
    extraInstructions: (process.env.WHATSAPP_BOT_EXTRA_INSTRUCTIONS || '').trim(),
    ignoreNumbers: (process.env.WHATSAPP_BOT_IGNORE_NUMBERS || '')
      .split(',').map((s) => s.trim()).filter(Boolean),
    ignoreGroupName: (process.env.WHATSAPP_BOT_IGNORE_GROUP_NAME || '').trim(),
  };
}

// Snapshot vivo. Arranca desde env; init()/refresh lo sobreescriben con BD.
let snapshot = fromEnv();
let seeded = false;

function parseRow(row, envCfg) {
  let cfg = {};
  try { cfg = row?.config ? JSON.parse(row.config) : {}; } catch { cfg = {}; }
  const nums = Array.isArray(cfg.ignoreNumbers)
    ? cfg.ignoreNumbers.map((s) => String(s).trim()).filter(Boolean)
    : null;
  const instr = typeof cfg.extraInstructions === 'string' ? cfg.extraInstructions.trim() : '';
  const grp = typeof cfg.ignoreGroupName === 'string' ? cfg.ignoreGroupName.trim() : '';
  // Merge por-campo: BD gana cuando tiene valor; si no, cae al env.
  return {
    active: row?.enabled !== false,
    extraInstructions: instr || envCfg.extraInstructions,
    ignoreNumbers: (nums && nums.length) ? nums : envCfg.ignoreNumbers,
    ignoreGroupName: grp || envCfg.ignoreGroupName,
  };
}

async function loadFromDb() {
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

async function init() {
  await loadFromDb();
  setInterval(() => { loadFromDb().catch(() => {}); }, REFRESH_MS).unref?.();
  console.log(`[botConfig] Config cargada (active=${snapshot.active}, instr=${snapshot.extraInstructions.length}c, ignore#=${snapshot.ignoreNumbers.length}, grupo="${snapshot.ignoreGroupName}").`);
}

// ── Getters síncronos (hot-path) ─────────────────────────────────────────────
function getActive() { return snapshot.active !== false; }
function getExtraInstructions() { return snapshot.extraInstructions || ''; }
function getIgnoreNumbers() { return snapshot.ignoreNumbers || []; }
function getIgnoreNumbersCsv() { return (snapshot.ignoreNumbers || []).join(','); }
function getIgnoreGroupName() { return snapshot.ignoreGroupName || ''; }

module.exports = {
  init,
  getActive,
  getExtraInstructions,
  getIgnoreNumbers,
  getIgnoreNumbersCsv,
  getIgnoreGroupName,
};
