import { notFound } from 'next/navigation';
import { MochiTheme } from '@/components/themes/MochiTheme';
import { BentoTheme } from '@/components/themes/BentoTheme';
import { PocketTheme } from '@/components/themes/PocketTheme';
import { getApiUrl } from '@/lib/config';
import StorefrontClient from './StorefrontClient';
import InstallPWABanner from '@/components/InstallPWABanner';

const API = getApiUrl();

type StoreInfo = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  hasWebStore: boolean;
  whatsappNumber: string | null;
  // El backend (GET /api/store/info) devuelve estos campos planos:
  storefrontTheme?: string | null;
  primaryColor?: string | null;
  // Retrocompat: algunas respuestas antiguas anidaban el tema aquí.
  themeConfig?: {
    theme?: string;
    primaryColor?: string;
  } | null;
};

// El backend mapea el enum de la DB a alias (MOCHI→KAWAII, BENTO→HALO,
// POCKET→BRUTALIST). Aquí normalizamos cualquier variante al nombre canónico
// que usa el render de abajo. Sin esto el tema nunca coincide y cae a DEFAULT.
function normalizeTheme(raw?: string | null): 'MOCHI' | 'BENTO' | 'POCKET' | 'DEFAULT' {
  const map: Record<string, 'MOCHI' | 'BENTO' | 'POCKET' | 'DEFAULT'> = {
    MOCHI: 'MOCHI', KAWAII: 'MOCHI',
    BENTO: 'BENTO', HALO: 'BENTO',
    POCKET: 'POCKET', BRUTALIST: 'POCKET',
    DEFAULT: 'DEFAULT',
  };
  return map[(raw || '').toUpperCase()] || 'DEFAULT';
}

async function fetchStore(slug: string): Promise<StoreInfo | null> {
  try {
    const res = await fetch(
      `${API}/api/store/info?r=${encodeURIComponent(slug)}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    return (await res.json()) as StoreInfo;
  } catch {
    return null;
  }
}

async function fetchMenu(slug: string) {
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

async function fetchLocations(slug: string) {
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

export default async function StorefrontPage({
  params,
}: {
  // Next.js 15+/16: params es asíncrono y DEBE await-earse. Acceder a
  // params.slug de forma síncrona devuelve undefined -> fetchStore(undefined)
  // -> 404 para CUALQUIER slug. Este era el bug que tiraba 404 en toda tienda.
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [store, menu, locations] = await Promise.all([
    fetchStore(slug),
    fetchMenu(slug),
    fetchLocations(slug),
  ]);

  if (!store || !store.hasWebStore) notFound();

  const primary = store.primaryColor || store.themeConfig?.primaryColor || '#ff5c35';
  const theme = normalizeTheme(store.storefrontTheme || store.themeConfig?.theme);

  // Los componentes de tema tipan info.themeConfig; lo sintetizamos a partir
  // de los campos planos para mantener compatibilidad de tipos y runtime.
  const info = { ...store, themeConfig: { theme, primaryColor: primary } };
  const data = { info, menu, locations };

  return (
    <div
      style={{ ['--color-primary' as string]: primary } as React.CSSProperties}
      className="min-h-screen bg-white"
    >
      {theme === 'MOCHI' && <MochiTheme data={data} />}
      {theme === 'BENTO' && <BentoTheme data={data} />}
      {theme === 'POCKET' && <PocketTheme data={data} />}
      
      {/* Fallback to legacy client if no modern theme is selected or during transition */}
      {theme === 'DEFAULT' && (
        <div style={{ ['--primary' as string]: primary } as React.CSSProperties}>
          <StorefrontClient
            store={{
              id: store.id,
              name: store.name,
              logo: store.logo,
              whatsappNumber: store.whatsappNumber,
              primaryColor: primary,
              slug: store.slug,
            }}
            categories={menu.categories || []}
          />
        </div>
      )}

      {/* PWA — banner flotante de instalación con branding del tenant */}
      <InstallPWABanner
        title={`Instala ${store.name}`}
        description="Tu menú a un toque, sin abrir el navegador."
        accentColor={primary}
      />
    </div>
  );
}
