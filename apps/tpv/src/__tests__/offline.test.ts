/**
 * offline.test.ts
 * Pruebas de apiOrQueue: decide entre llamar al backend o encolar la
 * transacción. Foco en la apertura de turno offline (type 'shift').
 * Ejecutar: pnpm --filter @mrtpvrest/tpv test
 */
import { apiOrQueue, shiftActionQueued, syncOfflineQueue } from "@/lib/offline";
import useOfflineStore from "@/store/useOfflineStore";

// Mock del axios singleton.
jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { post: jest.fn(), put: jest.fn(), get: jest.fn() },
}));

import api from "@/lib/api";
const mockApi = api as jest.Mocked<typeof api>;

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
  useOfflineStore.getState().clearQueue();
  // El candado es estado compartido del store: si un test lo deja en true,
  // el guard de syncOfflineQueue hace salir temprano al siguiente.
  useOfflineStore.getState().setSyncInProgress(false);
  setOnline(true);
});

describe("apiOrQueue — apertura de turno offline", () => {
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

  it("una tx congelada no bloquea el cierre de turno", async () => {
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
    // Pase 2: ya no hay predecesor vivo → el cierre entra.
    await syncOfflineQueue();

    const postedPaths = mockApi.post.mock.calls.map((c) => c[0]);
    expect(postedPaths).toContain("/api/shifts/current/close");
    expect(useOfflineStore.getState().getUnsyncedTransactions()).toHaveLength(0);
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
