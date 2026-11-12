import { historyState } from '../order-history';

test('cancelación prevalece sobre una confirmación de mesa pendiente', () => {
  expect(historyState({ status: 'CANCELLED', awaitingTableConfirmation: true }).label).toBe('Cancelado');
});
test('aceptación comercial y pago tienen explicaciones diferentes', () => {
  expect(historyState({ status: 'PENDING_MERCHANT', awaitingTableConfirmation: false }).label).toBe('Por aceptar en caja');
  expect(historyState({ status: 'PENDING_PAYMENT', awaitingTableConfirmation: false }).label).toBe('Esperando pago');
});
test('pedidos QR requieren confirmación y estados desconocidos no aparecen como listos', () => {
  expect(historyState({ status: 'PENDING', awaitingTableConfirmation: true }).label).toBe('Por confirmar en caja');
  expect(historyState({ status: 'FUTURE', awaitingTableConfirmation: false }).label).toBe('Estado no disponible');
});
