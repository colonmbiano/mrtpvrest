jest.mock('@mrtpvrest/database', () => ({ prisma: {
  printer: { findMany: jest.fn(), findFirst: jest.fn() },
} }));
jest.mock('net', () => ({ Socket: jest.fn() }));

const net = require('net');
const { prisma } = require('@mrtpvrest/database');
const { printToIp, printOrderTicket, printBillTicket, kickCashDrawerForLocation } =
  require('../src/services/printer.service');

describe('impresión local cuando el backend está en Railway', () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.RAILWAY_ENVIRONMENT_ID = 'test-cloud';
    delete process.env.SERVER_PRINTING_ENABLED;
    jest.clearAllMocks();
  });
  afterAll(() => { process.env = original; });

  test('las órdenes se dejan al TPV sin abrir sockets ni consultar impresoras', async () => {
    await expect(printOrderTicket({ id: 'o1' })).resolves.toMatchObject({ delegated: true });
    await expect(printBillTicket({ id: 'o1' })).resolves.toMatchObject({ delegated: true });
    await expect(kickCashDrawerForLocation('l1')).resolves.toMatchObject({ ok: false, reason: 'local_tpv_required' });
    expect(prisma.printer.findMany).not.toHaveBeenCalled();
    expect(net.Socket).not.toHaveBeenCalled();
  });

  test('una impresión manual devuelve una instrucción en lugar de fingir éxito', async () => {
    await expect(printToIp('192.168.1.10', 9100, 'ticket'))
      .rejects.toMatchObject({ code: 'LOCAL_TPV_PRINT_REQUIRED' });
    expect(net.Socket).not.toHaveBeenCalled();
  });

  test('permite la impresión por un servidor local con conectividad explícita', async () => {
    process.env.SERVER_PRINTING_ENABLED = 'true';
    await expect(printToIp('0.0.0.0', 9100, 'virtual')).resolves.toBeUndefined();
  });
});
