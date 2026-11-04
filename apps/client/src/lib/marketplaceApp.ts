import type { Metadata } from 'next';

// La app instalable del marketplace (PWA): manifiesto e íconos que llevan sus
// páginas (portada, Mi cuenta y registro). Las tiendas no los heredan: cada una
// conserva sus metadatos. Los PNG salen de scripts/generate-icons.mjs.
export const MARKETPLACE_MANIFEST_PATH = '/marketplace.webmanifest';

export const marketplaceAppMetadata: Pick<Metadata, 'manifest' | 'icons' | 'appleWebApp'> = {
  manifest: MARKETPLACE_MANIFEST_PATH,
  icons: {
    icon: [
      { url: '/icons/marketplace-icon.svg', type: 'image/svg+xml' },
      { url: '/icons/marketplace-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/marketplace-apple-touch-icon.png',
  },
  // La cabecera del marketplace es blanca: la barra de estado de iOS va normal.
  appleWebApp: { capable: true, title: 'MRTPVREST', statusBarStyle: 'default' },
};
