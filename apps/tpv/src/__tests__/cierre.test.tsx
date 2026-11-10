import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CierreTurno from '@/app/cierre/page';
import api from '@/lib/api';
import { shiftActionQueued } from '@/lib/offline';

jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), back: jest.fn() }) }));
jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn(), put: jest.fn() } }));
jest.mock('@/lib/offline', () => ({ shiftActionQueued: jest.fn() }));
jest.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));
jest.mock('@/store/authStore', () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ employee: { name: 'Cajero', role: 'CASHIER' } }) }));
jest.mock('@/hooks/usePrinters', () => ({
  usePrinters: () => ({ printers: [] }),
  useReceiptIdentity: () => ({ businessName: 'Master Burguers' }),
  useFullTicketConfig: () => ({ config: {} }),
}));
jest.mock('@/lib/printer-tcp', () => ({ printShiftCloseTicket: jest.fn().mockResolvedValue({ ok: 1 }) }));
jest.mock('@/components/pos/PurchasesExpensesModal', () => ({ __esModule: true, default: () => null }));

const shift = { id: 's1', openedAt: '2026-11-09T21:44:17Z', openingFloat: 100, blindClose: true, totalCash: 200,
  totalCard: 0, totalTransfer: 255, totalSales: 455, totalExpenses: 0, expenses: [], cashIns: [] };
const review = { driverReceipts: [{ driverId: 'polo', name: 'Polo', expectedCash: 300 }],
  warnings: [{ code: 'UNVERIFIED_PAYMENTS', count: 1, label: 'Pagos digitales sin verificar', amount: 255 }],
  unverifiedPayments: [{ id: 'o1', orderNumber: '6303', amount: 255, method: 'TRANSFER' }],
  unassignedDeliveries: [], missingReceipts: [], responsibles: [] };

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  (api.get as jest.Mock).mockImplementation((path: string) => Promise.resolve({ data: path.endsWith('/preclose') ? review : shift }));
  (shiftActionQueued as jest.Mock).mockResolvedValue({ ok: true, data: { ...shift, closedAt: '2026-11-10T06:30:00Z' } });
});

test('muestra los pendientes y envía el motivo y el efectivo real al cerrar desde /cierre', async () => {
  render(<CierreTurno />);
  expect(await screen.findByText('#6303 · Transferencia · $255.00')).toBeInTheDocument();
  const close = screen.getByRole('button', { name: 'Confirmar y Cerrar Turno' });
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '500' } });
  expect(close).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Efectivo que recibiste'), { target: { value: '300' } });
  expect(close).toBeDisabled();
  const reason = 'Se revisará el SPEI contra el banco al abrir mañana';
  fireEvent.change(screen.getByLabelText('Si quedan pendientes, explica por qué autorizas el cierre'), { target: { value: reason } });
  await waitFor(() => expect(close).toBeEnabled());
  fireEvent.click(close);
  await waitFor(() => expect(shiftActionQueued).toHaveBeenCalledWith('shift-close', 'close', {
    closingFloat: 500, notes: null, closeReviewReason: reason,
    driverReceipts: [{ driverId: 'polo', countedCash: 300, differenceReason: '' }],
  }, 's1'));
  expect(await screen.findByText('Turno cerrado')).toBeInTheDocument();
});

test('impide confirmar si no se pudieron cargar los pendientes', async () => {
  (api.get as jest.Mock).mockImplementation((path: string) => path.endsWith('/preclose')
    ? Promise.reject(new Error('sin conexión')) : Promise.resolve({ data: shift }));
  render(<CierreTurno />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo revisar el cierre');
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '500' } });
  expect(screen.getByRole('button', { name: 'Confirmar y Cerrar Turno' })).toBeDisabled();
  expect(shiftActionQueued).not.toHaveBeenCalled();
});

test('vuelve a consultar los pendientes si el servidor rechaza el cierre', async () => {
  (api.get as jest.Mock).mockImplementation((path: string) => Promise.resolve({ data: path.endsWith('/preclose')
    ? { ...review, driverReceipts: [], warnings: [], unverifiedPayments: [] } : shift }));
  (shiftActionQueued as jest.Mock).mockResolvedValue({ ok: false, error: 'Hay nuevos pendientes en el turno' });
  render(<CierreTurno />);
  await screen.findByText('Repartidores: sin entregas de efectivo pendientes de corte.');
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '500' } });
  const close = screen.getByRole('button', { name: 'Confirmar y Cerrar Turno' });
  await waitFor(() => expect(close).toBeEnabled());
  fireEvent.click(close);
  expect(await screen.findByText('Hay nuevos pendientes en el turno')).toBeInTheDocument();
  await waitFor(() => expect((api.get as jest.Mock).mock.calls.filter(([path]) => path.endsWith('/preclose'))).toHaveLength(2));
});
