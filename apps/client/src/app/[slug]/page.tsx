import { notFound } from 'next/navigation';
import { MOCK_CATEGORIES } from './mockMenu';
import StorefrontClient from './StorefrontClient';

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  'http://localhost:5000';

type ThemeConfig = { theme?: string; primaryColor?: string } | null;

type StoreInfo = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  hasWebStore: boolean;
  whatsappNumber: string | null;
  themeConfig: ThemeConfig;
};

async function fetchStore(slug: string): Promise<StoreInfo | null> {
  try {
    const res = await fetch(
      `${API}/api/store/info?r=${encodeURIComponent(slug)}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) return null;
    return (await res.json()) as StoreInfo;
  } catch {
    return null;
  }
}

export default async function StorefrontPage({
  params,
}: {
  params: { slug: string };
}) {
  const store = await fetchStore(params.slug);
  if (!store || !store.hasWebStore) notFound();

  const primary = store.themeConfig?.primaryColor || '#ff5c35';

  return (
    <div
      style={{ ['--primary' as string]: primary } as React.CSSProperties}
      className="min-h-screen bg-gray-50"
    >
      <StorefrontClient
        store={{
          id: store.id,
          name: store.name,
          logo: store.logo,
          whatsappNumber: store.whatsappNumber,
          primaryColor: primary,
        }}
        categories={MOCK_CATEGORIES}
      />
    </div>
  );
}
