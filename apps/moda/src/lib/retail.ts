// Capa de dominio retail de MODA+: habla con /api/retail/v1 y /api/employees/login,
// y traduce el catálogo del backend a la forma de producto que consume la UI.

import { apiFetch } from "./api";
import { setToken, clearToken } from "./token-vault";
import { setTenant, getTenant, getGiro, getDeviceKey, clearTenant } from "./tenant";
import { DEFAULT_GIRO, giroConfig, isGiro, sizesFor, toneFor, type Giro } from "./giro";

// ── Tipos del backend (parciales, lo que usamos) ─────────────────────────────
export interface BackendSku {
  id: string;
  sku: string;
  barcode?: string | null;
  size?: string | null;
  color?: string | null;
  material?: string | null;
  style?: string | null;
  price: number | string;
  cost?: number | string | null;
  // Campos genéricos de inventario (Fase 1). Opcionales: un backend anterior a
  // la migración simplemente no los manda.
  unitOfMeasure?: string | null;
  unitsPerPackage?: number | string | null;
  binLocation?: string | null;
  supplierRef?: string | null;
  priceTiers?: { minQty: number | string; price: number | string }[];
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

// ── Forma que consume la UI de Retail+ ───────────────────────────────────────
// Dos formas según el giro:
//   · useVariantMatrix (ROPA)  → un UiProduct por PRODUCTO, con matriz talla×color.
//   · !useVariantMatrix (resto) → un UiProduct por SKU, con su precio y su código.
// Los campos existen en ambas para no obligar a la UI a ramificar en todos lados;
// lo que cambia es la granularidad de la fila.
export interface UiProduct {
  id: string;
  /** Id del RetailProduct padre (en modo matriz coincide con `id`). */
  productId: string;
  /** Id del RetailSku cuando la fila ES un SKU (modo plano). En modo matriz va
   *  null: el SKU se resuelve por variante con `skuByVariant`. */
  skuId: string | null;
  name: string;
  /** Atributos del SKU ya formateados ("Acero · 1/2\""). Vacío si no aplica. */
  variantLabel: string;
  sku: string;
  /** Código de barras de ESTA fila. En modo matriz, el del primer SKU: para el
   *  código correcto por variante usar `barcodeByVariant`. */
  barcode: string | null;
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
  /** Eje de tallas/medidas de este giro (antes la constante global SIZES). */
  sizes: string[];
  unit: string;
  unitsPerPackage: number | null;
  binLocation: string | null;
  /** Escalones de mayoreo de ESTA fila, ordenados por minQty asc. El POS los
   *  necesita para cotizar el mismo precio que cobrará el backend. */
  priceTiers: PriceTier[];
  matrix: Record<string, number[]>;
  /** Resolución talla/color → skuId real (para mandar ventas al backend). */
  skuByVariant: Record<string, string>;
  /** Resolución talla/color → barcode (para que la etiqueta imprima el código
   *  de la variante y no el del primer SKU). */
  barcodeByVariant: Record<string, string>;
  live: true;
}

const variantKey = (color: string, size: string) => `${color}::${size}`;

const qtyOf = (s: BackendSku) => Number(s.stockBalances?.[0]?.qty ?? 0);
const unitOf = (s: BackendSku) => s.unitOfMeasure || "PZA";

export interface PriceTier { minQty: number; price: number }

const tiersOf = (s: BackendSku): PriceTier[] =>
  (s.priceTiers || [])
    .map((t) => ({ minQty: Number(t.minQty), price: Number(t.price) }))
    .sort((a, b) => a.minQty - b.minQty);

/**
 * Precio unitario según la cantidad: aplica el escalón de mayor minQty que la
 * cantidad alcance; sin escalones, el de lista.
 *
 * ESPEJO EXACTO de `priceFor` en apps/backend/src/routes/retail.routes.js. El
 * backend sigue siendo la autoridad (recalcula y `POST /sales` rechaza la venta
 * si los pagos no cuadran con SU total); esto existe para que el POS pueda
 * COTIZAR lo mismo que se va a cobrar. Si las dos reglas divergen, la venta se
 * rechaza con "Pagos no cuadran con total retail" — que es justo lo que pasaba
 * cuando el POS no conocía los escalones.
 */
export function unitPriceFor(listPrice: number, tiers: PriceTier[] | undefined, quantity: number): number {
  const applicable = (tiers || []).filter((t) => quantity >= t.minQty);
  return applicable.length ? applicable[applicable.length - 1].price : listPrice;
}

function numOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Atributos del SKU en el orden que define el giro, ya formateados. */
function variantLabelFor(s: BackendSku, giro: Giro): string {
  return giroConfig(giro)
    .attrs.map((a) => s[a.key])
    .filter(Boolean)
    .join(" · ");
}

export function mapCatalogToProducts(products: BackendProduct[], giro: Giro = DEFAULT_GIRO): UiProduct[] {
  const cfg = giroConfig(giro);
  const withSkus = products.filter((p) => Array.isArray(p.skus) && p.skus.length > 0);
  return cfg.useVariantMatrix ? mapAsMatrix(withSkus, giro) : mapAsFlatSkus(withSkus, giro);
}

/** ROPA: un producto = una matriz talla×color. */
function mapAsMatrix(products: BackendProduct[], giro: Giro): UiProduct[] {
  const sizes = sizesFor(giro);
  return products.map((p) => {
    const colors = [...new Set(p.skus.map((s) => s.color).filter(Boolean) as string[])];
    const skuByVariant: Record<string, string> = {};
    const barcodeByVariant: Record<string, string> = {};
    const matrix: Record<string, number[]> = {};
    for (const color of colors.length ? colors : ["Único"]) {
      matrix[color] = sizes.map(() => 0);
    }
    for (const s of p.skus) {
      const color = s.color || "Único";
      const size = s.size || "Única";
      if (!matrix[color]) matrix[color] = sizes.map(() => 0);
      const sizeIdx = sizes.indexOf(size);
      if (sizeIdx >= 0) matrix[color][sizeIdx] += qtyOf(s);
      else matrix[color].push(qtyOf(s));
      skuByVariant[variantKey(color, size)] = s.id;
      if (s.barcode) barcodeByVariant[variantKey(color, size)] = s.barcode;
    }
    const first = p.skus[0];
    return {
      id: p.id,
      productId: p.id,
      skuId: null,
      name: p.name,
      variantLabel: "",
      sku: first.sku,
      barcode: first.barcode || null,
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
      sizes,
      unit: unitOf(first),
      unitsPerPackage: numOrNull(first.unitsPerPackage),
      binLocation: first.binLocation || null,
      priceTiers: tiersOf(first),
      matrix,
      skuByVariant,
      barcodeByVariant,
      live: true,
    };
  });
}

/**
 * FERRETERÍA / REFACCIONARIA: el SKU es la unidad vendible, con su propio precio
 * y su propio código de barras. Aplanar en vez de colapsar al primer SKU evita
 * el bug de "todas las variantes cuestan lo que la primera".
 */
function mapAsFlatSkus(products: BackendProduct[], giro: Giro): UiProduct[] {
  const rows: UiProduct[] = [];
  for (const p of products) {
    for (const s of p.skus) {
      const color = s.color || "Único";
      const size = s.size || "Única";
      const variantLabel = variantLabelFor(s, giro);
      rows.push({
        id: s.id, // la fila ES el SKU: su id debe ser único en la lista
        productId: p.id,
        skuId: s.id,
        name: p.name,
        variantLabel,
        sku: s.sku,
        barcode: s.barcode || null,
        cat: p.category || "General",
        price: Number(s.price),
        cost: Number(s.cost || 0),
        season: p.season || "Continua",
        prov: p.brand || "—",
        desc: p.description || "",
        detail: [variantLabel, p.brand].filter(Boolean).join(" · ") || "—",
        colors: [color],
        color,
        size,
        tone: toneFor(s.color),
        sizes: [],
        unit: unitOf(s),
        unitsPerPackage: numOrNull(s.unitsPerPackage),
        binLocation: s.binLocation || null,
        priceTiers: tiersOf(s),
        // Matriz de una celda: `totalStock()` y demás helpers siguen funcionando
        // sin ramificar por giro.
        matrix: { [color]: [qtyOf(s)] },
        skuByVariant: { [variantKey(color, size)]: s.id },
        barcodeByVariant: s.barcode ? { [variantKey(color, size)]: s.barcode } : {},
        live: true,
      });
    }
  }
  return rows;
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
  /** Giro de la tienda. Default ROPA (comportamiento de MODA+). */
  giro?: Giro;
}): Promise<void> {
  const { giro = DEFAULT_GIRO, ...account } = input;
  const data = await apiFetch<{
    accessToken?: string;
    restaurant?: { id: string };
    location?: { id: string; name?: string };
  }>("/api/auth/register-tenant", { method: "POST", body: JSON.stringify(account) });
  if (data.accessToken) setToken(data.accessToken);
  const locId = data.location?.id;
  const restId = data.restaurant?.id;
  if (!locId || !restId) throw new Error("Registro sin sucursal");
  // Dos marcas DISTINTAS y ortogonales (ver docs/plan-retail-multigiro.md):
  //   · Location.businessType = RETAIL → preset operativo "venta de mostrador".
  //   · RestaurantConfig.retailGiro    → cuál vertical de retail.
  // Ninguna es fatal: ambas se pueden corregir después desde el admin, así que
  // un fallo aquí no debe tirar un registro que ya creó la cuenta.
  try {
    await apiFetch(`/api/locations/${locId}/business-type`, {
      method: "PUT",
      body: JSON.stringify({ businessType: "RETAIL" }),
    });
  } catch { /* el negocio se puede marcar luego desde admin */ }
  try {
    await apiFetch("/api/retail/v1/config/giro", {
      method: "PUT",
      headers: { "x-restaurant-id": restId },
      body: JSON.stringify({ giro }),
    });
  } catch { /* el giro se puede cambiar luego desde admin */ }
  setTenant({ giro });
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
// El catálogo es también el canal por el que llega el giro (RestaurantConfig.
// retailGiro): es la primera llamada del POS y ya viaja en cada arranque, así
// que no hace falta un round-trip extra. Se cachea en localStorage para que la
// UI no arranque en ropa y salte a ferretería al resolver el fetch.
export async function fetchCatalog(): Promise<UiProduct[]> {
  const { locationId } = getTenant();
  const qs = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
  const data = await apiFetch<{ products: BackendProduct[]; giro?: string }>(
    `/api/retail/v1/catalog${qs}`,
  );
  // Un backend anterior a la Fase 1 no manda `giro`: se conserva el cacheado.
  const giro: Giro = isGiro(data.giro) ? data.giro : getGiro();
  setTenant({ giro });
  return mapCatalogToProducts(data.products || [], giro);
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
export interface CashMovement {
  id?: string;
  type: "CASH_IN" | "CASH_OUT" | "EXPENSE";
  amount: number | string;
  reason?: string | null;
  category?: string | null;
  createdAt?: string;
}
export interface CashShift {
  id: string;
  status: string;
  openingFloat: number | string;
  openedByName?: string | null;
  closedAt?: string | null;
  blindClose?: boolean;
  blindHidden?: boolean;
  countedCash?: number | string | null;
  expectedCash?: number | string | null;
  difference?: number | string | null;
  movements?: CashMovement[];
  location?: { id: string; name: string } | null;
}
export interface ShiftTotals {
  totalCashSales: number;
  totalCardSales: number;
  totalTransferSales: number;
  totalCashIn: number;
  totalCashOut: number;
  salesCount: number;
  expectedCash?: number | null;
  blindHidden?: boolean;
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

export function cashMovement(
  shiftId: string,
  m: { type: "CASH_IN" | "CASH_OUT" | "EXPENSE"; amount: number; reason?: string; category?: string },
): Promise<CashMovement> {
  return apiFetch(`/api/retail/v1/shifts/${shiftId}/cash-movement`, {
    method: "POST",
    body: JSON.stringify(m),
  });
}

// Corte en vivo del turno (totales calculados). expectedCash/ventas vienen null
// si es corte ciego y el empleado no es admin (blindHidden:true).
export function getShiftSummary(shiftId: string): Promise<{ shift: CashShift; totals: ShiftTotals | null }> {
  return apiFetch(`/api/retail/v1/shifts/${shiftId}/summary`);
}

// ── Autorización de supervisor (override por PIN) ─────────────────────────────
// Valida contra el backend (no PINs hardcodeados): un supervisor de la sucursal
// con el permiso canónico autoriza. `permission` debe ser uno de los 6 canónicos.
export interface OverrideResult { token: string; supervisor: { id: string; name: string }; expiresIn: number }
export function verifyPermission(pin: string, permission: string): Promise<OverrideResult> {
  return apiFetch("/api/employees/verify-permission", {
    method: "POST",
    body: JSON.stringify({ pin, permission }),
  });
}
