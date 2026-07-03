'use strict';

// Atribución del efectivo de las órdenes al corte (shiftOrdersWhere).
// BUG que blinda: el efectivo de una ENTREGA entra al cajón cuando el
// repartidor LIQUIDA (paidAt), a veces días después en otro turno, no cuando
// se creó la orden. Antes se atribuía por createdAt/shiftId, así que un delivery
// viejo cobrado hoy quedaba booked a un turno ya cerrado → SOBRANTE FANTASMA en
// el cierre de hoy. Ahora delivery se atribuye por paidAt; no-delivery conserva
// el criterio de siempre (paga al momento, createdAt ≈ cobro).

// El módulo de rutas corre requires con efectos de carga (DB, middleware); los
// neutralizamos para poder probar la función pura shiftOrdersWhere.
jest.mock('@mrtpvrest/database', () => ({ prisma: {} }));
jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (_req, _res, next) => next(),
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
}));
jest.mock('../src/lib/modules', () => ({
  requireModule: () => (_req, _res, next) => next(),
  MODULES: { MODULE_CASH_SHIFT: 'cash_shift' },
}));

const { shiftOrdersWhere } = require('../src/routes/shifts.routes');

const openedAt = new Date('2026-07-02T21:54:05.000Z');
const shiftOpen = { id: 'shiftHoy', locationId: 'loc1', openedAt, closedAt: null };

describe('shiftOrdersWhere — atribución de órdenes al corte', () => {
  test('delivery se atribuye por paidAt (no por createdAt ni shiftId)', () => {
    const deliveryBranch = shiftOrdersWhere(shiftOpen).OR.find((b) => b.orderType === 'DELIVERY');
    expect(deliveryBranch).toEqual({
      orderType: 'DELIVERY',
      paymentStatus: 'PAID',
      paidAt: { gte: openedAt },
    });
  });

  test('no-delivery conserva atribución por shiftId + fallback createdAt', () => {
    const nonDelivery = shiftOrdersWhere(shiftOpen).OR.filter(
      (b) => b.orderType && b.orderType.not === 'DELIVERY',
    );
    expect(nonDelivery).toEqual([
      { orderType: { not: 'DELIVERY' }, shiftId: 'shiftHoy' },
      { orderType: { not: 'DELIVERY' }, shiftId: null, createdAt: { gte: openedAt } },
    ]);
  });

  test('anti-regresión: ninguna rama por shiftId/createdAt puede capturar delivery', () => {
    for (const branch of shiftOrdersWhere(shiftOpen).OR) {
      if ('shiftId' in branch || 'createdAt' in branch) {
        expect(branch.orderType).toEqual({ not: 'DELIVERY' });
      }
    }
  });

  test('turno cerrado acota el cobro de delivery a su ventana [openedAt, closedAt]', () => {
    const closedAt = new Date('2026-07-03T06:12:34.000Z');
    const deliveryBranch = shiftOrdersWhere({ ...shiftOpen, closedAt }).OR.find(
      (b) => b.orderType === 'DELIVERY',
    );
    expect(deliveryBranch.paidAt).toEqual({ gte: openedAt, lte: closedAt });
  });

  test('turno abierto NO acota el cobro por arriba (hasta el momento del cierre)', () => {
    const deliveryBranch = shiftOrdersWhere(shiftOpen).OR.find((b) => b.orderType === 'DELIVERY');
    expect(deliveryBranch.paidAt.lte).toBeUndefined();
  });

  test('filtro base intacto: sucursal, DELIVERED y fuentes de venta', () => {
    const where = shiftOrdersWhere(shiftOpen);
    expect(where.locationId).toBe('loc1');
    expect(where.status).toBe('DELIVERED');
    expect(where.source).toEqual({ in: ['TPV', 'WAITER', 'ONLINE', 'WHATSAPP', 'KIOSK'] });
  });
});
