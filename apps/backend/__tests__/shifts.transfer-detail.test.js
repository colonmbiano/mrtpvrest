'use strict';

// Detalle de transferencias del corte (transferOrdersDetail): la lista que el
// TPV imprime al final del ticket de cierre para cotejar cada transferencia
// contra la app del banco. Debe seguir la MISMA regla de tenders que
// summarizePayments — si divergen, el detalle no suma lo mismo que
// totalTransfer y el cotejo pierde sentido.

// El módulo de rutas corre requires con efectos de carga (DB, middleware); los
// neutralizamos para poder probar la función pura transferOrdersDetail.
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

const { transferOrdersDetail } = require('../src/routes/shifts.routes');
const { summarizePayments } = require('../src/lib/money');

describe('transferOrdersDetail — detalle de transferencias del corte', () => {
  test('método único: entra TRANSFER/SPEI con el total; CASH/CARD no', () => {
    const orders = [
      { orderNumber: '101', paymentMethod: 'TRANSFER', total: 250, paidAt: '2026-07-06T01:00:00.000Z' },
      { orderNumber: '102', paymentMethod: 'SPEI', total: 180.5, customerName: 'Ana' },
      { orderNumber: '103', paymentMethod: 'CASH', total: 300 },
      { orderNumber: '104', paymentMethod: 'CARD', total: 120 },
    ];
    const detail = transferOrdersDetail(orders);
    expect(detail.map((d) => d.orderNumber)).toEqual(['102', '101']); // sin paidAt ordena primero (0)
    expect(detail.find((d) => d.orderNumber === '102')).toMatchObject({ amount: 180.5, customerName: 'Ana' });
  });

  test('cobro MIXTO: solo cuenta el renglón por transferencia, no el total', () => {
    const orders = [{
      orderNumber: '200',
      paymentMethod: 'MIXED',
      total: 500,
      paidAt: '2026-07-06T02:00:00.000Z',
      payments: [
        { method: 'CASH', amount: 300, status: 'PAID' },
        { method: 'TRANSFER', amount: 200, status: 'PAID' },
      ],
    }];
    const detail = transferOrdersDetail(orders);
    expect(detail).toHaveLength(1);
    expect(detail[0].amount).toBe(200);
  });

  test('renglones FAILED/REFUNDED no cuentan (mismo criterio que summarizePayments)', () => {
    // Mixto con la porción transfer reembolsada: solo queda el renglón CASH
    // acreditado, así que la orden NO aparece en el detalle de transferencias.
    const orders = [{
      orderNumber: '300',
      paymentMethod: 'MIXED',
      total: 700,
      payments: [
        { method: 'CASH', amount: 300, status: 'PAID' },
        { method: 'TRANSFER', amount: 400, status: 'REFUNDED' },
      ],
    }];
    expect(transferOrdersDetail(orders)).toHaveLength(0);
    expect(summarizePayments(orders).totalTransfer).toBe(0);
  });

  test('la suma del detalle cuadra con totalTransfer de summarizePayments', () => {
    const orders = [
      { orderNumber: '1', paymentMethod: 'TRANSFER', total: 150 },
      { orderNumber: '2', paymentMethod: 'OXXO', total: 99.9 },
      { orderNumber: '3', paymentMethod: 'CASH', total: 500 },
      {
        orderNumber: '4', paymentMethod: 'MIXED', total: 350,
        payments: [
          { method: 'CARD', amount: 100, status: 'PAID' },
          { method: 'SPEI', amount: 250, status: 'PAID' },
        ],
      },
    ];
    const sumDetail = transferOrdersDetail(orders).reduce((s, d) => s + d.amount, 0);
    expect(sumDetail).toBeCloseTo(summarizePayments(orders).totalTransfer, 2);
  });

  test('sin paidAt cae a createdAt para la hora del ticket', () => {
    const orders = [{
      orderNumber: '5', paymentMethod: 'TRANSFER', total: 80,
      paidAt: null, createdAt: '2026-07-06T03:15:00.000Z',
    }];
    expect(transferOrdersDetail(orders)[0].paidAt).toBe('2026-07-06T03:15:00.000Z');
  });
});
