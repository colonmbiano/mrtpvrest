import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import MarketplaceFirstOrder from '@/components/MarketplaceFirstOrder';
import { getPublicTestCatalog, isTestStoreSlug } from '@/lib/marketplace-test-order';
import { canUseLocalTestOrders } from '@/lib/marketplace-test-storage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Tienda · Primer pedido de prueba | MRTPVREST',
  robots: { index: false, follow: false },
};

export default async function CommercePreview({
  params,
}: { params: Promise<{ slug: string }> }) {
  if (!canUseLocalTestOrders()) notFound();
  const { slug } = await params;
  if (!isTestStoreSlug(slug)) notFound();
  const catalog = await getPublicTestCatalog(slug).catch(() => null);
  if (catalog) return <MarketplaceFirstOrder store={catalog} />;
  return <main className="mx-auto max-w-xl p-8 text-center">
      <h1 className="text-2xl font-black">No se pudo cargar el menú público.</h1>
      <p className="mt-3 text-slate-600">El catálogo puede estar temporalmente indisponible.</p>
      <Link className="mt-4 inline-block font-bold text-orange-600 underline" href="/">Volver al Marketplace</Link>
    </main>;
}
