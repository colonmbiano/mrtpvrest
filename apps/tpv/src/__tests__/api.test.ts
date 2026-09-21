const mockGetToken = jest.fn<Promise<string | null>, []>();
const mockSetToken = jest.fn<Promise<void>, [string | null]>();
const mockMarkAvailable = jest.fn();
const mockMarkUnavailable = jest.fn();

jest.mock("@/lib/token-vault", () => ({
  getToken: () => mockGetToken(),
  setToken: (token: string | null) => mockSetToken(token),
  initTokenVault: jest.fn(async () => undefined),
}));

jest.mock("@/lib/config", () => ({ getApiUrl: () => "https://api.test" }));
jest.mock("@/lib/tenant", () => ({
  getTenantIds: () => ({ restaurantId: "rest-1", locationId: "loc-1" }),
}));
jest.mock("@/lib/overrideTokens", () => ({
  consumePendingOverride: () => null,
}));
jest.mock("@/lib/backend-availability", () => ({
  isBackendCircuitOpen: () => false,
  markBackendAvailable: () => mockMarkAvailable(),
  markBackendUnavailable: () => mockMarkUnavailable(),
}));

import api, {
  AUTH_TOKEN_MISSING,
  TPV_AUTH_REQUIRED_EVENT,
} from "@/lib/api";

function okAdapter() {
  return jest.fn(async (config) => ({
    data: { ok: true },
    status: 200,
    statusText: "OK",
    headers: {},
    config,
  }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetToken.mockResolvedValue("jwt-test");
  mockSetToken.mockResolvedValue(undefined);
  localStorage.clear();
  sessionStorage.clear();
});
describe("API TPV — guardia de autenticación", () => {
  it("permite tiempos largos para IA sin ampliar el timeout de caja", async () => {
    const adapter = okAdapter();
    await api.post("/api/ai/scan-menu", {}, { adapter });
    await api.get("/api/shifts/active", { adapter });
    expect(adapter.mock.calls[0]![0].timeout).toBe(120_000);
    expect(adapter.mock.calls[1]![0].timeout).toBe(15_000);
  });
  it("no envía una petición protegida cuando falta el JWT", async () => {
    mockGetToken.mockResolvedValue(null);
    const adapter = okAdapter();

    await expect(api.get("/api/orders/admin", { adapter })).rejects.toMatchObject({
      code: AUTH_TOKEN_MISSING,
    });

    expect(adapter).not.toHaveBeenCalled();
  });

  it("permite el endpoint público de login sin JWT", async () => {
    mockGetToken.mockResolvedValue(null);
    const adapter = okAdapter();

    await expect(
      api.post("/api/employees/login", { pin: "1234" }, { adapter }),
    ).resolves.toMatchObject({ status: 200 });

    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("respeta un Bearer explícito durante la configuración inicial", async () => {
    mockGetToken.mockResolvedValue(null);
    const adapter = okAdapter();

    await expect(
      api.get("/api/admin/locations", {
        adapter,
        headers: { Authorization: "Bearer setup-token" },
      }),
    ).resolves.toMatchObject({ status: 200 });

    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0]![0].headers.get("Authorization")).toBe(
      "Bearer setup-token",
    );
  });

  it("permite consultar la identidad del dispositivo sin JWT humano", async () => {
    mockGetToken.mockResolvedValue(null);
    const adapter = okAdapter();

    await expect(
      api.post(
        "/api/devices/identity",
        { deviceToken: "device-token" },
        { adapter },
      ),
    ).resolves.toMatchObject({ status: 200 });

    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it("un 401 invalida toda la sesión y solicita PIN", async () => {
    const authRequired = jest.fn();
    window.addEventListener(TPV_AUTH_REQUIRED_EVENT, authRequired);
    const adapter = jest.fn(async (config) =>
      Promise.reject({
        config,
        response: {
          status: 401,
          data: { code: "token_invalid", error: "Token inválido" },
        },
      }),
    );

    try {
      await expect(api.get("/api/orders/admin", { adapter })).rejects.toBeTruthy();
    } finally {
      window.removeEventListener(TPV_AUTH_REQUIRED_EVENT, authRequired);
    }

    expect(mockSetToken).toHaveBeenCalledWith(null);
    expect(authRequired).toHaveBeenCalledTimes(1);
    expect(document.cookie).not.toContain("tpv-session-active=true");
  });
});
