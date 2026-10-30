import type { Metadata } from "next";
import { redirect } from "next/navigation";
import MarketplaceHomeV2 from "@/components/MarketplaceHomeV2";
import { getMarketplaceApiUrl, isMarketplaceCatalogEnabled, isMarketplaceIsolated, isMarketplacePreviewDemo, isMarketplaceLivePreviewEnabled } from "@/lib/config";
import { loadCatalog, parseCatalogParams } from "@/lib/marketplace";
import { loadPreviewCatalog } from "@/lib/marketplace-preview";
import { loadLivePreviewCatalog } from "@/lib/marketplace-live-preview";

// Búsqueda y páginas salen de la URL en cada request; nada se prerenderiza.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Marketplace | MRTPVREST",
    description: "Busca tiendas y productos y pide directo en la tienda.",
    // La copia aislada nunca debe indexarse.
    robots: isMarketplaceIsolated() || isMarketplacePreviewDemo() ? { index: false, follow: false } : undefined,
  };
}

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isMarketplaceCatalogEnabled()) {
    // Sin catálogo habilitado se conserva el comportamiento productivo:
    // quien entra a client.mrtpvrest.com directamente va al dominio principal.
    redirect("https://mrtpvrest.com");
  }

  const { state, queryTooLong } = parseCatalogParams(await searchParams);
  // La demostración de Preview es completamente aislada de API y bases reales.
  // En staging, la API v1 puede habilitarse explícitamente sin cambiar legacy.
  const previewDemo = isMarketplacePreviewDemo();
  const livePreview = isMarketplaceLivePreviewEnabled();
  const storesSource = process.env.NEXT_PUBLIC_MARKETPLACE_STORES_V1 === 'true' ? 'v1' : 'legacy';
  const { stores, products } = livePreview
    ? await loadLivePreviewCatalog(state, queryTooLong)
    : previewDemo
      ? loadPreviewCatalog(state, queryTooLong)
      : await loadCatalog(getMarketplaceApiUrl(), state, queryTooLong, { storesSource });

  return (
    <MarketplaceHomeV2
      state={state}
      stores={stores}
      products={products}
      isolated={isMarketplaceIsolated()}
      previewDemo={previewDemo}
      livePreview={livePreview}
    />
  );
}
