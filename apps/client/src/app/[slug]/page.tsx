import { notFound } from 'next/navigation';
import { MochiTheme } from '@/components/themes/MochiTheme';
import { BentoTheme } from '@/components/themes/BentoTheme';
import { PocketTheme } from '@/components/themes/PocketTheme';
import { getApiUrl } from '@/lib/config';
import StorefrontClient from './StorefrontClient';

const API = getApiUrl();

type StoreInfo = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  hasWebStore: boolean;
  whatsappNumber: string | null;
  themeConfig: {
    theme?: string;
    primaryColor?: string;
  } | null;
};

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
  params: { slug: string };
}) {
  const [store, menu, locations] = await Promise.all([
    fetchStore(params.slug),
    fetchMenu(params.slug),
    fetchLocations(params.slug),
  ]);

  if (!store || !store.hasWebStore) notFound();

  const primary = store.themeConfig?.primaryColor || '#ff5c35';
  const theme = store.themeConfig?.theme || 'DEFAULT';

  const data = { info: store, menu, locations };

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
    </div>
  );
}
