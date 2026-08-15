/**
 * Datos públicos de la tienda (server-side).
 *
 * Vive aparte porque lo consumen DOS rutas: el storefront normal (`/[slug]`) y
 * el menú de mesa (`/[slug]/mesa`). Antes estaba dentro de la página del
 * storefront; duplicarlo era la vía rápida a que una ruta se quedara con un
 * contrato viejo del backend.
 */
import { getApiUrl } from './config';

const API = getApiUrl();

// Sucursal pública (subconjunto de lo que devuelve GET /api/store/locations).
export type StoreLocation = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
};

export type DeliveryConfig = {
  mode: 'FLAT' | 'DISTANCE';
  flatFee: number;
  freeFrom: number | null;
  baseFee: number;
  perKm: number;
  freeRadiusKm: number | null;
  maxKm: number | null;
  origin: { lat: number; lng: number } | null;
};

export type StoreInfo = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  hasWebStore: boolean;
  whatsappNumber: string | null;
  whatsappOrder?: { enabled: boolean; number: string | null };
  isOpen?: boolean;
  closedMessage?: string | null;
  minOrderAmount?: number;
  estimatedDelivery?: number;
  onlinePayment?: boolean;
  delivery?: DeliveryConfig;
  // El backend (GET /api/store/info) devuelve estos campos planos:
  storefrontTheme?: string | null;
  primaryColor?: string | null;
  heroImageUrl?: string | null;
  currency?: string | null;
  currencyLocale?: string | null;
  // Retrocompat: algunas respuestas antiguas anidaban el tema aquí.
  themeConfig?: {
    theme?: string;
    primaryColor?: string;
  } | null;
};

export async function fetchStore(slug: string): Promise<StoreInfo | null> {
  const res = await fetch(
    `${API}/api/store/info?r=${encodeURIComponent(slug)}`,
    { next: { revalidate: 0 } }
  );
  // 404 = la tienda no existe → notFound()/not-found.tsx. Cualquier otro fallo
  // (red / 5xx) se PROPAGA para que lo capture error.tsx (con reintento), en vez
  // de mostrarse como un 404 permanente ante un problema transitorio.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`store/info respondió ${res.status}`);
  return (await res.json()) as StoreInfo;
}

export async function fetchMenu(slug: string) {
  try {
    const res = await fetch(
      `${API}/api/store/menu?r=${encodeURIComponent(slug)}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return { categories: [] };
    return await res.json();
  } catch {
    return { categories: [] };
  }
}

export async function fetchLocations(slug: string) {
  try {
    const res = await fetch(
      `${API}/api/store/locations?r=${encodeURIComponent(slug)}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/**
 * Número de mesa que se MUESTRA, leído del payload del token del QR.
 *
 * El token es `base64url("<tableId>.<número>").<firma>` (lo emite y verifica el
 * backend, ver apps/backend/src/lib/table-qr.js). Aquí solo se decodifica para
 * poner la etiqueta: la firma NO se valida en el cliente — no tenemos la llave
 * ni hace falta, porque el pedido lo rechaza el backend si el token no cuadra.
 * Lo que sí se gana es que la etiqueta y el vínculo real salen del mismo blob.
 */
export function tableNumberFromToken(token: string): string | null {
  try {
    const payload = token.slice(0, token.lastIndexOf('.'));
    if (!payload) return null;
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    const number = decoded.slice(decoded.lastIndexOf('.') + 1);
    return /^\d+$/.test(number) ? number : null;
  } catch {
    return null;
  }
}
