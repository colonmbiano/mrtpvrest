// Capa de dominio retail de MODA+: habla con /api/retail/v1 y /api/employees/login,
// y traduce el catálogo del backend a la forma de producto que consume la UI.

import { apiFetch } from "./api";
import { setToken, clearToken } from "./token-vault";
import { setTenant, getTenant, getDeviceKey, clearTenant } from "./tenant";

const SIZES = ["XS", "S", "M", "L", "XL"];

// Tonos de muestra por nombre de color (igual que la paleta `swatch` de la UI),
// para pintar el thumbnail aunque el backend no mande imagen.
const TONE: Record<string, string> = {
  Beige: "#efe7da", Blanco: "#f4f4f1", "Verde Olivo": "#5a6b3e", Negro: "#23262a",
  Gris: "#e9eaec", "Azul Claro": "#dde6f0", Camel: "#e9d8c2", Perla: "#efece2",
  Canela: "#e6cdb2", Azul: "#cdd9ea", Rojo: "#e9c9c4", Verde: "#cfe0c4",
};
const toneFor = (color?: string | null) => (color && TONE[color]) || "#e9eaec";

// ── Tipos del backend (parciales, lo que usamos) ─────────────────────────────
export interface BackendSku {
  id: string;
  sku: string;
  barcode?: string | null;
  size?: string | null;
  color?: string | null;
  material?: string | null;
  price: number | string;
  cost?: number | string | null;
  stockBalances?: { qty: number | string; minQty?: number | string }[];
}
export interface BackendProduct {
  id: string;
  name: string;
  category?: string | null;
  brand?: string | null;
  season?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  skus: BackendSku[];
}

// ── Forma que consume la UI MODA+ ────────────────────────────────────────────
export interface UiProduct {
  id: string;
  name: string;
  sku: string;
  cat: string;
  price: number;
  cost: number;
  season: string;
  prov: string;
  desc: string;
  detail: string;
  colors: string[];
  color: string;
  size: string;
  tone: string;
  matrix: Record<string, number[]>;
  // Resolución talla/color → skuId real (para mandar ventas al backend).
  skuByVariant: Record<string, string>;
  live: true;
}

const variantKey = (color: string, size: string) => `${color}::${size}`;

export function mapCatalogToProducts(products: BackendProduct[]): UiProduct[] {
  return products
    .filter((p) => Array.isArray(p.skus) && p.skus.length > 0)
    .map((p) => {
      const colors = [...new Set(p.skus.map((s) => s.color).filter(Boolean) as string[])];
      const skuByVariant: Record<string, string> = {};
      const matrix: Record<string, number[]> = {};
      for (const color of colors.length ? colors : ["Único"]) {
        matrix[color] = SIZES.map(() => 0);
      }
      for (const s of p.skus) {
        const color = s.color || "Único";
        const size = s.size || "Única";
        if (!matrix[color]) matrix[color] = SIZES.map(() => 0);
        const qty = Number(s.stockBalances?.[0]?.qty ?? 0);
        const sizeIdx = SIZES.indexOf(size);
        if (sizeIdx >= 0) matrix[color][sizeIdx] += qty;
        else matrix[color].push(qty);
        skuByVariant[variantKey(color, size)] = s.id;
      }
      const first = p.skus[0];
      return {
        id: p.id,
        name: p.name,
        sku: first.sku,
        cat: p.category || "General",
        price: Number(first.price),
        cost: Number(first.cost || 0),
        season: p.season || "Continua",
        prov: p.brand || "—",
        desc: p.description || "",
        detail: [first.material, p.brand].filter(Boolean).join(" · ") || "—",
        colors: colors.length ? colors : ["Único"],
        color: first.color || "Único",
        size: first.size || "Única",
        tone: toneFor(first.color),
        matrix,
        skuByVariant,
        live: true,
      };
    });
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export interface SessionEmployee {
  id: string;
  name: string;
  role: string;
  restaurantId?: string | null;
  locationId?: string | null;
  permissions?: Record<string, boolean>;
}

export async function loginPin(pin: string, locationId: string): Promise<SessionEmployee> {
  const data = await apiFetch<{ token: string; employee: SessionEmployee }>("/api/employees/login", {
    method: "POST",
    body: JSON.stringify({ pin }),
    headers: locationId ? { "x-location-id": locationId } : {},
  });
  if (data?.token) setToken(data.token);
  const emp = data.employee || ({} as SessionEmployee);
  setTenant({
    restaurantId: emp.restaurantId || null,
    locationId: emp.locationId || locationId || null,
  });
  if (typeof window !== "undefined") {
    window.localStorage.setItem("moda-session", JSON.stringify(emp));
    window.localStorage.removeItem("moda-default-pin-hint"); // ya entró, no hace falta el hint
  }
  return emp;
}

export function getSession(): SessionEmployee | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("moda-session");
    return raw ? (JSON.parse(raw) as SessionEmployee) : null;
  } catch {
    return null;
  }
}

export function logout(): void {
  clearToken();
  if (typeof window !== "undefined") window.localStorage.removeItem("moda-session");
}

// ── Setup / vinculación de dispositivo (estilo TPV) ──────────────────────────
// El admin inicia sesión una vez (email+password) y elige la sucursal; queda
// ligada (restaurantId+locationId+nombre) y a partir de ahí solo es login por PIN.
export interface Workspace {
  id: string;            // locationId
  restaurantId: string;
  restaurantName: string;
  businessType: string;
  name: string;          // nombre de la sucursal
}

export async function adminLogin(email: string, password: string): Promise<void> {
  const data = await apiFetch<{ accessToken?: string; token?: string }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  const t = data.accessToken || data.token;
  if (!t) throw new Error("Login sin token");
  setToken(t); // temporal: para consultar las sucursales
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const data = await apiFetch<{ workspaces: Workspace[] }>("/api/workspaces/me");
  return data.workspaces || [];
}

// Liga la sucursal elegida y termina el setup. Limpia el token de admin: el
// dispositivo opera con login por PIN de empleado desde aquí.
export function linkLocation(w: Workspace): void {
  setTenant({ restaurantId: w.restaurantId, locationId: w.id });
  if (typeof window !== "undefined") {
    window.localStorage.setItem("moda-location-name", w.name || "");
    window.localStorage.setItem("moda-restaurant-name", w.restaurantName || "");
  }
  clearToken();
}

// Registro self-serve de una tienda nueva desde MODA+. Crea cuenta (tenant +
// restaurante + sucursal "Principal" + admin con PIN 1234), la marca RETAIL y
// liga el dispositivo. El cajero entra luego con PIN 1234 (cambiable en Ajustes).
export async function registerTenant(input: {
  restaurantName: string;
  ownerName: string;
  email: string;
  password: string;
}): Promise<void> {
  const data = await apiFetch<{
    accessToken?: string;
    restaurant?: { id: string };
    location?: { id: string; name?: string };
  }>("/api/auth/register-tenant", { method: "POST", body: JSON.stringify(input) });
  if (data.accessToken) setToken(data.accessToken);
  const locId = data.location?.id;
  const restId = data.restaurant?.id;
  if (!locId || !restId) throw new Error("Registro sin sucursal");
  // Marcar la sucursal como RETAIL (usa el token recién emitido).
  try {
    await apiFetch(`/api/locations/${locId}/business-type`, {
      method: "PUT",
      body: JSON.stringify({ businessType: "RETAIL" }),
    });
  } catch { /* el negocio se puede marcar luego desde admin */ }
  // Ligar el dispositivo a la sucursal nueva (limpia el token admin).
  linkLocation({
    id: locId,
    restaurantId: restId,
    restaurantName: input.restaurantName,
    name: data.location?.name || "Principal",
    businessType: "RETAIL",
  });
  if (typeof window !== "undefined") window.localStorage.setItem("moda-default-pin-hint", "1234");
}

export function isLinked(): boolean {
  const t = getTenant();
  return Boolean(t.restaurantId && t.locationId);
}

// Lee el hint de PIN inicial SIN borrarlo (un efecto que borra al leer no es
// seguro con StrictMode, que invoca el efecto 2 veces). Se limpia en loginPin.
export function takeDefaultPinHint(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("moda-default-pin-hint");
}

export function getLinkedName(): { location: string; restaurant: string } {
  if (typeof window === "undefined") return { location: "", restaurant: "" };
  return {
    location: window.localStorage.getItem("moda-location-name") || "",
    restaurant: window.localStorage.getItem("moda-restaurant-name") || "",
  };
}

export function unlink(): void {
  clearTenant();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("moda-location-name");
    window.localStorage.removeItem("moda-restaurant-name");
    window.localStorage.removeItem("moda-session");
  }
  clearToken();
}

// ── Catálogo ─────────────────────────────────────────────────────────────────
export async function fetchCatalog(): Promise<UiProduct[]> {
  const { locationId } = getTenant();
  const qs = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
  const data = await apiFetch<{ products: BackendProduct[] }>(`/api/retail/v1/catalog${qs}`);
  return mapCatalogToProducts(data.products || []);
}

// ── Ventas ───────────────────────────────────────────────────────────────────
export interface SaleLineInput { skuId: string; quantity: number; discount?: number }
export interface SalePaymentInput { method: "CASH" | "CARD_PRESENT" | "TRANSFER" | "COURTESY"; amount: number; reference?: string }

export async function createSale(input: {
  lines: SaleLineInput[];
  payments: SalePaymentInput[];
  customerName?: string;
  discount?: number;
  tax?: number;
}): Promise<{ sale: { id: string; folio: string; total: number | string }; idempotent: boolean }> {
  const clientSaleId = `moda-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
  return apiFetch("/api/retail/v1/sales", {
    method: "POST",
    body: JSON.stringify({
      clientSaleId,
      lines: input.lines,
      payments: input.payments,
      customerName: input.customerName,
      discount: input.discount,
      tax: input.tax,
      device: { deviceKey: getDeviceKey(), platform: "WINDOWS", name: "Caja MODA+" },
    }),
  });
}

// Mapeo del método de pago de la UI (español) al enum del backend.
export function toPaymentMethod(label: string): SalePaymentInput["method"] {
  const l = (label || "").toLowerCase();
  if (l.includes("tarjeta") || l.includes("meses") || l.includes("crédito") || l.includes("credito")) return "CARD_PRESENT";
  if (l.includes("transfer") || l.includes("spei") || l.includes("qr") || l.includes("pago")) return "TRANSFER";
  if (l.includes("cortesía") || l.includes("cortesia")) return "COURTESY";
  return "CASH";
}

// ── Caja / turno ─────────────────────────────────────────────────────────────
export interface CashShift {
  id: string;
  status: string;
  openingFloat: number | string;
  openedByName?: string | null;
  movements?: unknown[];
}

export function getActiveShift(): Promise<{ shift: CashShift | null }> {
  const { locationId } = getTenant();
  const qs = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
  return apiFetch(`/api/retail/v1/shifts/active${qs}`);
}

export function openShift(openingFloat: number, blindClose = false): Promise<CashShift> {
  return apiFetch("/api/retail/v1/shifts/open", {
    method: "POST",
    body: JSON.stringify({ openingFloat, blindClose }),
  });
}

export function closeShift(shiftId: string, countedCash: number, notes?: string): Promise<{ shift: CashShift }> {
  return apiFetch(`/api/retail/v1/shifts/${shiftId}/close`, {
    method: "POST",
    body: JSON.stringify({ countedCash, notes }),
  });
}
