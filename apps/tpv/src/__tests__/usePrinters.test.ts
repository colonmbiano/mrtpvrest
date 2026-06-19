/**
 * usePrinters.test.ts
 * La impresión es local (TCP 9100), pero la config se baja del backend.
 * Verificamos que el cache local-first la mantenga viva offline.
 * Ejecutar: pnpm --filter @mrtpvrest/tpv test
 */
import { renderHook, waitFor } from "@testing-library/react";
import { usePrinters } from "@/hooks/usePrinters";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
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

const PRINTER = {
  id: "p1",
  name: "Caja",
  ip: "192.168.1.50",
  port: 9100,
  type: "CASHIER",
  printerGroups: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.keys(store).forEach((k) => delete store[k]);
  store["locationId"] = "loc-1";
});

describe("usePrinters — cache local-first", () => {
  it("cachea la lista tras un fetch exitoso", async () => {
    mockApi.get.mockResolvedValueOnce({ data: [PRINTER] });

    const { result } = renderHook(() => usePrinters());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.printers).toHaveLength(1);
    expect(store["tpv-printers-cache-loc-1"]).toContain("192.168.1.50");
  });

  it("offline (fetch falla) con cache previo: mantiene la lista, no la vacía", async () => {
    // Sembramos el cache como si una sesión anterior ya hubiera bajado la config.
    store["tpv-printers-cache-loc-1"] = JSON.stringify([
      { ...PRINTER, printerGroupIds: [], printerGroupRefs: [] },
    ]);
    mockApi.get.mockRejectedValueOnce({ code: "ERR_NETWORK" });

    const { result } = renderHook(() => usePrinters());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.printers).toHaveLength(1);
    expect(result.current.printers[0]!.ip).toBe("192.168.1.50");
  });

  it("offline sin cache: queda vacío (avisará sin impresoras)", async () => {
    mockApi.get.mockRejectedValueOnce({ code: "ERR_NETWORK" });

    const { result } = renderHook(() => usePrinters());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    expect(result.current.printers).toHaveLength(0);
  });
});
