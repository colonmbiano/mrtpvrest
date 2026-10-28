/**
 * useNotifications.webRound.test.tsx
 * Un pedido QR de una mesa con cuenta abierta entra como ronda de esa cuenta
 * (order:web-round), no como pedido nuevo. Nadie la capturó en un TPV, así que
 * la caja la anuncia y le pasa el aviso al POS para imprimir esa ronda.
 * Ejecutar: pnpm --filter @mrtpvrest/tpv test
 */
import { renderHook, waitFor, act } from "@testing-library/react";

const handlers: Record<string, (data: unknown) => void> = {};
const fakeSocket = {
  on: jest.fn((event: string, fn: (data: unknown) => void) => { handlers[event] = fn; }),
  off: jest.fn(),
  emit: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock("socket.io-client", () => ({ io: jest.fn(() => fakeSocket) }));
jest.mock("@/lib/token-vault", () => ({ getToken: jest.fn().mockResolvedValue("tok") }));
jest.mock("@/lib/tenant", () => ({ getTenantIds: () => ({ restaurantId: "r1", locationId: "loc1" }) }));
jest.mock("@/lib/config", () => ({ getApiUrl: () => "http://api.test" }));
jest.mock("@/lib/notificationSound", () => ({
  playNotificationSound: jest.fn(),
  primeNotificationSound: jest.fn(),
}));
jest.mock("@/lib/localNotifications", () => ({
  ensureNotifPermission: jest.fn().mockResolvedValue(undefined),
  fireLocalNotification: jest.fn(),
}));
jest.mock("sonner", () => ({ toast: Object.assign(jest.fn(), { info: jest.fn(), success: jest.fn() }) }));

import { useNotifications, useNotifStore } from "@/hooks/useNotifications";

beforeEach(() => {
  jest.clearAllMocks();
  useNotifStore.getState().clear();
});

test("order:web-round avisa a la caja y pasa la ronda al POS para imprimirla", async () => {
  const onWebRound = jest.fn();
  const onOrderNew = jest.fn();
  renderHook(() => useNotifications({ onWebRound, onOrderNew }));
  await waitFor(() => expect(handlers["order:web-round"]).toBeDefined());

  const payload = {
    id: "tab-1", orderNumber: 2001, roundId: "qr-abc", roundNumber: 2,
    tableNumber: 7, tableName: "Mesa 7", customerName: "Ana", total: 140, source: "ONLINE",
  };
  act(() => handlers["order:web-round"]?.(payload));

  expect(onWebRound).toHaveBeenCalledWith(payload);
  // No es un pedido nuevo: no pasa por la auto-impresión de pedidos completos.
  expect(onOrderNew).not.toHaveBeenCalled();
  expect(useNotifStore.getState().notifications).toEqual([
    expect.objectContaining({
      title: "🍽️ Ronda por QR",
      body: "Mesa 7 · cuenta 2001 · Ana · $140.00",
      orderNumber: 2001,
      total: 140,
    }),
  ]);
});
