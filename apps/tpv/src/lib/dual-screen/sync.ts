/**
 * sync.ts
 * Sincroniza las promos remotas (gestionadas desde el admin) hacia esta
 * terminal. Descarga las imágenes y las cachea como Blob en IndexedDB para
 * que el carrusel funcione offline. Las promos locales de la terminal se
 * conservan intactas.
 */
import api from "@/lib/api";
import { getApiUrl } from "@/lib/config";
import {
  getDualScreenConfig,
  setDualScreenConfig,
  isLocal,
  PromoSlide,
} from "./config";
import { getPromoImage, savePromoImage } from "./promo-store";

// Base del backend. Se mantiene como referencia; las llamadas usan el cliente
// `api` (que ya inyecta Authorization + x-restaurant-id), pero algunos entornos
// pueden quererlo explícito.
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  getApiUrl() ||
  "https://master-burguers-production.up.railway.app";

/**
 * AJUSTABLE: key del JWT del login PIN del TPV. El cliente `api` ya resuelve el
 * token automáticamente (sessionStorage `tpv-access-token` → localStorage
 * `accessToken` → `tpv-employee-token`); esta función queda como referencia
 * por si se necesita el token crudo en otro lugar.
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    sessionStorage.getItem("tpv-access-token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("tpv-employee-token")
  );
}

interface RemotePromo {
  id: string;
  imageUrl: string;
  title?: string | null;
  subtitle?: string | null;
  order: number;
  active: boolean;
  updatedAt?: string;
}

/**
 * Descarga las promos del negocio y refresca la config local. Si la red falla
 * (offline) NO toca nada: conserva el cache existente.
 */
export async function syncRemotePromos(): Promise<void> {
  let remote: RemotePromo[];
  try {
    const res = await api.get<RemotePromo[]>("/api/promos");
    remote = Array.isArray(res.data) ? res.data : [];
  } catch {
    // Offline o error: conservar cache, no modificar nada.
    return;
  }

  const previous = getDualScreenConfig();
  const previousById = new Map(previous.promos.map((p) => [p.id, p]));

  const remoteSlides: PromoSlide[] = [];

  for (const promo of remote) {
    const prev = previousById.get(promo.id);
    const changed = !prev || prev.updatedAt !== promo.updatedAt;
    let cached = await getPromoImage(promo.id);

    // Descargar la imagen solo si es nueva, cambió `updatedAt`, o no está cacheada.
    if ((changed || !cached) && promo.imageUrl) {
      try {
        const imgRes = await fetch(promo.imageUrl, { cache: "no-cache" });
        if (imgRes.ok) {
          const blob = await imgRes.blob();
          await savePromoImage(promo.id, blob);
          cached = blob;
        }
      } catch {
        /* sin red para esta imagen — se usará el cache si existe */
      }
    }

    remoteSlides.push({
      id: promo.id,
      source: "remote",
      title: promo.title ?? undefined,
      subtitle: promo.subtitle ?? undefined,
      imageUrl: promo.imageUrl,
      updatedAt: promo.updatedAt,
    });
  }

  const localSlides = previous.promos.filter(isLocal);

  setDualScreenConfig({ promos: [...remoteSlides, ...localSlides] });
}
