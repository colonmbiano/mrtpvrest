/**
 * Resolución de configuración por tenant para uso del Manifest PWA
 * y otros lugares server-side. Devuelve siempre un objeto utilizable
 * (con fallbacks seguros) — nunca lanza, así el manifest no se rompe.
 */

import { getApiUrl } from './config';

export interface TenantConfig {
  /** Nombre completo del restaurante (ej. "Master Burger's") */
  name: string;
  /** Etiqueta corta para la home screen del celular (max 12 chars) */
  shortName: string;
  /** Color hex del acento — usado para el theme_color del manifest */
  themeColor: string;
  /** URL absoluta del icono cuadrado del restaurante (ideal 512x512) */
  iconUrl: string;
}

const FALLBACK: TenantConfig = {
  name: 'Pedidos Online',
  shortName: 'Tienda',
  themeColor: '#FF8400',
  iconUrl: '/icons/icon-512.png',
};

/**
 * Resuelve la configuración de branding de un tenant.
 * Server-only: hace fetch al backend `/api/store/info?r={slug}`.
 *
 * @param slug — segmento dinámico de la URL (`apps/client/src/app/[slug]`).
 */
export async function getTenantConfig(slug: string): Promise<TenantConfig> {
  if (!slug) return FALLBACK;

  try {
    const res = await fetch(
      `${getApiUrl()}/api/store/info?r=${encodeURIComponent(slug)}`,
      { next: { revalidate: 60 } } // cachear 60s para no martillar el backend
    );
    if (!res.ok) return FALLBACK;

    const data = (await res.json()) as {
      name?: string;
      logo?: string | null;
      themeConfig?: { primaryColor?: string } | null;
      accentColor?: string | null;
    };

    const name = data.name || FALLBACK.name;
    return {
      name,
      shortName: name.length > 12 ? name.slice(0, 12) : name,
      themeColor:
        data.themeConfig?.primaryColor ||
        data.accentColor ||
        FALLBACK.themeColor,
      iconUrl: data.logo || FALLBACK.iconUrl,
    };
  } catch {
    return FALLBACK;
  }
}
