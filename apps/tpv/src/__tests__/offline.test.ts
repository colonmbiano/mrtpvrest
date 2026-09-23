/**
 * offline.test.ts
 * Pruebas de apiOrQueue: decide entre llamar al backend o encolar la
 * transacción. Foco en la apertura de turno offline (type 'shift').
 * Ejecutar: pnpm --filter @mrtpvrest/tpv test
 */
import { apiOrQueue, shiftActionQueued, syncOfflineQueue } from "@/lib/offline";
import useOfflineStore, { flushOfflinePersistence, mergeOfflinePersistedStates } from "@/store/useOfflineStore";
import { getLocalOrder, getLocalOrders, loadOrder, loadOpenOrders, rememberServerOrder } from '@/lib/order-repository';
import { resetBackendAvailability } from "@/lib/backend-availability";
import { getToken } from "@/lib/token-vault";
import { useAuthStore } from "@/store/authStore";

jest.mock("idb-keyval", () => {
  const values = new Map<string, unknown>();
  return {
    get: jest.fn(async (key: string) => values.get(key)),
    set: jest.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
});

jest.mock("@/lib/token-vault", () => ({
  getToken: jest.fn(async () => "test-token"),
}));

// Mock del axios singleton.
jest.mock("@/lib/api", () => ({
  __esModule: true,
  AUTH_TOKEN_MISSING: "AUTH_TOKEN_MISSING",
  BACKEND_UNAVAILABLE: "BACKEND_UNAVAILABLE",
  default: { post: jest.fn(), put: jest.fn(), get: jest.fn() },
}));

import api from "@/lib/api";
const mockApi = api as jest.Mocked<typeof api>;
const mockGetToken = getToken as jest.MockedFunction<typeof getToken>;

// localStorage para el persist de zustand.
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

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", { value: online, configurable: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.get.mockReset().mockResolvedValue({ data: [] });
  mockApi.post.mockReset().mockResolvedValue({ data: {} });
  mockApi.put.mockReset().mockResolvedValue({ data: {} });
  localStorage.setItem("restaurantId", "rest-1");
  localStorage.setItem("locationId", "loc-1");
  useAuthStore.setState({ isAuthenticated: true, employee: {
    id: "employee-1", name: "Caja", role: "CASHIER", isActive: true, permissions: [],
  } });
  useOfflineStore.getState().clearQueue();
  useOfflineStore.setState({ orders: {} });
  // El candado es estado compartido del store: si un test lo deja en true,
  // el guard de syncOfflineQueue hace salir temprano al siguiente.
  useOfflineStore.getState().setSyncInProgress(false);
  resetBackendAvailability();
  mockGetToken.mockResolvedValue("test-token");
  setOnline(true);
});

describe('cuentas locales completas', () => {
  const firstItems = [{ menuItemId: 'p1', name: 'Agua', quantity: 1, price: 20, subtotal: 20 }];
  async function createLocal(tableId?: string) {
    setOnline(false);
    return apiOrQueue<any>('order', 'POST', '/api/orders/tpv', {
      orderType: tableId ? 'DINE_IN' : 'TAKEOUT', tableId,
      items: [{ menuItemId: 'p1', quantity: 1 }], subtotal: 20, total: 20,
    }, { localOrder: { items: firstItems, expectedTotal: 20 } });
  }

  it('guarda, recarga, agrega ronda y cobra la misma cuenta sin red', async () => {
    const created = await createLocal();
    expect(created).toMatchObject({ ok: true, queued: true, data: { total: 20 } });
    const id = created.data.id;
    await flushOfflinePersistence();
    const { get } = jest.requireMock('idb-keyval');
    const persisted = await get('tpv-offline-store');
    expect(JSON.parse(persisted).state.orders).not.toEqual({});
    useOfflineStore.setState({ queue: [], orders: {} });
    get.mockResolvedValueOnce(persisted);
    await useOfflineStore.persist.rehydrate();
    expect((await loadOrder(id)).items[0].name).toBe('Agua');
    const added = await apiOrQueue<any>('order', 'POST', `/api/orders/${id}/items`, {
      items: [{ menuItemId: 'p2', quantity: 1 }],
    }, { localOrder: { items: [{ name: 'Extra', menuItemId: 'p2', price: 10, subtotal: 10, quantity: 1 }] } });
    expect(added.data.total).toBe(30);
    expect(added.data.items).toHaveLength(2);
    const payment = await apiOrQueue<any>('payment', 'PUT', `/api/orders/${id}/payment`, { paymentMethod: 'CASH' });
    expect(payment.data).toMatchObject({ paymentStatus: 'PAID', total: 30 });
    expect(getLocalOrders()).toHaveLength(0);
    expect(getLocalOrders('paid')).toHaveLength(1);
    expect(useOfflineStore.getState().queue.at(-1)?.data.body.expectedTotal).toBe(30);
    expect(await apiOrQueue('payment', 'PUT', `/api/orders/${id}/payment`, { paymentMethod: 'CASH' }))
      .toMatchObject({ ok: false, status: 409 });
  });

  it('remapea el identificador antes de enviar rondas y pago, sin borrar la proyección pendiente', async () => {
    const created = await createLocal();
    const id = created.data.id;
    await apiOrQueue('order', 'POST', `/api/orders/${id}/items`, { items: [{ menuItemId: 'p1', quantity: 1 }] },
      { localOrder: { items: firstItems } });
    await apiOrQueue('payment', 'PUT', `/api/orders/${id}/payment`, { paymentMethod: 'CASH' });
    setOnline(true);
    mockApi.get.mockResolvedValue({ data: [] });
    mockApi.post.mockImplementation(async path => {
      if (path === '/api/orders/tpv') return { data: { id: 'server-1', total: 20, items: firstItems, paymentStatus: 'PENDING' } };
      expect(path).toBe('/api/orders/server-1/items');
      expect(getLocalOrder(id)).toMatchObject({ total: 40, paymentStatus: 'PAID' });
      return { data: { id: 'server-1', total: 40 } };
    });
    mockApi.put.mockResolvedValue({ data: { id: 'server-1', total: 40, status: 'DELIVERED', paymentStatus: 'PAID' } });
    await syncOfflineQueue();
    expect(mockApi.put).toHaveBeenCalledWith('/api/orders/server-1/payment', expect.objectContaining({ expectedTotal: 40 }), expect.anything());
    expect(useOfflineStore.getState().queue).toHaveLength(0);
    expect(getLocalOrder(id)).toMatchObject({ id: 'server-1', total: 40, localPending: false });
    const sentBody = mockApi.post.mock.calls[0]![1] as any;
    expect(sentBody).not.toHaveProperty('localOrder');
    expect(sentBody.items[0]).not.toHaveProperty('name');
  });

  it('no envía una ronda antes de obtener el ACK durable de la creación', async () => {
    const { data } = await createLocal();
    await apiOrQueue('order', 'POST', `/api/orders/${data.id}/items`, { items: [] }, { localOrder: { items: [] } });
    setOnline(true);
    mockApi.get.mockResolvedValue({ data: [] });
    mockApi.post.mockResolvedValue({ data: {} });
    await syncOfflineQueue();
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(useOfflineStore.getState().queue).toHaveLength(2);
  });

  it('un fallo de disco no confirma ni deja una cuenta fantasma', async () => {
    const { set } = jest.requireMock('idb-keyval');
    await flushOfflinePersistence();
    set.mockRejectedValueOnce(new Error('QuotaExceededError'));
    const result = await createLocal();
    expect(result.ok).toBe(false);
    expect(getLocalOrders()).toHaveLength(0);
    expect(useOfflineStore.getState().queue).toHaveLength(0);
  });

  it('rechaza duplicar una mesa local y no fusiona a ciegas al sincronizar', async () => {
    const created = await createLocal('mesa-1');
    expect(useOfflineStore.getState().queue[0]?.data.body.appendToOpenTab).toBeUndefined();
    expect(await createLocal('mesa-1')).toMatchObject({ ok: false, status: 409,
      conflict: { existingOrder: { id: created.data.id } } });
  });

  it('crear y cobrar guarda el importe base sin sumar la propina dos veces', async () => {
    setOnline(false);
    const result = await apiOrQueue<any>('order', 'POST', '/api/orders/tpv', {
      orderType: 'DINE_IN', tableId: 'mesa-2', items: [{ menuItemId: 'p1', quantity: 1 }],
      subtotal: 20, total: 22, paymentMethod: 'MIXED', status: 'DELIVERED',
      tip: 2, payments: [{ method: 'CASH', amount: 22 }],
    }, { localOrder: { items: firstItems, expectedTotal: 20 } });
    expect(result.data).toMatchObject({ paymentStatus: 'PAID', total: 20, tip: 2 });
    expect(getLocalOrders()).toHaveLength(0);
    expect(getLocalOrders('paid')).toHaveLength(1);
    expect(useOfflineStore.getState().queue[0]?.data.body.expectedTotal).toBe(20);
  });

  it('aísla cuentas por sucursal y evita descartes que dejarían comandos huérfanos', async () => {
    const created = await createLocal();
    const tx = useOfflineStore.getState().queue[0]!;
    expect(useOfflineStore.getState().discardTransaction(tx.id)).toBe(false);
    localStorage.setItem('locationId', 'loc-2');
    expect(getLocalOrders()).toEqual([]);
    expect(await apiOrQueue('payment', 'PUT', `/api/orders/${created.data.id}/payment`, { paymentMethod: 'CASH' }))
      .toMatchObject({ ok: false });
    expect(useOfflineStore.getState().queue).toHaveLength(1);
  });

  it('una lista remota vacía no borra una venta pendiente y el detalle conserva modificadores cacheados', async () => {
    const created = await createLocal();
    setOnline(true);
    mockApi.get.mockResolvedValue({ data: [] });
    expect((await loadOpenOrders()).map(o => o.id)).toEqual([created.data.id]);
    rememberServerOrder({ id: 'remote', status: 'CONFIRMED', items: [{ id: 'line', name: 'Agua', modifiers: [{ name: 'Hielo' }] }] });
    rememberServerOrder({ id: 'remote', status: 'CONFIRMED', items: [{ id: 'line', quantity: 2 }] });
    expect(getLocalOrder('remote').items[0].modifiers).toHaveLength(1);
  });
});

describe("apiOrQueue — apertura de turno offline", () => {
  it("no confirma ventas sin una sesión PIN y sucursal", async () => {
    setOnline(false);
    useAuthStore.setState({ isAuthenticated: false, employee: null });
    expect(await apiOrQueue("order", "POST", "/api/orders/tpv", {}))
      .toMatchObject({ ok: false, queued: false, status: 401 });
    expect(useOfflineStore.getState().getUnsyncedTransactions()).toHaveLength(0);
  });

  it("conserva el empleado original si cambia mientras el servidor no responde", async () => {
    mockApi.post.mockImplementationOnce(async () => {
      useAuthStore.setState({ employee: {
        id: "employee-2", name: "Relevo", role: "CASHIER", isActive: true, permissions: [],
      } });
      throw { code: "ERR_NETWORK" };
    });
    expect(await apiOrQueue("order", "POST", "/api/orders/tpv", {}))
      .toMatchObject({ ok: true, queued: true });
    expect(useOfflineStore.getState().getUnsyncedTransactions()[0]?.scope)
      .toMatchObject({ employeeId: "employee-1", restaurantId: "rest-1", locationId: "loc-1" });
  });

  it("offline: encola y NO pega al backend", async () => {
    setOnline(false);

    const res = await apiOrQueue("shift", "POST", "/api/shifts/open", {
      openingFloat: 500,
    });

    expect(res).toMatchObject({ ok: true, queued: true });
    expect(mockApi.post).not.toHaveBeenCalled();
    const q = useOfflineStore.getState().getUnsyncedTransactions();
    expect(q).toHaveLength(1);
    expect(q[0]!).toMatchObject({ type: "shift", data: { method: "POST", path: "/api/shifts/open" } });
  });

  it("online con error de red: encola (no bloquea al cajero)", async () => {
    mockApi.post.mockRejectedValueOnce({ code: "ERR_NETWORK" });

    const res = await apiOrQueue("shift", "POST", "/api/shifts/open", { openingFloat: 500 });

    expect(res).toMatchObject({ ok: true, queued: true });
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(useOfflineStore.getState().getUnsyncedTransactions()).toHaveLength(1);
  });

  it("online con 4xx (sin permisos): NO encola y expone status", async () => {
    mockApi.post.mockRejectedValueOnce({
      response: { status: 403, data: { error: "No tienes permisos" } },
    });

    const res = await apiOrQueue("shift", "POST", "/api/shifts/open", { openingFloat: 500 });

    expect(res).toMatchObject({ ok: false, queued: false, status: 403, error: "No tienes permisos" });
    expect(useOfflineStore.getState().getUnsyncedTransactions()).toHaveLength(0);
  });

  it("online OK: devuelve data del server sin encolar", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: "shift-1", isOpen: true } });

    const res = await apiOrQueue("shift", "POST", "/api/shifts/open", { openingFloat: 500 });

    expect(res).toMatchObject({ ok: true, queued: false, data: { id: "shift-1" } });
    expect(useOfflineStore.getState().getUnsyncedTransactions()).toHaveLength(0);
  });

  it("manda Idempotency-Key en el intento online (dedupe del replay)", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: "shift-1" } });

    await apiOrQueue("shift", "POST", "/api/shifts/open", { openingFloat: 500 });

    const cfg = mockApi.post.mock.calls[0]![2] as { headers?: Record<string, string> };
    expect(cfg?.headers?.["Idempotency-Key"]).toBeTruthy();
  });

  it("abre el circuito tras un 5xx y la siguiente venta encola sin esperar", async () => {
    mockApi.post.mockRejectedValueOnce({
      response: { status: 502, data: { error: "Bad gateway" } },
    });

    const first = await apiOrQueue("order", "POST", "/api/orders/tpv", {
      items: [],
    });
    expect(first).toMatchObject({ ok: true, queued: true });

    mockApi.post.mockClear();
    const second = await apiOrQueue("order", "POST", "/api/orders/tpv", {
      items: [],
    });

    expect(second).toMatchObject({ ok: true, queued: true });
    expect(mockApi.post).not.toHaveBeenCalled();
    expect(useOfflineStore.getState().getUnsyncedTransactions()).toHaveLength(2);
  });

  it("no fusiona silenciosamente una venta offline ya cobrada con otra cuenta", async () => {
    setOnline(false);

    await apiOrQueue("order", "POST", "/api/orders/tpv", {
      tableId: "table-1",
      items: [{ menuItemId: "item-1", quantity: 1 }],
      status: "DELIVERED",
      paymentMethod: "CASH",
    });

    const [transaction] = useOfflineStore.getState().getUnsyncedTransactions();
    expect(transaction?.data.body).not.toHaveProperty("appendToOpenTab");
  });
});

describe("migración de la cola localStorage → IndexedDB", () => {
  it("fusiona ambas colas, deduplica y conserva la versión más reciente", () => {
    const legacy = JSON.stringify({
      state: {
        queue: [
          { id: "legacy", type: "order", timestamp: 1, synced: false, data: {} },
          { id: "shared", type: "order", timestamp: 2, synced: false, data: { source: "legacy" } },
        ],
        lastSync: 10,
      },
      version: 0,
    });
    const current = JSON.stringify({
      state: {
        queue: [
          { id: "shared", type: "order", timestamp: 2, synced: true, data: { source: "idb" } },
          { id: "current", type: "payment", timestamp: 3, synced: false, data: {} },
        ],
        lastSync: 20,
      },
      version: 0,
    });

    const merged = JSON.parse(mergeOfflinePersistedStates(current, legacy)!);
    expect(merged.state.queue.map((tx: { id: string }) => tx.id)).toEqual([
      "legacy",
      "shared",
      "current",
    ]);
    expect(merged.state.queue[1]).toMatchObject({ synced: true, data: { source: "idb" } });
    expect(merged.state.lastSync).toBe(20);
  });
});

describe("apiOrQueue — cierre / gastos / ingresos offline (Fase 2)", () => {
  it("encola cierre offline contra /current/close", async () => {
    setOnline(false);
    const res = await apiOrQueue("shift-close", "POST", "/api/shifts/current/close", { closingFloat: 1000 });
    expect(res).toMatchObject({ ok: true, queued: true });
    const q = useOfflineStore.getState().getUnsyncedTransactions();
    expect(q).toHaveLength(1);
    expect(q[0]!).toMatchObject({ type: "shift-close", data: { path: "/api/shifts/current/close" } });
  });

  it("encola gasto e ingreso de caja offline", async () => {
    setOnline(false);
    await apiOrQueue("shift-expense", "POST", "/api/shifts/current/expenses", { amount: 50 });
    await apiOrQueue("shift-cashin", "POST", "/api/shifts/current/cash-ins", { amount: 30 });
    const types = useOfflineStore.getState().getUnsyncedTransactions().map((t) => t.type);
    expect(types).toEqual(["shift-expense", "shift-cashin"]);
  });
});

describe("shiftActionQueued — fallback de despliegue (/current → /:id)", () => {
  it("si /current/close da 404 y hay shiftId, reintenta /:id/close", async () => {
    mockApi.post
      .mockRejectedValueOnce({ response: { status: 404, data: { error: "Not found" } } })
      .mockResolvedValueOnce({ data: { id: "SID", isOpen: false } });

    const res = await shiftActionQueued("shift-close", "close", { closingFloat: 0 }, "SID");

    expect(res).toMatchObject({ ok: true, data: { id: "SID" } });
    expect(mockApi.post).toHaveBeenCalledTimes(2);
    expect(mockApi.post.mock.calls[0]![0]).toBe("/api/shifts/current/close");
    expect(mockApi.post.mock.calls[1]![0]).toBe("/api/shifts/SID/close");
  });
});

describe("syncOfflineQueue — gate de orden del cierre", () => {
  beforeEach(() => {
    // /employees/sync se llama al inicio del replay; lo silenciamos.
    mockApi.get.mockResolvedValue({ data: [] });
  });

  function enqueue(type: any, path: string, id: string, timestamp: number) {
    useOfflineStore.getState().addToQueue({
      id, type, timestamp, synced: false,
      data: { method: "POST", path, body: {} },
    });
  }

  it("NO cierra mientras una orden más vieja siga pendiente", async () => {
    enqueue("order", "/api/orders/tpv", "order-1", 1000);
    enqueue("shift-close", "/api/shifts/current/close", "close-1", 2000);

    // La orden falla (red) → queda pendiente; el cierre NO debe postearse.
    mockApi.post.mockImplementation((path: string) => {
      if (path === "/api/orders/tpv") return Promise.reject({ code: "ERR_NETWORK" });
      return Promise.resolve({ data: {} });
    });

    await syncOfflineQueue();

    const postedPaths = mockApi.post.mock.calls.map((c) => c[0]);
    expect(postedPaths).toContain("/api/orders/tpv");
    expect(postedPaths).not.toContain("/api/shifts/current/close");
    // El cierre sigue en cola para el próximo tick.
    expect(useOfflineStore.getState().getUnsyncedTransactions().map((t) => t.id)).toContain("close-1");
  });

  it("cierra cuando ya no hay tx más viejas pendientes", async () => {
    enqueue("order", "/api/orders/tpv", "order-2", 1000);
    enqueue("shift-close", "/api/shifts/current/close", "close-2", 2000);
    mockApi.post.mockResolvedValue({ data: {} });

    await syncOfflineQueue();

    const postedPaths = mockApi.post.mock.calls.map((c) => c[0]);
    expect(postedPaths).toContain("/api/orders/tpv");
    expect(postedPaths).toContain("/api/shifts/current/close");
    expect(useOfflineStore.getState().getUnsyncedTransactions()).toHaveLength(0);
  });
});

// Un 4xx definitivo en el replay (ej. la ronda encolada llega cuando la orden
// ya se cobró) se reintentaba cada 5s para siempre: el chip quedaba en "1
// pendiente" de por vida y el personal aprendía a ignorarlo.
describe("syncOfflineQueue — replay rechazado con 4xx definitivo", () => {
  beforeEach(() => {
    mockApi.get.mockResolvedValue({ data: [] });
  });

  function enqueue(type: any, path: string, id: string, timestamp: number) {
    useOfflineStore.getState().addToQueue({
      id, type, timestamp, synced: false,
      data: { method: "POST", path, body: {} },
    });
  }

  it("400 congela la tx con su motivo y NO la reintenta en el siguiente tick", async () => {
    enqueue("order", "/api/orders/OID/items", "items-1", 1000);
    mockApi.post.mockRejectedValue({
      response: { status: 400, data: { error: "La orden ya fue pagada" } },
    });

    await syncOfflineQueue();
    await syncOfflineQueue();

    // Un solo intento: el segundo pase ya no la considera.
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(useOfflineStore.getState().getUnsyncedTransactions()).toHaveLength(0);

    const [dead] = useOfflineStore.getState().getFailedTransactions();
    expect(dead!.id).toBe("items-1");
    expect(dead!.failed).toMatchObject({ status: 400, error: "La orden ya fue pagada" });
  });

  it.each([401, 404, 429, 500])(
    "%i NO la congela — sigue en cola para reintentar",
    async (status) => {
      enqueue("order", "/api/orders/tpv", `tx-${status}`, 1000);
      mockApi.post.mockRejectedValue({ response: { status, data: {} } });

      await syncOfflineQueue();

      expect(useOfflineStore.getState().getUnsyncedTransactions()).toHaveLength(1);
      expect(useOfflineStore.getState().getFailedTransactions()).toHaveLength(0);
    }
  );

  it("una tx congelada bloquea el cierre para preservar causalidad", async () => {
    enqueue("order", "/api/orders/OID/items", "items-2", 1000);
    enqueue("shift-close", "/api/shifts/current/close", "close-3", 2000);
    mockApi.post.mockImplementation((path: string) => {
      if (path === "/api/orders/OID/items") {
        return Promise.reject({ response: { status: 400, data: { error: "Orden cerrada" } } });
      }
      return Promise.resolve({ data: {} });
    });

    // Pase 1: la orden se congela; el cierre se pospone (aún la ve más vieja).
    await syncOfflineQueue();
    // Pase 2: el error sigue pendiente de revisión → el cierre no se adelanta.
    await syncOfflineQueue();

    const postedPaths = mockApi.post.mock.calls.map((c) => c[0]);
    expect(postedPaths).not.toContain("/api/shifts/current/close");
    expect(useOfflineStore.getState().getUnsyncedTransactions()).toHaveLength(1);
    expect(useOfflineStore.getState().getFailedTransactions()).toHaveLength(1);
  });

  it("un syncInProgress viejo NO congela la cola (deadlock de rehidratación)", async () => {
    // Simula lo que pasaba en la tablet: la app murió a mitad de un replay,
    // `syncInProgress: true` quedó en localStorage y se rehidrató al abrir.
    // Sin el merge que lo fuerza a false, el guard de syncOfflineQueue salía
    // temprano para siempre y la cola no volvía a drenar nunca.
    const rehidratado = useOfflineStore.persist.getOptions().merge!(
      { queue: [], lastSync: 0, syncInProgress: true },
      useOfflineStore.getState()
    ) as { syncInProgress: boolean };

    expect(rehidratado.syncInProgress).toBe(false);
  });

  it("acota /employees/sync con timeout (el axios global no trae uno)", async () => {
    useOfflineStore.getState().addToQueue({
      id: "tx-timeout", type: "order", timestamp: 1000, synced: false,
      data: { method: "POST", path: "/api/orders/tpv", body: {} },
    });
    mockApi.post.mockResolvedValue({ data: {} });

    await syncOfflineQueue();

    const cfg = mockApi.get.mock.calls[0]![1] as { timeout?: number };
    expect(cfg?.timeout).toBeGreaterThan(0);
  });

  it("no intenta replay sin JWT y conserva intacta la venta", async () => {
    useOfflineStore.getState().addToQueue({
      id: "tx-no-token", type: "order", timestamp: 1000, synced: false,
      data: { method: "POST", path: "/api/orders/tpv", body: {} },
    });
    mockGetToken.mockResolvedValueOnce(null);

    await syncOfflineQueue();

    expect(mockApi.get).not.toHaveBeenCalled();
    expect(mockApi.post).not.toHaveBeenCalled();
    expect(useOfflineStore.getState().getUnsyncedTransactions()).toHaveLength(1);
  });

  it("el replay legacy tambien va acotado con timeout", async () => {
    // Shape legacy (sin method/path): lo encolan ManagerOverrideModal y
    // AdminPinGuardModal como tipo 'override'. Era la unica llamada HTTP del
    // loop sin cfg, y el axios global no trae timeout propio.
    useOfflineStore.getState().addToQueue({
      id: "override-legacy", type: "override", timestamp: 1000, synced: false,
      data: { permission: "reopen_table" },
    });
    mockApi.post.mockResolvedValue({ data: {} });

    await syncOfflineQueue();

    const call = mockApi.post.mock.calls.find((c) => c[0] === "/api/sync/transaction");
    expect(call).toBeDefined();
    expect((call![2] as { timeout?: number })?.timeout).toBeGreaterThan(0);
  });

  it("un candado sin latido no bloquea el sync para siempre", async () => {
    // Simula un pase anterior que se colgó: el flag quedó en true dentro de
    // este mismo proceso y nunca hubo latido. El watchdog debe tomar el relevo.
    useOfflineStore.getState().addToQueue({
      id: "tx-watchdog", type: "order", timestamp: 1000, synced: false,
      data: { method: "POST", path: "/api/orders/tpv", body: {} },
    });
    useOfflineStore.getState().setSyncInProgress(true);
    mockApi.post.mockResolvedValue({ data: {} });

    // El latido vive en el módulo y los tests anteriores lo dejaron fresco.
    // Adelantamos el reloj más allá de SYNC_STALE_MS para simular el cuelgue.
    const nowSpy = jest.spyOn(Date, "now").mockReturnValue(Date.now() + 120_000);
    try {
      await syncOfflineQueue();
    } finally {
      nowSpy.mockRestore();
    }

    // Sin watchdog esto seria 0: el guard habria salido temprano.
    expect(mockApi.post).toHaveBeenCalledWith(
      "/api/orders/tpv", expect.anything(), expect.anything()
    );
    expect(useOfflineStore.getState().getUnsyncedTransactions()).toHaveLength(0);
    expect(useOfflineStore.getState().syncInProgress).toBe(false);
  });

  it("no persiste syncInProgress en localStorage", () => {
    const persistido = useOfflineStore.persist.getOptions().partialize!({
      ...useOfflineStore.getState(),
      syncInProgress: true,
    });

    expect(persistido).not.toHaveProperty("syncInProgress");
    expect(persistido).toHaveProperty("queue");
  });

  it("discardTransaction saca la tx congelada de la cola", async () => {
    enqueue("order", "/api/orders/OID/items", "items-3", 1000);
    mockApi.post.mockRejectedValue({
      response: { status: 409, data: { error: "Conflicto" } },
    });

    await syncOfflineQueue();
    expect(useOfflineStore.getState().getFailedTransactions()).toHaveLength(1);

    useOfflineStore.getState().discardTransaction("items-3");

    expect(useOfflineStore.getState().queue).toHaveLength(0);
  });
});
