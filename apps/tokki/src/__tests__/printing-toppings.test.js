jest.mock('idb-keyval', () => ({ get: jest.fn() }));
jest.mock('../lib/printer-tcp', () => ({ printKitchenTickets: jest.fn() }));
import { kitchenTargets, normalizePrinters, printTokkiOrder } from '../lib/tokki-printers';
import { toppingCell } from '../lib/topping-art';
import { get } from 'idb-keyval';
import { printKitchenTickets } from '../lib/printer-tcp';
const cashier = { id: '1', name: 'Caja', type: 'CASHIER', stations: ['CASHIER'], isActive: true, connectionType: 'NETWORK', ip: '192.168.1.20', port: 9100 };
test('una impresora de caja también recibe comandas sin mutar su configuración', () => {
  expect(kitchenTargets([cashier])[0].stations).toContain('BAR');
  expect(cashier.stations).toEqual(['CASHIER']);
});
test('respeta estaciones cuando hay una impresora de barra', () => {
  const printers = [cashier, { ...cashier, id: '2', type: 'BAR', stations: ['BAR'] }];
  expect(kitchenTargets(printers)).toEqual(printers);
});
test('no activa impresoras apagadas ni selecciona una arbitraria entre varias', () => {
  expect(kitchenTargets([{ ...cashier, isActive: false }])[0].stations).toEqual(['CASHIER']);
  expect(kitchenTargets([cashier, { ...cashier, id: '2' }])[0].stations).toEqual(['CASHIER']);
});
test('migra registros TCP antiguos', () => {
  expect(normalizePrinters([{ id: 'old', type: 'TCP', ip: cashier.ip }])[0]).toMatchObject({ connectionType: 'NETWORK', isActive: true, type: 'CASHIER' });
});
test('usa la configuración recién guardada y deduplica impresora remota', async () => {
  get.mockResolvedValue([cashier]); printKitchenTickets.mockResolvedValue({ ok: 1, failed: [] });
  await printTokkiOrder([{ ...cashier, id: 'remote' }], { items: [] });
  expect(printKitchenTickets.mock.calls.at(-1)[0]).toHaveLength(1);
});
test('un fallo real de impresión llega al usuario', async () => {
  get.mockResolvedValue([cashier]); printKitchenTickets.mockResolvedValue({ ok: 0, failed: [{ name: 'Caja', error: 'Timeout' }] });
  await expect(printTokkiOrder([], { items: [] })).rejects.toThrow('Caja: Timeout');
});
test.each([['Tapioca negra',0],['Extra popping boba',1],['Jelly tropical',2],['Aloe vera',3],['Toki Cloud',4],['Toki Cheese Cloud',5],['Sin nivel',null]])('imagen para %s', (name, cell) => expect(toppingCell(name)).toBe(cell));
