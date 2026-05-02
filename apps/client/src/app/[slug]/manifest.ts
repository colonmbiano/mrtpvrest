import type { MetadataRoute } from 'next';
import { getTenantConfig } from '@/lib/tenant';

/**
 * Manifest PWA dinámico, generado por tenant.
 *
 * Next.js App Router invoca esta función automáticamente cuando un
 * navegador pide `/{slug}/manifest.webmanifest`. Reactivo al `slug`
 * de la ruta dinámica padre — cada restaurante recibe su propio
 * manifest con su nombre, color e icono.
 */
export default async function manifest({
  params,
}: {
  params: { slug: string };
}): Promise<MetadataRoute.Manifest> {
  const slug = params.slug;
  const tenant = await getTenantConfig(slug);

  return {
    name: tenant.name,
    short_name: tenant.shortName,
    description: `Pedidos en línea de ${tenant.name}`,
    start_url: `/${slug}`,
    scope: `/${slug}`,
    id: `/${slug}`,
    display: 'standalone',
    orientation: 'portrait',
    theme_color: tenant.themeColor,
    background_color: '#000000',
    lang: 'es-MX',
    dir: 'ltr',
    categories: ['food', 'shopping', 'lifestyle'],
    icons: [
      {
        src: tenant.iconUrl,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: tenant.iconUrl,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: tenant.iconUrl,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Mi carrito',
        short_name: 'Carrito',
        description: 'Ver mis productos seleccionados',
        url: `/${slug}?view=cart`,
      },
    ],
  };
}
