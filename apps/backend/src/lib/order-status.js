// Máquina de estados de la orden. Gobierna SOLO el endpoint PUT /orders/:id/status
// (cambios manuales del operador). Las transiciones "de sistema" escriben el
// status directo y están EXENTAS a propósito: asignación de repartidor
// (delivery.routes), confirm-payment, confirm-cash y merge de cuentas.

const ORDER_STATUSES = [
  'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PACKING',
  'ON_THE_WAY', 'DELIVERED', 'CANCELLED', 'OPEN',
  // Marketplace: PENDING_PAYMENT espera el pago en línea; PENDING_MERCHANT espera
  // que el comercio acepte (ya pagado o contra entrega).
  'PENDING_PAYMENT', 'PENDING_MERCHANT',
];

// Estados "activos": la orden sigue viva (cuenta para tableros y colas).
// PENDING_PAYMENT no: el comercio no debe ver ni preparar un pedido sin pagar.
const ACTIVE_ORDER_STATUSES = [
  'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PACKING', 'ON_THE_WAY', 'OPEN',
  'PENDING_MERCHANT',
];

// Transiciones permitidas desde el endpoint de orders. DELIVERY NO aparece: el
// repartidor mueve el estado por delivery.routes (con ownership-check), no aquí.
// READY → PACKING es opcional (solo si el tenant usa empaque); PACKING → READY
// permite "regresar" si empaque rebota algo.
const ALLOWED_TRANSITIONS = {
  PENDING:    ['CONFIRMED', 'PREPARING', 'CANCELLED'],
  CONFIRMED:  ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING:  ['READY', 'CANCELLED'],
  READY:      ['PACKING', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED'],
  PACKING:    ['READY', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED'],
  ON_THE_WAY: ['DELIVERED', 'CANCELLED'],
  OPEN:       ['CANCELLED'],
  DELIVERED:  [],
  CANCELLED:  [],
  // El comercio acepta (→ CONFIRMED, entra a cocina) o rechaza un pedido del
  // marketplace. Solo el webhook de pago saca a una orden de PENDING_PAYMENT.
  PENDING_MERCHANT: ['CONFIRMED', 'CANCELLED'],
  PENDING_PAYMENT:  [],
};

// Roles con acceso total a la máquina (incluye SUPER_ADMIN para el operador del
// SaaS, evitando 403). Opera sobre el string CRUDO de req.user.role (Employee.role
// libre + tokens de dispositivo KDS→KITCHEN / POS→CASHIER), NO sobre el enum Role.
const FULL_ACCESS_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER']);

/**
 * ¿Se permite mover una orden de `from` a `to` por el rol dado?
 * - from === to → true (no-op idempotente; el caller decide si re-emite).
 * - Roles full-access: cualquier transición válida por estado.
 * - CASHIER/KITCHEN: avanzan la cola y cancelan.
 * - Otros (ej. WAITER): solo cancelar.
 */
function canTransition(from, to, role) {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) return false;
  if (FULL_ACCESS_ROLES.has(role)) return true;
  if (role === 'CASHIER' || role === 'KITCHEN') return true;
  return to === 'CANCELLED';
}

module.exports = { ORDER_STATUSES, ACTIVE_ORDER_STATUSES, ALLOWED_TRANSITIONS, canTransition };
