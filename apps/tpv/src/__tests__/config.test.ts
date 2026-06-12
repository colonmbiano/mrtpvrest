// Tests de la validación de API URL: https siempre; http solo hacia hosts
// privados/dev. Un override o config remota insegura cae al siguiente nivel.
import { sanitizeApiUrl, getApiUrl, DEFAULT_API_URL } from "@/lib/config";

describe("sanitizeApiUrl", () => {
  it("acepta https hacia cualquier host", () => {
    expect(sanitizeApiUrl("https://api.mrtpvrest.com")).toBe("https://api.mrtpvrest.com");
    expect(sanitizeApiUrl("https://staging.example.com:8443")).toBe("https://staging.example.com:8443");
  });

  it("acepta http solo hacia hosts privados/dev", () => {
    expect(sanitizeApiUrl("http://localhost:3001")).toBe("http://localhost:3001");
    expect(sanitizeApiUrl("http://10.0.2.2:3001")).toBe("http://10.0.2.2:3001");
    expect(sanitizeApiUrl("http://192.168.1.50:3001")).toBe("http://192.168.1.50:3001");
    expect(sanitizeApiUrl("http://172.20.0.5")).toBe("http://172.20.0.5");
  });

  it("rechaza http hacia hosts públicos y esquemas raros", () => {
    expect(sanitizeApiUrl("http://api.mrtpvrest.com")).toBeNull();
    expect(sanitizeApiUrl("http://evil.example.com")).toBeNull();
    expect(sanitizeApiUrl("http://172.32.0.1")).toBeNull(); // fuera del rango 172.16-31
    expect(sanitizeApiUrl("ftp://192.168.1.1")).toBeNull();
    expect(sanitizeApiUrl("no-es-una-url")).toBeNull();
  });
});

describe("getApiUrl con override inseguro", () => {
  afterEach(() => localStorage.clear());

  it("ignora un override http público y cae al default", () => {
    localStorage.setItem("apiBaseUrl", "http://evil.example.com");
    expect(getApiUrl()).toBe(process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL);
  });

  it("respeta un override https válido", () => {
    localStorage.setItem("apiBaseUrl", "https://otro.mrtpvrest.com");
    expect(getApiUrl()).toBe("https://otro.mrtpvrest.com");
  });

  it("respeta un override http de LAN (dev)", () => {
    localStorage.setItem("apiBaseUrl", "http://192.168.1.77:3001");
    expect(getApiUrl()).toBe("http://192.168.1.77:3001");
  });
});
