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

beforeEach(() => {
  __resetTokenVaultForTests();
  localStorage.clear();
  sessionStorage.clear();
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
