/**
 * Tests del token-vault en modo fallback (web/jsdom, sin plugin nativo):
 * debe comportarse exactamente como el almacenamiento legacy de siempre.
 * El camino nativo (secure storage) se prueba con el plugin mockeado.
 */
import {
  initTokenVault,
  getToken,
  getTokenSync,
  setToken,
  __resetTokenVaultForTests,
} from "@/lib/token-vault";
import { Capacitor } from "@capacitor/core";

// Puente nativo simulado: `get` NUNCA resuelve, que es justo el modo de falla
// que colgaba la app entera (el timeout de axios no cubre los interceptores,
// y el interceptor de request hace await getToken()).
const colgado = { get: jest.fn(), set: jest.fn(), remove: jest.fn() };
jest.mock("capacitor-secure-storage-plugin", () => ({
  get SecureStoragePlugin() {
    return colgado;
  },
}));
jest.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: jest.fn(() => false),
    isPluginAvailable: jest.fn(() => false),
  },
}));

const mockCapacitor = Capacitor as jest.Mocked<typeof Capacitor>;

beforeEach(() => {
  __resetTokenVaultForTests();
  localStorage.clear();
  sessionStorage.clear();
  // Por defecto: web/jsdom sin plugin (comportamiento legacy de siempre).
  mockCapacitor.isNativePlatform.mockReturnValue(false);
  mockCapacitor.isPluginAvailable.mockReturnValue(false);
  colgado.get.mockReset();
  colgado.set.mockReset();
  colgado.remove.mockReset();
});

describe("token-vault (fallback web)", () => {
  it("setToken escribe las tres llaves legacy y el cache en memoria", async () => {
    await setToken("jwt-1");
    expect(getTokenSync()).toBe("jwt-1");
    expect(sessionStorage.getItem("tpv-access-token")).toBe("jwt-1");
    expect(localStorage.getItem("accessToken")).toBe("jwt-1");
    expect(localStorage.getItem("tpv-employee-token")).toBe("jwt-1");
  });

  it("setToken(null) limpia memoria y llaves legacy", async () => {
    await setToken("jwt-1");
    await setToken(null);
    expect(getTokenSync()).toBeNull();
    expect(sessionStorage.getItem("tpv-access-token")).toBeNull();
    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("tpv-employee-token")).toBeNull();
  });

  it("getToken hidrata desde las llaves legacy existentes (sesión previa)", async () => {
    localStorage.setItem("accessToken", "jwt-legacy");
    expect(await getToken()).toBe("jwt-legacy");
  });

  it("el cache en memoria se actualiza síncronamente al llamar setToken", () => {
    void setToken("jwt-rapido");
    // Sin await: una request disparada inmediatamente después ya ve el token.
    expect(getTokenSync()).toBe("jwt-rapido");
  });

  it("initTokenVault es idempotente", async () => {
    const a = initTokenVault();
    const b = initTokenVault();
    expect(a).toBe(b);
    await a;
  });
});

// Regresión: el puente nativo de Capacitor no tiene timeout propio, y el
// interceptor de request de api.ts hace `await getToken()`. Un puente colgado
// dejaba pendiente TODA request de la app — y como readyPromise está
// memoizado, quedaba muerta hasta reiniciar. El chip "Sincronizando" no se
// apagaba nunca porque el replay se colgaba antes de llegar al adapter.
describe("token-vault — puente nativo colgado", () => {
  beforeEach(() => {
    mockCapacitor.isNativePlatform.mockReturnValue(true);
    mockCapacitor.isPluginAvailable.mockReturnValue(true);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("getToken resuelve por timeout en vez de colgarse, cayendo a legacy", async () => {
    localStorage.setItem("accessToken", "jwt-legacy");
    colgado.get.mockReturnValue(new Promise(() => {})); // nunca resuelve

    const pendiente = getToken();
    await jest.advanceTimersByTimeAsync(6000);

    await expect(pendiente).resolves.toBe("jwt-legacy");
  });

  it("setToken tampoco se cuelga si el plugin no contesta", async () => {
    colgado.get.mockRejectedValue(new Error("sin key")); // hidratación OK
    colgado.set.mockReturnValue(new Promise(() => {})); // la escritura cuelga

    const pendiente = setToken("jwt-nuevo");
    await jest.advanceTimersByTimeAsync(12000);

    await expect(pendiente).resolves.toBeUndefined();
    // El token quedó utilizable por el camino legacy pese al cuelgue.
    expect(getTokenSync()).toBe("jwt-nuevo");
  });
});
