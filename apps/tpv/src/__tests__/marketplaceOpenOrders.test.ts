/**
 * Pedidos del marketplace en "cuentas abiertas": el comercio debe verlos para
 * aceptarlos aunque ya estén pagados en línea. El resto conserva la regla de
 * siempre (un ticket pagado deja la lista de abiertas).
 * Ejecutar: pnpm --filter @mrtpvrest/tpv test
 */
import useOfflineStore from "@/store/useOfflineStore";
import { loadOpenOrders, getLocalOrders } from "@/lib/order-repository";
import { pruneLocalOrders, orderRecordKey, type LocalOrders } from "@/lib/local-order-model";

jest.mock("idb-keyval", () => {
  const values = new Map<string, unknown>();
  return {
    get: jest.fn(async (key: string) => values.get(key)),
    set: jest.fn(async (key: string, value: unknown) => { values.set(key, value); }),
    del: jest.fn(async (key: string) => { values.delete(key); }),
  };
});

jest.mock("@/lib/token-vault", () => ({ getToken: jest.fn(async () => "test-token") }));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  AUTH_TOKEN_MISSING: "AUTH_TOKEN_MISSING",
  BACKEND_UNAVAILABLE: "BACKEND_UNAVAILABLE",
  default: { post: jest.fn(), put: jest.fn(), get: jest.fn() },
}));

import api from "@/lib/api";
const mockApi = api as jest.Mocked<typeof api>;

const store: Record<string, string> = {};
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => Object.keys(store).forEach((k) => delete store[k]),
  },
  configurable: true,
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem("restaurantId", "rest-1");
  localStorage.setItem("locationId", "loc-1");
  useOfflineStore.setState({ orders: {} });
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

it("muestra los pedidos del marketplace por aceptar, pagados o contra entrega", async () => {
  mockApi.get.mockResolvedValue({ data: [
    { id: "mp-paid", source: "MARKETPLACE", status: "PENDING_MERCHANT", paymentStatus: "PAID", items: [] },
    { id: "mp-cash", source: "MARKETPLACE", status: "PENDING_MERCHANT", paymentStatus: "PENDING", items: [] },
    { id: "web-paid", source: "ONLINE", status: "CONFIRMED", paymentStatus: "PAID", items: [] },
    { id: "mp-unpaid", source: "MARKETPLACE", status: "PENDING_PAYMENT", paymentStatus: "PENDING", items: [] },
  ] });

  const ids = (await loadOpenOrders()).map((o) => o.id).sort();

  expect(mockApi.get).toHaveBeenCalledWith("/api/orders/admin?scope=active");
  expect(ids).toEqual(["mp-cash", "mp-paid"]);
});

it("conserva los tickets entregados pendientes de depósito al volver a consultar y sin conexión", async () => {
  mockApi.get.mockResolvedValue({ data: [
    { id: "deposito", status: "DELIVERED", paymentStatus: "PENDING", shiftId: "turno-cerrado", items: [] },
    { id: "fallido", status: "DELIVERED", paymentStatus: "FAILED", items: [] },
    { id: "pagado", status: "DELIVERED", paymentStatus: "PAID", items: [] },
    { id: "reembolsado", status: "DELIVERED", paymentStatus: "REFUNDED", items: [] },
    { id: "cancelado", status: "CANCELLED", paymentStatus: "PENDING", items: [] },
  ] });
  expect((await loadOpenOrders()).map((o) => o.id).sort()).toEqual(["deposito", "fallido"]);
  mockApi.get.mockRejectedValue({ code: "ERR_NETWORK" });
  expect((await loadOpenOrders()).map((o) => o.id).sort()).toEqual(["deposito", "fallido"]);
  expect(getLocalOrders().find((o) => o.id === "deposito")).toMatchObject({ paymentStatus: "PENDING", shiftId: "turno-cerrado" });
});

it("no descarta pendientes de depósito al depurar más de mil tickets locales", () => {
  const scope = { restaurantId: "rest-1", locationId: "loc-1" };
  const records: LocalOrders = {};
  for (let i = 0; i < 1100; i++) {
    const id = String(i);
    records[orderRecordKey(scope, id)] = { scope, localId: id, serverId: id, pending: [],
      order: { id, status: "DELIVERED", paymentStatus: "PAID" } };
  }
  const key = orderRecordKey(scope, "deposito-antiguo");
  records[key] = { scope, localId: "deposito-antiguo", pending: [],
    order: { id: "deposito-antiguo", status: "DELIVERED", paymentStatus: "PENDING" } };
  const pruned = pruneLocalOrders(records);
  expect(pruned[key]).toBeDefined();
  expect(Object.keys(pruned)).toHaveLength(1001);
});
