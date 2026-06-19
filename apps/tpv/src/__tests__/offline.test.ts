/**
 * offline.test.ts
 * Pruebas de apiOrQueue: decide entre llamar al backend o encolar la
 * transacción. Foco en la apertura de turno offline (type 'shift').
 * Ejecutar: pnpm --filter @mrtpvrest/tpv test
 */
import { apiOrQueue } from "@/lib/offline";
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
