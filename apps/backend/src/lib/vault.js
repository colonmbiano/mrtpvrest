'use strict';

// ───────────────────────────────────────────────────────────────────────────
// vault.js — Bóveda del negocio (model Vault).
//
// El tercer bolsillo, junto a la gaveta del turno (CashShift) y la caja del
// repartidor (DriverCash). Guarda el dinero que ya salió de la caja, en dos
// bolsas que nunca se mezclan:
//
//   CASH    → billetes. Entra lo contado al cerrar caja, sale el fondo al abrir.
//   DIGITAL → banco. Entra lo cobrado con tarjeta/transferencia, sale lo que se
//             paga con tarjeta corporativa o transferencia.
//
// No puedes comprar con billetes que están en el banco: por eso cada
// movimiento vive en su canal y `balanceAfter` congela el saldo de ESE canal.
//
// REGLA DE ORO: un movimiento de bóveda NUNCA crea un ShiftExpense ni toca
// CashShift.totalExpenses. El corte del cajero no debe moverse porque el
// dueño compró carne el martes con dinero del viernes pasado.
//
// Todas las funciones reciben el `tx` de una $transaction: el saldo cache
// (Vault.balanceCash / balanceDigital) y el movimiento se escriben juntos o
// no se escriben. El saldo se lee DENTRO de la transacción con un UPDATE
// atómico (increment/decrement), así dos capturas simultáneas no lo pisan.
// ───────────────────────────────────────────────────────────────────────────

// Método de pago → canal de la bóveda. CASH_DRAWER no aparece: ese sale de la
// gaveta del turno y crea un ShiftExpense, no toca la bóveda.
const METHOD_CHANNEL = {
  CASH_VAULT: 'CASH',
  CORPORATE_CARD: 'DIGITAL',
  TRANSFER: 'DIGITAL',
};

/** Canal de la bóveda que corresponde al método de pago, o null si no la toca. */
function channelForMethod(paymentMethod) {
  return METHOD_CHANNEL[paymentMethod] || null;
}

// La bolsa de efectivo es dinero contante del dueño: un cajero no la toca sin
// autorización (o rol de mando, o PIN admin → header x-admin-authorized, que
// el TPV ya sabe resolver cuando recibe el code ADMIN_AUTH_REQUIRED).
//
// La bolsa digital NO lleva este candado: pagar con tarjeta corporativa o
// transferencia siempre estuvo permitido a cualquier rol que registre gastos,
// y esos movimientos ya dejaban rastro contable. Meterle el candado ahora
// rompería un flujo que hoy funciona, sin proteger nada nuevo.
const VAULT_ROLES = ['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'];

/**
 * ¿Este actor NO puede sacar EFECTIVO de la bóveda? Devuelve un cuerpo de
 * error listo para responder con 402, o null si tiene permiso.
 */
function vaultDenied(req, userRole) {
  if (VAULT_ROLES.includes(userRole)) return null;
  if (req.headers['x-admin-authorized'] === 'true') return null;
  return {
    error: 'Pagar con efectivo acumulado requiere autorización de admin.',
    code: 'ADMIN_AUTH_REQUIRED',
  };
}

// Columna del saldo cache que corresponde a cada canal.
const BALANCE_FIELD = { CASH: 'balanceCash', DIGITAL: 'balanceDigital' };

/**
 * Devuelve la bóveda de la sucursal, creándola vacía la primera vez.
 * Idempotente: dos requests concurrentes sobre una sucursal sin bóveda no
 * crean dos filas (`locationId` es UNIQUE; el upsert resuelve la carrera).
 */
async function getOrCreateVault(tx, restaurantId, locationId) {
  return tx.vault.upsert({
    where: { locationId },
    create: { restaurantId, locationId },
    update: {},
  });
}

/**
 * Aplica un movimiento y devuelve el movimiento creado (con balanceAfter).
 *
 * El saldo puede quedar NEGATIVO a propósito: significa que se pagó con
 * dinero que el sistema no sabía que existía (el dueño metió dinero de su
 * bolsa, o faltó registrar un depósito). Bloquear la captura obligaría a
 * mentir sobre la realidad; en vez de eso el saldo negativo queda visible en
 * la pantalla de bóveda como señal de que falta capturar un depósito.
 *
 * @param {object} tx  Cliente de Prisma dentro de $transaction.
 * @param {object} params
 * @param {string} params.restaurantId
 * @param {string} params.locationId
 * @param {'DEPOSIT'|'WITHDRAWAL'} params.type
 * @param {'CASH'|'DIGITAL'} params.channel
 * @param {'SHIFT_CLOSE'|'SHIFT_OPEN'|'MANUAL'|'EXPENSE'|'PURCHASE'|'SETTLEMENT'} params.source
 * @param {number} params.amount        Siempre positivo; el signo lo da `type`.
 * @param {string} params.description
 * @param {string} [params.notes]
 * @param {string} [params.shiftId]
 * @param {string} [params.operatingExpenseId]
 * @param {string} [params.purchaseOrderId]
 * @param {string} [params.createdById]    Employee o User — sin FK a propósito.
 * @param {string} [params.createdByName]
 * @param {Date}   [params.occurredAt]
 */
async function applyVaultMovement(tx, params) {
  const {
    restaurantId,
    locationId,
    type,
    channel,
    source,
    amount,
    description,
    notes = null,
    shiftId = null,
    operatingExpenseId = null,
    purchaseOrderId = null,
    createdById = null,
    createdByName = null,
    occurredAt,
  } = params;

  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error('vault: amount debe ser > 0');
  }
  const field = BALANCE_FIELD[channel];
  if (!field) throw new Error(`vault: channel inválido (${channel})`);

  const vault = await getOrCreateVault(tx, restaurantId, locationId);

  // UPDATE atómico: Postgres resuelve el increment sobre el valor real de la
  // fila, no sobre el que leímos arriba. El saldo devuelto es el cierto
  // después de este movimiento, incluso con capturas concurrentes.
  const updated = await tx.vault.update({
    where: { id: vault.id },
    data: { [field]: type === 'DEPOSIT' ? { increment: amt } : { decrement: amt } },
  });

  return tx.vaultMovement.create({
    data: {
      vaultId: vault.id,
      restaurantId,
      locationId,
      type,
      channel,
      source,
      amount: amt,
      balanceAfter: updated[field],
      description,
      notes,
      shiftId,
      operatingExpenseId,
      purchaseOrderId,
      createdById,
      createdByName,
      ...(occurredAt ? { occurredAt } : {}),
    },
  });
}

/**
 * Igual que applyVaultMovement pero tolera el choque del UNIQUE
 * (shiftId, source, channel): si el movimiento del ciclo de turno ya existe,
 * no hace nada y devuelve null. Sirve para que un replay del outbox offline
 * del TPV (cerrar turno dos veces) no duplique el saldo.
 *
 * OJO: el catch NO puede ir dentro de la $transaction del cierre — en
 * Postgres cualquier error aborta la transacción entera. Por eso el chequeo
 * es previo (SELECT) y el UNIQUE queda como última línea de defensa: si dos
 * cierres corren en paralelo, el segundo revienta la transacción y el TPV
 * recibe el 409 de doble cierre que ya existía.
 */
async function applyShiftVaultMovement(tx, params) {
  const { shiftId, source, channel } = params;
  const existing = await tx.vaultMovement.findUnique({
    where: { shiftId_source_channel: { shiftId, source, channel } },
    select: { id: true },
  });
  if (existing) return null;
  return applyVaultMovement(tx, params);
}

/** Saldos actuales de la bóveda de una sucursal (ceros si aún no existe). */
async function getVaultBalances(prisma, locationId) {
  const vault = await prisma.vault.findUnique({
    where: { locationId },
    select: { balanceCash: true, balanceDigital: true },
  });
  return {
    balanceCash: Number(vault?.balanceCash || 0),
    balanceDigital: Number(vault?.balanceDigital || 0),
  };
}

module.exports = {
  VAULT_ROLES,
  METHOD_CHANNEL,
  channelForMethod,
  vaultDenied,
  getOrCreateVault,
  applyVaultMovement,
  applyShiftVaultMovement,
  getVaultBalances,
};
