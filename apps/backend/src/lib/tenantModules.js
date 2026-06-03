// lib/tenantModules.js — Fuente de verdad canónica de los módulos por tenant.
//
// Centraliza el catálogo de módulos, la normalización de claves (alias) y la
// sincronización con la tabla TenantModule. Antes la representación vivía
// dispersa en tres lugares (Tenant.enabledModules String[], los flags booleanos
// hasInventory/hasDelivery/hasWebStore y Tenant.activeModules Json) leídos por
// distintas vistas del panel SaaS, lo que producía desync.
//
// Estrategia de migración (aditiva, sin drop de columnas):
//   - TenantModule es la fuente canónica nueva.
//   - Los campos legacy del Tenant se mantienen sincronizados (dual-write) para
//     no romper el gating en runtime (lib/modules.js sigue leyendo enabledModules
//     y los flags). Una vez verificado en prod, una PR posterior podrá migrar el
//     gating a TenantModule y dropear los campos legacy.

// Catálogo canónico. `legacyFlag` mapea al booleano del Tenant (si existe);
// `requiresPlan` marca módulos premium (gated por plan) vs flags libres.
const MODULE_CATALOG = [
  { key: 'inventory', requiresPlan: false, legacyFlag: 'hasInventory', aliases: [] },
  { key: 'delivery',  requiresPlan: true,  legacyFlag: 'hasDelivery',  aliases: [] },
  { key: 'webstore',  requiresPlan: true,  legacyFlag: 'hasWebStore',  aliases: ['client_menu'] },
  { key: 'kiosk',     requiresPlan: true,  legacyFlag: null,           aliases: [] },
  { key: 'loyalty',   requiresPlan: true,  legacyFlag: null,           aliases: ['loyalty_advanced'] },
  { key: 'kds',       requiresPlan: true,  legacyFlag: null,           aliases: [] },
  { key: 'reports',   requiresPlan: true,  legacyFlag: null,           aliases: [] },
  { key: 'finance',   requiresPlan: true,  legacyFlag: null,           aliases: [] },
]

const CANONICAL_KEYS = MODULE_CATALOG.map((m) => m.key)

// alias (y la propia clave) → clave canónica
const ALIAS_TO_CANONICAL = {}
for (const def of MODULE_CATALOG) {
  ALIAS_TO_CANONICAL[def.key] = def.key
  for (const alias of def.aliases) ALIAS_TO_CANONICAL[alias.toLowerCase()] = def.key
}

/** Normaliza una clave/alias arbitraria a su clave canónica, o null si no existe. */
function toCanonicalKey(raw) {
  return ALIAS_TO_CANONICAL[String(raw || '').toLowerCase().trim()] || null
}

/**
 * Deriva el set de claves canónicas activas desde el estado legacy de un tenant
 * ({ enabledModules, hasInventory, hasDelivery, hasWebStore }). Usado para el
 * backfill y para recomputar tras un update parcial.
 */
function deriveActiveKeys(tenant) {
  const active = new Set()
  for (const v of tenant?.enabledModules ?? []) {
    const k = toCanonicalKey(v)
    if (k) active.add(k)
  }
  if (tenant?.hasInventory) active.add('inventory')
  if (tenant?.hasDelivery) active.add('delivery')
  if (tenant?.hasWebStore) active.add('webstore')
  return active
}

/**
 * Reconstruye los campos legacy del Tenant a partir de un set de claves activas.
 * `enabledModules` excluye 'inventory' (que históricamente vive solo como flag y
 * no en el array que el TPV lee al boot).
 */
function legacyFieldsFromKeys(activeKeys) {
  const set = new Set([...activeKeys].map(toCanonicalKey).filter(Boolean))
  return {
    enabledModules: CANONICAL_KEYS.filter((k) => k !== 'inventory' && set.has(k)),
    hasInventory: set.has('inventory'),
    hasDelivery: set.has('delivery'),
    hasWebStore: set.has('webstore'),
  }
}

/**
 * Sincroniza (upsert idempotente) las filas TenantModule de un tenant con el set
 * de claves activas. Garantiza una fila por cada módulo del catálogo.
 * @param {import('@prisma/client').PrismaClient} client prisma o un tx.
 */
async function syncTenantModuleRows(client, tenantId, activeKeys) {
  const set = new Set([...activeKeys].map(toCanonicalKey).filter(Boolean))
  for (const def of MODULE_CATALOG) {
    await client.tenantModule.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey: def.key } },
      update: { enabled: set.has(def.key), requiresPlan: def.requiresPlan },
      create: { tenantId, moduleKey: def.key, enabled: set.has(def.key), requiresPlan: def.requiresPlan },
    })
  }
}

module.exports = {
  MODULE_CATALOG,
  CANONICAL_KEYS,
  toCanonicalKey,
  deriveActiveKeys,
  legacyFieldsFromKeys,
  syncTenantModuleRows,
}
