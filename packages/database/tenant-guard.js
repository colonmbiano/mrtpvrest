'use strict';

// ───────────────────────────────────────────────────────────────────────────
// Tenant Guard — aislamiento multi-tenant automático a nivel de Prisma.
//
// Problema que resuelve: hasta ahora el aislamiento entre restaurantes dependía
// de que CADA query escribiera a mano `where: { restaurantId }`. Un solo olvido
// = fuga de datos entre tenants (IDOR). Este guard intercepta TODAS las queries
// de Prisma sobre modelos con columna `restaurantId` y, según el modo, fuerza el
// filtro automáticamente — exactamente la "Prisma Client Extension global" que
// describe el ARD §7 (Blindaje Multi-tenant).
//
// El contexto del request (qué restaurante está operando) viaja por
// AsyncLocalStorage, que el middleware del backend rellena por petición.
//
// Modos (env TENANT_GUARD_MODE):
//   - 'off'     → no hace nada (passthrough total).
//   - 'warn'    → NO altera queries; solo registra cuando una query sobre un
//                 modelo scopeado corre SIN filtro de restaurantId habiendo
//                 contexto de tenant. Cero cambios de comportamiento → seguro
//                 para producción. Sirve para observar antes de activar enforce.
//   - 'enforce' → inyecta `restaurantId` en where/data automáticamente.
//
// Default: 'warn' (rollout seguro). Ver TENANCY.md.
// ───────────────────────────────────────────────────────────────────────────

const { AsyncLocalStorage } = require('node:async_hooks');

// Store por-request. Forma del contexto:
//   { restaurantId?: string|null, role?: string, userId?: string, bypass?: boolean }
const tenantStore = new AsyncLocalStorage();

// Modelos que tienen columna `restaurantId` en schema.prisma. Lista autoritativa
// derivada del schema (2026-06). Si agregas un modelo con restaurantId, añádelo
// aquí — el test `tenant-guard.test.js` valida que la lista siga en sync.
const SCOPED_MODELS = new Set([
  'AccessLog',
  'BulkPromo',
  'Category',
  'Counter',
  'Coupon',
  'Customer',
  'DriverNotice',
  'DriverShiftRequest',
  'EmployeeCharge',
  'EmployeePayProfile',
  'Ingredient',
  'IngredientCategory',
  'IngredientType',
  'IntegrationConfig',
  'Location',
  'LoyaltyAccount',
  'LoyaltyReward',
  'MenuItem',
  'ModifierIngredient',
  'OperatingExpense',
  'OperatingExpenseCategory',
  'Order',
  'PayrollConfig',
  'PayrollItem',
  'PayrollPeriod',
  'PricingPolicy',
  'Recipe',
  'RecurringExpense',
  'RestaurantConfig',
  'StockTransfer',
  'SubRecipe',
  'Supplier',
  'User',
  'VariantTemplate',
  'Vault',
  'VaultMovement',
  'WhatsappSession',
  'WhatsappContact',
  'WhatsappConversation',
  'WhatsappMessage',
  'UpsellRule',
  'DeliveryZone',
  'DishReaction',
  'PromoGame',
  'PromoGamePlay',
  // Módulo retail (SKU-based). Todo modelo con columna restaurantId debe estar
  // aquí o el test tenant-guard.test.js falla. Las tablas hijas sin restaurantId
  // (RetailSaleLine, RetailPayment, RetailTransferItem) se acceden vía su padre.
  'RetailProduct',
  'RetailSku',
  'RetailStockByLocation',
  'RetailStockMovement',
  'RetailSale',
  'RetailTransfer',
  'RetailDevice',
  'RetailSyncOutbox',
  'RetailCashShift',
  // Multigiro (ferretería / refaccionaria). Ver docs/plan-retail-multigiro.md.
  'RetailPriceTier',
  'RetailPriceList',
  'RetailPriceListItem',
  'RetailFitment',
  'RetailCrossRef',
]);

const SCOPE_FIELD = 'restaurantId';

// Operaciones que aceptan `where`. `findUnique`/`update`/`delete` aceptan campos
// no-únicos en el where gracias a `extendedWhereUnique` (GA desde Prisma 5),
// siempre que exista un campo único — que aquí siempre lo hay (el id de la op).
const WHERE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);

// ── Helpers de contexto ─────────────────────────────────────────────────────
function getTenantContext() {
  return tenantStore.getStore() || null;
}

/** Corre `fn` con el contexto de tenant dado (lo propaga a todo el árbol async). */
function runWithTenant(ctx, fn) {
  return tenantStore.run(ctx || {}, fn);
}

/**
 * Corre `fn` saltándose el guard (operaciones legítimamente cross-tenant:
 * resolución de identidad en login, jobs de plataforma, panel SUPER_ADMIN).
 */
function runWithBypass(fn) {
  return tenantStore.run({ ...(getTenantContext() || {}), bypass: true }, fn);
}

// ── Detección (modo warn): ¿la query ya constriñe restaurantId? ─────────────
function whereHasScope(where) {
  if (!where || typeof where !== 'object') return false;
  if (where[SCOPE_FIELD] !== undefined) return true;
  // Cubrir el caso común `where: { AND: [ ..., { restaurantId } ] }`.
  if (Array.isArray(where.AND)) return where.AND.some(whereHasScope);
  return false;
}

function dataHasScope(data) {
  if (!data) return false;
  const rows = Array.isArray(data) ? data : [data];
  return rows.every(
    (row) =>
      row && (row[SCOPE_FIELD] !== undefined || row.restaurant !== undefined)
  );
}

function opIsScoped(operation, args) {
  if (CREATE_OPS.has(operation)) return dataHasScope(args && args.data);
  if (operation === 'upsert') {
    return whereHasScope(args && args.where) && dataHasScope(args && args.create);
  }
  if (WHERE_OPS.has(operation)) return whereHasScope(args && args.where);
  return true; // operaciones sin where/data (no aplican): tratar como ok.
}

// ── Inyección (modo enforce) ────────────────────────────────────────────────
function injectWhere(where, rid) {
  if (whereHasScope(where)) return where; // respetar scope explícito del caller.
  return { ...(where || {}), [SCOPE_FIELD]: rid };
}

function injectData(data, rid) {
  if (Array.isArray(data)) return data.map((row) => injectData(row, rid));
  if (!data || typeof data !== 'object') return data;
  if (data[SCOPE_FIELD] !== undefined || data.restaurant !== undefined) return data;
  return { ...data, [SCOPE_FIELD]: rid };
}

function applyScope(operation, args, rid) {
  const next = { ...(args || {}) };
  if (CREATE_OPS.has(operation)) {
    next.data = injectData(next.data, rid);
    return next;
  }
  if (operation === 'upsert') {
    next.where = injectWhere(next.where, rid);
    next.create = injectData(next.create, rid);
    return next;
  }
  if (WHERE_OPS.has(operation)) {
    next.where = injectWhere(next.where, rid);
    return next;
  }
  return next;
}

// ── Factory de la extensión ─────────────────────────────────────────────────
/**
 * Devuelve el objeto de extensión para `prisma.$extends(...)`.
 * @param {object} opts
 * @param {'off'|'warn'|'enforce'} [opts.mode]
 * @param {{ warn: Function }} [opts.logger]
 */
function tenantGuard(opts = {}) {
  const mode = opts.mode || 'warn';
  const logger = opts.logger || console;

  return {
    name: 'tenantGuard',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (mode === 'off' || !SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const ctx = getTenantContext();
          const rid = ctx && ctx.restaurantId;

          // Passthrough legítimo: sin contexto (jobs/seeds), bypass explícito,
          // SUPER_ADMIN, o contexto sin restaurantId resuelto.
          if (!ctx || ctx.bypass || ctx.role === 'SUPER_ADMIN' || !rid) {
            return query(args);
          }

          if (mode === 'enforce') {
            return query(applyScope(operation, args, rid));
          }

          // mode === 'warn': observar, no modificar.
          if (!opIsScoped(operation, args)) {
            logger.warn(
              `[tenant-guard] ${model}.${operation} sin filtro ${SCOPE_FIELD} ` +
                `(ctx restaurantId=${rid}). En modo 'enforce' se inyectaría automáticamente.`
            );
          }
          return query(args);
        },
      },
    },
  };
}

module.exports = {
  tenantGuard,
  tenantStore,
  getTenantContext,
  runWithTenant,
  runWithBypass,
  SCOPED_MODELS,
  SCOPE_FIELD,
  // exportados para tests unitarios:
  _internals: { applyScope, injectWhere, injectData, opIsScoped, whereHasScope },
};
