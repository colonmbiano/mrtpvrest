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

// Catálogo canónico — ÚNICA fuente de verdad de los módulos en el backend.
// De aquí se derivan VALID_MODULE_KEYS (saas.routes) y MODULE_DEFINITIONS
// (modules.routes); no redefinir esas listas en otro lado.
// Espejo en el frontend: apps/saas/lib/modules.ts (mantener en sync).
//
//   kind 'flag' → solo existe como booleano del Tenant (no vive en
//                 enabledModules[] ni se gestiona por plan; p.ej. inventory).
//   kind 'key'  → módulo opcional que vive en enabledModules[] y puede estar
//                 gated por plan.
//   legacyFlag  → booleano del Tenant espejo (si existe).
//   aliases     → claves históricas equivalentes (la primera es la canónica que
//                 se persiste al activar: webstore→client_menu, loyalty→loyalty_advanced).
//   planFlag    → booleano del Plan que también habilita el módulo.
//   requiresPlan→ marca módulos premium vs flags libres (se guarda en TenantModule).
const MODULE_CATALOG = [
  { key: 'inventory', kind: 'flag', requiresPlan: false, legacyFlag: 'hasInventory', aliases: [],                  planFlag: null },
  { key: 'delivery',  kind: 'key',  requiresPlan: true,  legacyFlag: 'hasDelivery',  aliases: [],                  planFlag: null },
  { key: 'webstore',  kind: 'key',  requiresPlan: true,  legacyFlag: 'hasWebStore',  aliases: ['client_menu'],     planFlag: null },
  { key: 'kiosk',     kind: 'key',  requiresPlan: true,  legacyFlag: null,           aliases: [],                  planFlag: null },
  { key: 'loyalty',   kind: 'key',  requiresPlan: true,  legacyFlag: null,           aliases: ['loyalty_advanced'], planFlag: 'hasLoyalty' },
  { key: 'kds',       kind: 'key',  requiresPlan: true,  legacyFlag: null,           aliases: [],                  planFlag: 'hasKDS' },
  { key: 'reports',   kind: 'key',  requiresPlan: true,  legacyFlag: null,           aliases: [],                  planFlag: 'hasReports' },
  { key: 'finance',   kind: 'key',  requiresPlan: true,  legacyFlag: null,           aliases: [],                  planFlag: null },
  { key: 'waiters',             kind: 'key', requiresPlan: true, legacyFlag: null, aliases: [], planFlag: null },
  { key: 'cash_shift',          kind: 'key', requiresPlan: true, legacyFlag: null, aliases: [], planFlag: null },
  { key: 'employee_management', kind: 'key', requiresPlan: true, legacyFlag: null, aliases: [], planFlag: null },
  { key: 'payroll',             kind: 'key', requiresPlan: true, legacyFlag: null, aliases: [], planFlag: null },
  { key: 'whatsapp_bot',        kind: 'key', requiresPlan: true, legacyFlag: null, aliases: ['chatbot'], planFlag: null },
]

const CANONICAL_KEYS = MODULE_CATALOG.map((m) => m.key)

// Módulos opcionales (kind 'key'): los que viven en enabledModules[] y pueden
// gestionarse por plan. Excluye los flag-only como inventory.
const OPTIONAL_MODULES = MODULE_CATALOG.filter((m) => m.kind === 'key')

// Set de claves válidas aceptadas en enabledModules[] (clave canónica + alias).
// Lo consume saas.routes para sanear el payload de PATCH /tenants/:id/modules.
const VALID_MODULE_KEYS = new Set(
  OPTIONAL_MODULES.flatMap((m) => [m.key, ...m.aliases]),
)

// Definiciones para el gating por plan (modules.routes PATCH /:key), keyed por
// la clave en MAYÚSCULAS. `planKeys[0]` es la clave canónica que se persiste al
// activar (alias primero por compatibilidad: WEBSTORE→client_menu, LOYALTY→loyalty_advanced).
const MODULE_DEFINITIONS = Object.fromEntries(
  OPTIONAL_MODULES.map((m) => [
    m.key.toUpperCase(),
    { planKeys: [...m.aliases, m.key], ...(m.planFlag ? { planFlag: m.planFlag } : {}) },
  ]),
)

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
  OPTIONAL_MODULES,
  VALID_MODULE_KEYS,
  MODULE_DEFINITIONS,
  toCanonicalKey,
  deriveActiveKeys,
  legacyFieldsFromKeys,
  syncTenantModuleRows,
}
