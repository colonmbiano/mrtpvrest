/**
 * permissions.js — Mapa canónico de permisos RBAC (Fase 10 · "RBAC real").
 *
 * Único punto de verdad para traducir entre:
 *   - Las columnas booleanas del modelo Employee (`canX`), y
 *   - Los strings de permiso que consume el TPV (Permission union en authStore).
 *
 * Reglas de diseño:
 *   - El descuento se unifica: `canApplyDiscounts` (Fase 10) absorbe al legacy
 *     `canDiscount`. Cualquiera de los dos concede `apply_discount`.
 *   - Las columnas legacy que NO mapean a una operación (canModifyTickets,
 *     canDeleteTickets, canConfigSystem, canTakeDelivery, canTakeTakeout,
 *     canManageShifts) quedan deprecadas: se conservan en DB pero ya no se
 *     traducen a permisos ni se evalúan en el enforcement.
 */

// Flag canónico (columna Employee) → string de permiso del TPV.
const FLAG_TO_PERM = {
  canCharge:         'open_cash_drawer',
  canApplyDiscounts: 'apply_discount',
  canCancelItems:    'cancel_items',
  canReopenTables:   'reopen_table',
  canManageUsers:    'manage_users',
  canViewExpectedCash: 'view_expected_cash',
  canManageDriverCash: 'manage_driver_cash',
};

// Inverso: string de permiso → flag canónico.
const PERM_TO_FLAG = Object.fromEntries(
  Object.entries(FLAG_TO_PERM).map(([flag, perm]) => [perm, flag])
);

// Columnas (incluyendo legacy) que deben cargarse para evaluar permisos.
// `canDiscount` se incluye solo para el alias legacy de descuento.
const PERMISSION_FLAG_SELECT = {
  canCharge:         true,
  canApplyDiscounts: true,
  canDiscount:       true, // legacy → alias de apply_discount
  canCancelItems:    true,
  canReopenTables:   true,
  canManageUsers:    true,
  canViewExpectedCash: true,
  canManageDriverCash: true,
};

/**
 * Traduce los flags de un Employee a la lista canónica de strings de permiso.
 * Tolera tanto el flag Fase 10 como el legacy para descuentos.
 */
function mapPermissions(emp) {
  if (!emp) return [];
  const perms = [];
  if (emp.canCharge) perms.push('open_cash_drawer');
  if (emp.canApplyDiscounts || emp.canDiscount) perms.push('apply_discount');
  if (emp.canCancelItems) perms.push('cancel_items');
  if (emp.canReopenTables) perms.push('reopen_table');
  if (emp.canManageUsers) perms.push('manage_users');
  if (emp.canViewExpectedCash) perms.push('view_expected_cash');
  if (emp.canManageDriverCash) perms.push('manage_driver_cash');
  return perms;
}

module.exports = {
  FLAG_TO_PERM,
  PERM_TO_FLAG,
  PERMISSION_FLAG_SELECT,
  mapPermissions,
};
