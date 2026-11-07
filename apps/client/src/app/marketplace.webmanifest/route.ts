import { isMarketplaceAccountsEnabled, isMarketplaceCatalogEnabled } from '@/lib/config';

// Manifiesto de la app del marketplace (/marketplace.webmanifest). Solo lo enlazan
// las páginas del marketplace (lib/marketplaceApp.ts); sin catálogo no hay app.
// Las banderas son NEXT_PUBLIC_*, fijas en el build: el archivo sale estático.
export const dynamic = 'force-static';

export function GET() {
  if (!isMarketplaceCatalogEnabled()) return new Response('Not found', { status: 404 });
  const icon192 = { src: '/icons/marketplace-192.png', sizes: '192x192', type: 'image/png' };
  const manifest = {
    id: '/',
    name: 'Mercadito Colorines',
    short_name: 'Mercadito',
    description: 'Busca tiendas y productos de tu zona y pide directo en la tienda.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f7f9f8',
    theme_color: '#ff5c35',
    lang: 'es-MX',
    dir: 'ltr',
    categories: ['shopping', 'food'],
    icons: [
      { ...icon192, purpose: 'any' },
      { src: '/icons/marketplace-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/marketplace-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Accesos al mantener presionado el ícono; solo con las cuentas encendidas.
    shortcuts: isMarketplaceAccountsEnabled()
      ? [
          { name: 'Mis pedidos', short_name: 'Pedidos', url: '/cuenta/pedidos', icons: [icon192] },
          { name: 'Mi cuenta', short_name: 'Cuenta', url: '/cuenta', icons: [icon192] },
        ]
      : [],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
  });
}
